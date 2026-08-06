import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import {
  processRefundTransaction,
  RefundCommandError,
} from '@/server/refunds/processRefund';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

const MAX_BODY_BYTES = 32 * 1024;
const exactRoles = new Set(['manager', 'admin', 'owner']);

const schema = z.object({
  idempotency_key: z.string().uuid(),
  order_id: z.string().trim().min(1).max(128),
  refund_scope: z.enum(['full_order', 'items', 'custom_amount']),
  refund_amount: z.number().finite().positive().max(1_000_000).optional(),
  reason: z.string().trim().min(3).max(300),
  method: z.enum(['cash', 'upi', 'card', 'wallet', 'manual']).optional(),
  items: z.array(z.object({
    item_id: z.string().trim().min(1).max(128),
    quantity_refunded: z.number().int().min(1).max(100),
    refund_amount: z.number().finite().positive().max(1_000_000).optional(),
  }).strict()).min(1).max(50).optional(),
}).strict().superRefine((data, context) => {
  if (data.refund_scope === 'items' && !data.items?.length) {
    context.addIssue({ code: 'custom', message: 'Items are required', path: ['items'] });
  }
  if (data.refund_scope !== 'items' && data.items?.length) {
    context.addIssue({ code: 'custom', message: 'Items are not allowed', path: ['items'] });
  }
  if (data.refund_scope === 'custom_amount' && data.refund_amount === undefined) {
    context.addIssue({ code: 'custom', message: 'Refund amount is required', path: ['refund_amount'] });
  }
});

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }

    const limit = await rateLimitDurable(`refund-payment:${actor.uid}`, 30, 5 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const input = parsed.data;
    const orderRef = adminDb.collection('orders').doc(input.order_id);
    const result = await adminDb.runTransaction(transaction => processRefundTransaction(transaction, orderRef, {
      refund_scope: input.refund_scope,
      refund_amount: input.refund_amount,
      reason: input.reason,
      method: input.method || 'manual',
      requestItems: input.items,
      uid: actor.uid,
      idempotencyKey: input.idempotency_key,
      actorRole: actor.role,
      actorOutletId: actor.outletId,
    }));

    if (!result.replayed) {
      await logBusinessEvent({
        event_type: 'refund_processed',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: input.order_id,
        order_id: input.order_id,
        ...(result.outlet_id ? { outlet_id: result.outlet_id } : {}),
        severity: 'warning',
        source: 'api',
        metadata: {
          refund_scope: input.refund_scope,
          refund_amount: result.canonicalRefundAmount,
          refund_status: result.nextRefundStatus,
          refund_method: input.method || 'manual',
          ...(input.refund_scope === 'items' ? { item_count: result.itemCount } : {}),
        },
      });
    }

    return NextResponse.json({
      success: true,
      order_id: input.order_id,
      refund_id: result.refundId,
      refund_amount: result.canonicalRefundAmount,
      refunded_amount: result.newRefundedAmount,
      refund_status: result.nextRefundStatus,
      replayed: result.replayed,
    }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof RefundCommandError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[REFUND PAYMENT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
