import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const exactRoles = new Set(['manager', 'admin', 'owner']);
const schema = z.object({
  request_id: z.string().trim().min(1).max(128),
  payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'wallet', 'manual']),
  payment_reference: z.string().trim().min(1).max(160).optional(),
  payment_note: z.string().trim().max(500).optional(),
}).strict();

class SettlementError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

const storedPaise = (source: Record<string, unknown>, rupeeField: string, paiseField: string): number => {
  try {
    const val = readCanonicalMoneyPaise(source, rupeeField, paiseField);
    if (typeof val === 'number' && Number.isFinite(val)) return val;
  } catch {}

  const rawRupees = source[rupeeField];
  if (typeof rawRupees === 'number' && Number.isFinite(rawRupees) && rawRupees >= 0) {
    return Math.round(rawRupees * 100);
  }
  const rawPaise = source[paiseField];
  if (typeof rawPaise === 'number' && Number.isFinite(rawPaise) && rawPaise >= 0) {
    return Math.round(rawPaise);
  }
  return 0;
};

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

    const limit = await rateLimitDurable(`refund-settlement:${actor.uid}`, 40, 5 * 60 * 1000);
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
    if (['upi', 'bank_transfer'].includes(input.payment_method) && !input.payment_reference) {
      return NextResponse.json({ success: false, error: 'Payment reference is required' }, { status: 400 });
    }

    const db = adminDb;
    const requestRef = db.collection('refund_requests').doc(input.request_id);
    const result = await db.runTransaction(async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new SettlementError(404, 'Refund request not found');
      const requestData = requestSnap.data()!;
      if (requestData.status !== 'approved') {
        throw new SettlementError(409, 'Only approved refund requests can be settled');
      }
      if (!requestData.linked_refund_id || !requestData.order_id) {
        throw new SettlementError(409, 'Refund request is missing its accounting ledger');
      }

      const orderId = String(requestData.order_id);
      const refundId = String(requestData.linked_refund_id);
      const orderRef = db.collection('orders').doc(orderId);
      const ledgerRef = orderRef.collection('refunds').doc(refundId);
      const allLedgersRef = orderRef.collection('refunds');
      const [orderSnap, ledgerSnap, allLedgersSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(ledgerRef),
        transaction.get(allLedgersRef),
      ]);
      if (!orderSnap.exists) throw new SettlementError(404, 'Order not found');
      if (!ledgerSnap.exists) throw new SettlementError(404, 'Refund ledger not found');

      const order = orderSnap.data()!;
      const outletId = String(order.outlet_id || order.outlet || requestData.outlet_id || '');
      if (!['admin', 'owner'].includes(actor.role)
          && (!actor.outletId || actor.outletId !== outletId)) {
        throw new SettlementError(403, 'Forbidden for this outlet');
      }

      const settledAt = Number(requestData.paid_at || Date.now());
      const replayed = requestData.payment_status === 'paid';
      const ledgerUpdates = {
        payment_status: 'paid',
        refund_status: 'paid',
        paid_at: settledAt,
        paid_by: String(requestData.paid_by || actor.uid),
        payment_method: String(requestData.payment_method || input.payment_method),
        ...(requestData.payment_reference || input.payment_reference
          ? { payment_reference: String(requestData.payment_reference || input.payment_reference) }
          : {}),
        ...(requestData.payment_note || input.payment_note
          ? { payment_note: String(requestData.payment_note || input.payment_note) }
          : {}),
      };

      let paidRefundPaise = 0;
      let pendingCount = 0;
      allLedgersSnap.docs.forEach((document: FirebaseFirestore.QueryDocumentSnapshot) => {
        const ledger = document.data();
        const isCurrent = document.id === refundId;
        if (isCurrent || ledger.payment_status === 'paid') {
          paidRefundPaise += storedPaise(ledger, 'refund_amount', 'refund_amount_paise');
        } else if (ledger.payment_status === 'pending' || ledger.refund_status === 'payment_pending') {
          pendingCount += 1;
        }
      });
      const approvedRefundPaise = order.refunded_amount !== undefined || order.refunded_amount_paise !== undefined
        ? storedPaise(order, 'refunded_amount', 'refunded_amount_paise')
        : storedPaise(order, 'refund_approved_amount', 'refund_approved_amount_paise');
      const paymentStatus = pendingCount === 0 && paidRefundPaise >= approvedRefundPaise
        ? 'paid'
        : 'partial_pending';

      if (!replayed) {
        transaction.update(requestRef, {
          payment_status: 'paid',
          paid_at: settledAt,
          paid_by: actor.uid,
          payment_method: input.payment_method,
          ...(input.payment_reference ? { payment_reference: input.payment_reference } : {}),
          ...(input.payment_note ? { payment_note: input.payment_note } : {}),
          updated_at: settledAt,
        });
        transaction.update(ledgerRef, ledgerUpdates);
      }
      transaction.update(orderRef, {
        last_refund_paid_at: settledAt,
        refund_paid_amount: paidRefundPaise / 100,
        refund_paid_amount_paise: paidRefundPaise,
        refund_payment_status: paymentStatus,
        updated_at: settledAt,
      });

      return {
        orderId,
        refundId,
        outletId,
        settledAt,
        paidRefundAmount: paidRefundPaise / 100,
        paymentStatus,
        replayed,
      };
    });

    if (!result.replayed) {
      await logBusinessEvent({
        event_type: 'refund_payment_marked_done',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: result.orderId,
        order_id: result.orderId,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: 'warning',
        source: 'api',
        metadata: {
          request_id: input.request_id,
          refund_id: result.refundId,
          payment_method: input.payment_method,
          has_reference: Boolean(input.payment_reference),
          order_refund_payment_status: result.paymentStatus,
        },
      });
    }

    return NextResponse.json({
      success: true,
      request_id: input.request_id,
      refund_id: result.refundId,
      payment_status: 'paid',
      order_refund_payment_status: result.paymentStatus,
      refund_paid_amount: result.paidRefundAmount,
      paid_at: result.settledAt,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof SettlementError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[REFUND SETTLEMENT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
