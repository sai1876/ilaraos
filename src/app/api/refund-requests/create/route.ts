import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import type { RefundRequestDocument } from '@/lib/types';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const schema = z.object({
  idempotency_key: z.string().uuid(),
  order_id: z.string().trim().min(1).max(128),
  request_scope: z.enum(['full_order', 'items', 'custom_amount']),
  requested_amount: z.number().finite().positive().max(1_000_000).optional(),
  reason_category: z.enum(['wrong_item', 'missing_item', 'bad_quality', 'late_order', 'cancelled_order', 'payment_issue', 'other']),
  customer_note: z.string().trim().min(5).max(500),
  items: z.array(z.object({
    item_id: z.string().trim().min(1).max(128),
    quantity: z.number().int().min(1).max(100),
    requested_amount: z.number().finite().positive().max(1_000_000).optional(),
  }).strict()).min(1).max(50).optional(),
}).strict().superRefine((data, context) => {
  if (data.request_scope === 'items' && !data.items?.length) {
    context.addIssue({ code: 'custom', message: 'Items are required', path: ['items'] });
  }
  if (data.request_scope !== 'items' && data.items?.length) {
    context.addIssue({ code: 'custom', message: 'Items are not allowed', path: ['items'] });
  }
  if (data.request_scope === 'custom_amount' && data.requested_amount === undefined) {
    context.addIssue({ code: 'custom', message: 'Requested amount is required', path: ['requested_amount'] });
  }
});

class RefundRequestError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

const toPaise = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new RefundRequestError(400, 'Order amount is invalid');
  return Math.round(amount * 100);
};

const storedPaise = (source: Record<string, unknown>, rupeeField: string, paiseField: string): number | null => {
  try {
    return readCanonicalMoneyPaise(source, rupeeField, paiseField);
  } catch {
    throw new RefundRequestError(409, 'Order accounting requires reconciliation');
  }
};

const digest = (value: unknown): string => createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value))
  .digest('hex');

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['customer']);
    if (actor instanceof NextResponse) return actor;
    if (actor.role !== 'customer') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }

    const limit = await rateLimitDurable(`refund-request-create:${actor.uid}`, 10, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    const input = parsed.data;
    const requestId = digest(`${actor.uid}:${input.order_id}:${input.idempotency_key}`).slice(0, 40);
    const commandFingerprint = digest({
      ...input,
      items: input.items ? [...input.items].sort((a, b) => a.item_id.localeCompare(b.item_id)) : undefined,
    });
    const db = adminDb;
    const orderRef = db.collection('orders').doc(input.order_id);
    const requestRef = db.collection('refund_requests').doc(requestId);
    const activeRequestsQuery = db.collection('refund_requests')
      .where('order_id', '==', input.order_id)
      .where('status', '==', 'pending');

    const result = await db.runTransaction(async transaction => {
      const [orderSnap, requestSnap, activeRequestsSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(requestRef),
        transaction.get(activeRequestsQuery),
      ]);
      if (!orderSnap.exists) throw new RefundRequestError(404, 'Order not found');
      if (requestSnap.exists) {
        const existing = requestSnap.data()!;
        if (existing.command_fingerprint !== commandFingerprint) {
          throw new RefundRequestError(409, 'Idempotency key was already used for another request');
        }
        return {
          replayed: true,
          requestedAmount: (storedPaise(existing, 'requested_amount', 'requested_amount_paise') || 0) / 100,
          outletId: String(existing.outlet_id || ''),
        };
      }

      const order = orderSnap.data()!;
      if (order.user_id !== actor.uid) {
        throw new RefundRequestError(403, 'You can only request refunds for your own orders');
      }
      const isPaid = order.is_paid === true || order.payment_status === 'paid' || toPaise(order.cash_paid || 0) > 0;
      if (!isPaid) throw new RefundRequestError(400, 'Cannot request a refund for an unpaid order');
      if (!activeRequestsSnap.empty) {
        throw new RefundRequestError(409, 'An active refund request already exists for this order');
      }

      const totalPaise = storedPaise(order, 'gross_amount', 'gross_amount_paise')
        ?? toPaise(order.total_amount_after_points ?? order.total_amount ?? 0);
      const refundedPaise = storedPaise(order, 'refunded_amount', 'refunded_amount_paise') || 0;
      const remainingPaise = totalPaise - refundedPaise;
      if (remainingPaise <= 0) throw new RefundRequestError(409, 'Order is already fully refunded');

      let requestedPaise = 0;
      let canonicalItems: {
        item_id: string;
        quantity: number;
        requested_amount: number;
        requested_amount_paise: number;
      }[] | undefined;
      if (input.request_scope === 'full_order') {
        requestedPaise = remainingPaise;
      } else if (input.request_scope === 'custom_amount') {
        requestedPaise = toPaise(input.requested_amount);
      } else {
        if (new Set(input.items!.map(item => item.item_id)).size !== input.items!.length) {
          throw new RefundRequestError(400, 'Duplicate item IDs are not allowed');
        }
        const orderItems: Record<string, unknown>[] = Array.isArray(order.items) ? order.items : [];
        canonicalItems = input.items!.map(requestItem => {
          const storedItem = orderItems.find(item => String(item.item_id || item.id || '') === requestItem.item_id);
          if (!storedItem) throw new RefundRequestError(400, `Item ${requestItem.item_id} was not found in the order`);
          const remainingQuantity = Number(storedItem.quantity || 0) - Number(storedItem.refunded_quantity || 0);
          if (requestItem.quantity > remainingQuantity) {
            throw new RefundRequestError(400, `Requested quantity for item ${requestItem.item_id} exceeds the remaining quantity`);
          }
          const itemAmountPaise = (storedPaise(storedItem, 'unit_price', 'unit_price_paise') || 0)
            * requestItem.quantity;
          if (itemAmountPaise <= 0) throw new RefundRequestError(400, 'Order item price is invalid');
          if (requestItem.requested_amount !== undefined
              && toPaise(requestItem.requested_amount) !== itemAmountPaise) {
            throw new RefundRequestError(400, 'Requested item amount does not match the stored order price');
          }
          requestedPaise += itemAmountPaise;
          return {
            item_id: requestItem.item_id,
            quantity: requestItem.quantity,
            requested_amount: itemAmountPaise / 100,
            requested_amount_paise: itemAmountPaise,
          };
        });
      }

      if (requestedPaise <= 0 || requestedPaise > remainingPaise) {
        throw new RefundRequestError(400, 'Requested amount exceeds the remaining refundable amount');
      }
      if (input.request_scope !== 'custom_amount' && input.requested_amount !== undefined
          && toPaise(input.requested_amount) !== requestedPaise) {
        throw new RefundRequestError(400, 'Requested amount does not match the canonical server amount');
      }

      const now = Date.now();
      const outletId = String(order.outlet_id || order.outlet || '');
      const requestDocument: RefundRequestDocument = {
        request_id: requestId,
        order_id: input.order_id,
        user_id: actor.uid,
        outlet_id: outletId,
        request_scope: input.request_scope,
        requested_amount: requestedPaise / 100,
        requested_amount_paise: requestedPaise,
        reason_category: input.reason_category,
        customer_note: input.customer_note,
        ...(canonicalItems ? { items_requested: canonicalItems } : {}),
        status: 'pending',
        command_fingerprint: commandFingerprint,
        created_at: now,
        updated_at: now,
      };
      transaction.create(requestRef, requestDocument);
      return { replayed: false, requestedAmount: requestedPaise / 100, outletId };
    });

    if (!result.replayed) {
      await logBusinessEvent({
        event_type: 'refund_request_created',
        actor_type: 'customer',
        actor_id: actor.uid,
        target_type: 'order',
        target_id: input.order_id,
        order_id: input.order_id,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: 'info',
        source: 'api',
        metadata: {
          action: 'refund_request_created',
          request_id: requestId,
          request_scope: input.request_scope,
          reason_category: input.reason_category,
          requested_amount: result.requestedAmount,
        },
      });
    }

    return NextResponse.json(
      { success: true, request_id: requestId, requested_amount: result.requestedAmount, replayed: result.replayed },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof RefundRequestError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[REFUND REQUEST CREATE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
