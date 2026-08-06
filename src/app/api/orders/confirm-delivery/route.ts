// [INTERNAL] - Assigned riders confirm delivery with a one-time proof.
import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { awardFulfillmentRewards } from '@/server/orders/awardFulfillmentRewards';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const schema = z.object({
  order_id: z.string().trim().min(1).max(128),
  otp: z.string().regex(/^\d{4,6}$/),
  payment_method: z.enum(['cash', 'upi', 'card', 'wallet']).optional(),
}).strict();

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['rider']);
    if (actor instanceof NextResponse) return actor;
    if (actor.role !== 'rider') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Delivery service unavailable' }, { status: 503 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid delivery proof' }, { status: 400 });
    }

    const [actorLimit, orderLimit] = await Promise.all([
      rateLimitDurable(`delivery-confirm-rider:${actor.uid}`, 20, 15 * 60 * 1000),
      rateLimitDurable(`delivery-confirm-order:${parsed.data.order_id}`, 8, 15 * 60 * 1000),
    ]);
    if (!actorLimit.success || !orderLimit.success) {
      const unavailable = actorLimit.source === 'unavailable' || orderLimit.source === 'unavailable';
      return NextResponse.json(
        { success: false, error: unavailable ? 'Delivery service unavailable' : 'Too many attempts' },
        { status: unavailable ? 503 : 429 },
      );
    }

    const secret = process.env.DELIVERY_OTP_SECRET;
    if (!secret || secret.length < 32) {
      return NextResponse.json({ success: false, error: 'Delivery service unavailable' }, { status: 503 });
    }

    const orderRef = adminDb.collection('orders').doc(parsed.data.order_id);
    const result = await adminDb.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) return { status: 404 as const, outcome: 'not_found' as const };
      const order = orderSnapshot.data()!;
      const actorRiderIds = new Set([actor.uid, actor.staffId].filter(Boolean));
      if (
        order.order_type !== 'delivery'
        || order.status !== 'out_for_delivery'
        || !actorRiderIds.has(order.rider_id)
        || (actor.outletId && order.outlet_id !== actor.outletId)
      ) {
        return { status: 403 as const, outcome: 'forbidden' as const };
      }

      const proof = order.delivery_proof;
      const isLegacy = !proof && typeof order.otp === 'string';
      const attempts = Number(proof?.attempts) || 0;
      if (proof?.consumed === true || attempts >= 5) {
        return { status: 410 as const, outcome: 'expired' as const };
      }
      if (!isLegacy && (typeof proof?.expires_at !== 'number' || proof.expires_at < Date.now())) {
        return { status: 410 as const, outcome: 'expired' as const };
      }

      const submittedHash = crypto.createHmac('sha256', secret)
        .update(`${parsed.data.order_id}:${parsed.data.otp}`)
        .digest('hex');
      const valid = isLegacy
        ? secureEqual(parsed.data.otp, order.otp)
        : typeof proof?.otp_hash === 'string' && secureEqual(submittedHash, proof.otp_hash);

      if (!valid) {
        transaction.update(orderRef, {
          'delivery_proof.attempts': attempts + 1,
          'delivery_proof.last_attempt_at': Date.now(),
        });
        return { status: 403 as const, outcome: 'invalid' as const };
      }

      const now = Date.now();
      const alreadyPaid = order.is_paid === true || order.payment_status === 'paid';
      if (!alreadyPaid && !parsed.data.payment_method) {
        return { status: 409 as const, outcome: 'payment_required' as const };
      }
      if (alreadyPaid && parsed.data.payment_method && order.payment_method
          && order.payment_method !== parsed.data.payment_method) {
        return { status: 409 as const, outcome: 'payment_conflict' as const };
      }
      let paymentCapture: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> } | null = null;
      let capturedAmount = 0;
      if (!alreadyPaid) {
        let amountPaise: number | null;
        try {
          amountPaise = readCanonicalMoneyPaise(order, 'gross_amount', 'gross_amount_paise');
        } catch {
          return { status: 409 as const, outcome: 'payment_conflict' as const };
        }
        if (!amountPaise || amountPaise <= 0) {
          return { status: 409 as const, outcome: 'payment_required' as const };
        }
        const amount = amountPaise / 100;
        capturedAmount = amount;
        const paymentRef = adminDb!.collection('payment_ledger').doc(`order_${parsed.data.order_id}_capture`);
        const paymentSnapshot = await transaction.get(paymentRef);
        if (paymentSnapshot.exists) return { status: 409 as const, outcome: 'payment_conflict' as const };
        paymentCapture = {
          ref: paymentRef,
          data: {
            payment_id: `order_${parsed.data.order_id}_capture`,
            order_id: parsed.data.order_id,
            user_id: order.user_id,
            outlet_id: order.outlet_id,
            amount,
            amount_paise: amountPaise,
            currency: 'INR',
            payment_method: parsed.data.payment_method!,
            status: 'captured',
            captured_by: actor.uid,
            captured_at: now,
            created_at: now,
          },
        };
      }
      const reward = await awardFulfillmentRewards(transaction, adminDb!, parsed.data.order_id, order);
      if (paymentCapture) transaction.create(paymentCapture.ref, paymentCapture.data);
      transaction.update(orderRef, {
        status: 'delivered',
        delivered_at: now,
        completed_at: now,
        updated_at: now,
        'delivery_proof.consumed': true,
        'delivery_proof.consumed_at': now,
        otp: admin.firestore.FieldValue.delete(),
        ...(!alreadyPaid ? {
          is_paid: true,
          payment_status: 'paid',
          payment_method: parsed.data.payment_method,
          paid_at: now,
          cash_paid: parsed.data.payment_method === 'cash' ? capturedAmount : 0,
        } : {}),
        ...reward.orderUpdates,
      });
      return {
        status: 200 as const,
        outcome: 'delivered' as const,
        outletId: order.outlet_id,
        riderId: order.rider_id,
        pointsEarned: reward.pointsEarned,
      };
    });

    if (result.outcome !== 'delivered') {
      const message = result.status === 404
        ? 'Order not found'
        : result.status === 409
          ? 'Payment confirmation is required'
          : 'Invalid or expired delivery proof';
      return NextResponse.json({ success: false, error: message }, { status: result.status });
    }

    if (result.riderId) {
      try {
        const remaining = await adminDb.collection('orders')
          .where('outlet_id', '==', result.outletId)
          .where('rider_id', '==', result.riderId)
          .where('status', '==', 'out_for_delivery')
          .limit(1)
          .get();
        if (remaining.empty) {
          await adminDb.collection('delivery_locations').doc(result.riderId).delete();
        }
      } catch (cleanupError) {
        console.error('[DELIVERY LOCATION CLEANUP ERROR]', cleanupError);
      }
    }

    await logBusinessEvent({
      event_type: 'delivery_confirmed',
      actor_type: 'staff',
      actor_id: actor.uid,
      target_type: 'order',
      target_id: parsed.data.order_id,
      order_id: parsed.data.order_id,
      ...(result.outletId ? { outlet_id: result.outletId } : {}),
      severity: 'info',
      source: 'api',
      metadata: {
        proof: 'otp',
        payment_method: parsed.data.payment_method || 'prepaid',
        ...(result.pointsEarned > 0 ? { points_earned: result.pointsEarned } : {}),
      },
    });

    return NextResponse.json({ success: true, order_id: parsed.data.order_id });
  } catch (error) {
    console.error('[CONFIRM DELIVERY ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
