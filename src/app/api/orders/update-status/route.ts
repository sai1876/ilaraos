// [INTERNAL] - Restricted order state command for authorized outlet staff.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';
import { awardFulfillmentRewards } from '@/server/orders/awardFulfillmentRewards';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const schema = z.object({
  order_id: z.string().trim().min(1).max(128),
  next_status: z.enum([
    'accepted', 'preparing', 'ready', 'dispatched', 'out_for_delivery',
    'completed', 'cancelled', 'rejected',
  ]).optional(),
  payment_status: z.enum(['paid', 'unpaid']).optional(),
  payment_method: z.enum(['cash', 'upi', 'card', 'wallet']).optional(),
  rush_held: z.boolean().optional(),
  rider_id: z.string().trim().min(1).max(128).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
}).strict().refine(
  value => Boolean(value.next_status || value.payment_status || value.rider_id)
    || typeof value.rush_held === 'boolean',
  { message: 'At least one status field is required' },
).superRefine((value, context) => {
  if (value.payment_status === 'paid' && !value.payment_method) {
    context.addIssue({ code: 'custom', message: 'Payment method is required', path: ['payment_method'] });
  }
  if (value.payment_status === 'unpaid' && value.payment_method) {
    context.addIssue({ code: 'custom', message: 'Payment method is not allowed', path: ['payment_method'] });
  }
});

const transitions: Record<string, string[]> = {
  pending: ['accepted', 'preparing', 'ready', 'completed', 'cancelled', 'rejected'],
  confirmed: ['accepted', 'preparing', 'ready', 'completed', 'cancelled', 'rejected'],
  accepted: ['preparing', 'ready', 'completed', 'cancelled', 'rejected'],
  preparing: ['ready', 'completed', 'cancelled', 'rejected'],
  ready: ['dispatched', 'out_for_delivery', 'completed', 'cancelled'],
  dispatched: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
};
const terminalStates = new Set(['delivered', 'completed', 'cancelled', 'rejected']);
const exactRoles = new Set(['staff', 'manager', 'admin', 'owner']);
const elevatedRoles = new Set(['manager', 'admin', 'owner']);

class StatusCommandError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['staff', 'manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload format' }, { status: 400 });
    }
    const data = parsed.data;
    const commandLimit = await rateLimitDurable(`order-status:${actor.uid}`, 60, 5 * 60 * 1000);
    if (!commandLimit.success) {
      return NextResponse.json(
        { success: false, error: commandLimit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: commandLimit.source === 'unavailable' ? 503 : 429 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(data.order_id);
    const result = await adminDb.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw new StatusCommandError(404, 'Order not found');
      const order = orderSnapshot.data()!;
      const outletId = typeof order.outlet_id === 'string' ? order.outlet_id : '';
      if (!['admin', 'owner'].includes(actor.role) && (!actor.outletId || actor.outletId !== outletId)) {
        throw new StatusCommandError(403, 'Forbidden for this outlet');
      }

      const previousStatus = String(order.status || 'confirmed');
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const update: Record<string, unknown> = { updated_at: Date.now() };
      let paymentCapture: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> } | null = null;

      if (data.next_status && data.next_status !== previousStatus) {
        if (terminalStates.has(previousStatus)) {
          throw new StatusCommandError(409, 'Terminal order states are immutable');
        }
        if (!transitions[previousStatus]?.includes(data.next_status)) {
          throw new StatusCommandError(409, 'Invalid order status transition');
        }
        if (['cancelled', 'rejected'].includes(data.next_status) && !data.reason) {
          throw new StatusCommandError(400, 'A reason is required');
        }
        if (order.order_type === 'delivery' && data.next_status === 'completed') {
          throw new StatusCommandError(409, 'Delivery requires customer proof');
        }
        const effectivelyPaid = order.is_paid === true
          || order.payment_status === 'paid'
          || data.payment_status === 'paid';
        if (data.next_status === 'completed' && !effectivelyPaid) {
          throw new StatusCommandError(409, 'Payment must be captured before completion');
        }
        if (data.next_status === 'out_for_delivery' && !(data.rider_id || order.rider_id)) {
          throw new StatusCommandError(409, 'A rider must be assigned');
        }
        update.status = data.next_status;
        if (data.next_status === 'completed') update.completed_at = Date.now();
        changes.status = { from: previousStatus, to: data.next_status };
      }

      if (data.payment_status) {
        if (!elevatedRoles.has(actor.role)) {
          throw new StatusCommandError(403, 'Insufficient payment permissions');
        }
        const alreadyPaid = order.is_paid === true || order.payment_status === 'paid';
        if (data.payment_status === 'unpaid' && alreadyPaid) {
          throw new StatusCommandError(409, 'Captured payments cannot be reversed through order status');
        }
        if (data.payment_status === 'paid' && alreadyPaid) {
          if (order.payment_method && order.payment_method !== data.payment_method) {
            throw new StatusCommandError(409, 'Payment method conflicts with the captured payment');
          }
        } else if (data.payment_status === 'paid') {
          let amountPaise: number | null = null;
          try {
            amountPaise = readCanonicalMoneyPaise(order, 'gross_amount', 'gross_amount_paise');
          } catch {}

          if (!amountPaise || amountPaise <= 0) {
            try {
              amountPaise = readCanonicalMoneyPaise(order, 'total_amount', 'total_paise');
            } catch {}
          }

          if (!amountPaise || amountPaise <= 0) {
            const rawAmount = typeof order.gross_amount === 'number' ? order.gross_amount :
                             (typeof order.total_amount === 'number' ? order.total_amount :
                             (typeof order.price === 'number' ? order.price : 0));
            if (rawAmount > 0) {
              amountPaise = Math.round(rawAmount * 100);
            }
          }

          if (!amountPaise || amountPaise <= 0) throw new StatusCommandError(409, 'Order amount is invalid');
          const amount = amountPaise / 100;
          const paymentRef = adminDb!.collection('payment_ledger').doc(`order_${data.order_id}_capture`);
          const paymentSnapshot = await transaction.get(paymentRef);
          if (paymentSnapshot.exists) throw new StatusCommandError(409, 'Payment ledger is inconsistent');
          const capturedAt = Date.now();
          paymentCapture = {
            ref: paymentRef,
            data: {
              payment_id: `order_${data.order_id}_capture`,
              order_id: data.order_id,
              user_id: order.user_id,
              outlet_id: outletId,
              amount,
              amount_paise: amountPaise,
              currency: 'INR',
              payment_method: data.payment_method!,
              status: 'captured',
              captured_by: actor.uid,
              captured_at: capturedAt,
              created_at: capturedAt,
            },
          };
          update.is_paid = true;
          update.payment_status = 'paid';
          update.payment_method = data.payment_method;
          update.paid_at = capturedAt;
          update.cash_paid = data.payment_method === 'cash' ? amount : 0;
          changes.is_paid = { from: false, to: true };
        }
      }

      if (typeof data.rush_held === 'boolean' && data.rush_held !== Boolean(order.rush_held)) {
        update.rush_held = data.rush_held;
        changes.rush_held = { from: Boolean(order.rush_held), to: data.rush_held };
      }

      if (data.rider_id && data.rider_id !== order.rider_id) {
        if (!elevatedRoles.has(actor.role) || order.order_type !== 'delivery') {
          throw new StatusCommandError(403, 'Insufficient rider assignment permissions');
        }
        const riderRef = adminDb!.collection('staff_directory').doc(data.rider_id);
        const riderSnapshot = await transaction.get(riderRef);
        const rider = riderSnapshot.data();
        const riderStatus = String(rider?.status || rider?.account_status || '').toLowerCase();
        const riderOutlet = rider?.outlet_id || rider?.outlet || rider?.assigned_hatch;
        if (!riderSnapshot.exists || rider?.role !== 'rider' || riderStatus !== 'active') {
          throw new StatusCommandError(409, 'Selected rider is unavailable');
        }
        if (riderOutlet !== outletId) {
          throw new StatusCommandError(409, 'Rider belongs to another outlet');
        }
        update.rider_id = data.rider_id;
        changes.rider_id = { from: order.rider_id, to: data.rider_id };
      }

      if (data.next_status && ['cancelled', 'rejected'].includes(data.next_status)) {
        const canRestoreInventory = ['pending', 'confirmed', 'accepted'].includes(previousStatus);
        if (canRestoreInventory && order.inventory_refunded !== true) {
          const movementQuery = adminDb!.collection('stock_movements')
            .where('order_id', '==', data.order_id);
          const movementSnapshot = await transaction.get(movementQuery);
          const deductions = movementSnapshot.docs.filter(document => {
            const movement = document.data();
            return Number(movement.quantity_delta) < 0
              && (!movement.outlet_id || movement.outlet_id === outletId)
              && (!movement.reason || movement.reason === 'order_created');
          });
          const stockRefs = deductions.map(document => adminDb!.collection('inventory').doc(String(document.data().stock_id)));
          const reversalRefs = deductions.map(document => adminDb!.collection('stock_movements').doc(`cancel_${document.id}`));
          const [stockSnapshots, reversalSnapshots] = await Promise.all([
            Promise.all(stockRefs.map(reference => transaction.get(reference))),
            Promise.all(reversalRefs.map(reference => transaction.get(reference))),
          ]);
          deductions.forEach((document, index) => {
            if (reversalSnapshots[index].exists) return;
            const movement = document.data();
            const stockSnapshot = stockSnapshots[index];
            if (!stockSnapshot.exists) throw new StatusCommandError(409, 'Inventory restoration failed');
            const stock = stockSnapshot.data()!;
            if (stock.outlet_id && stock.outlet_id !== outletId) {
              if (process.env.NODE_ENV === 'production') {
                throw new StatusCommandError(409, 'Inventory outlet mismatch');
              }
            }
            const quantityBefore = Number(stock.current_quantity || 0);
            const restoredQuantity = Math.abs(Number(movement.quantity_delta));
            const quantityAfter = quantityBefore + restoredQuantity;
            transaction.update(stockRefs[index], { current_quantity: quantityAfter, last_updated: Date.now() });
            transaction.create(reversalRefs[index], {
              movement_id: `cancel_${document.id}`,
              order_id: data.order_id,
              outlet_id: outletId,
              stock_id: movement.stock_id,
              quantity_before: quantityBefore,
              quantity_delta: restoredQuantity,
              quantity_after: quantityAfter,
              reason: 'order_cancelled_before_preparation',
              reversed_movement_id: document.id,
              created_at: Date.now(),
            });
          });
          update.inventory_refunded = true;
          update.is_stock_refunded = true;
          update.inventory_refunded_at = Date.now();
        } else if (!canRestoreInventory) {
          update.inventory_reversal_status = 'not_restored_after_preparation';
        }
      }

      let pointsEarned = 0;
      if (data.next_status === 'completed') {
        const reward = await awardFulfillmentRewards(transaction, adminDb!, data.order_id, order);
        Object.assign(update, reward.orderUpdates);
        pointsEarned = reward.pointsEarned;
      }

      if (paymentCapture) transaction.create(paymentCapture.ref, paymentCapture.data);
      if (Object.keys(changes).length > 0) transaction.update(orderRef, update);
      return { previousStatus, outletId, changes, nextStatus: update.status || previousStatus, pointsEarned };
    });

    if (Object.keys(result.changes).length > 0) {
      await logBusinessEvent({
        event_type: 'order_status_changed',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: data.order_id,
        order_id: data.order_id,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: data.next_status && ['cancelled', 'rejected'].includes(data.next_status) ? 'warning' : 'info',
        source: 'api',
        metadata: {
          previous_status: result.previousStatus,
          next_status: result.nextStatus,
          changed_fields: Object.keys(result.changes),
          ...(data.reason ? { reason: data.reason } : {}),
          ...(result.pointsEarned > 0 ? { points_earned: result.pointsEarned } : {}),
        },
      });
    }

    return NextResponse.json({
      success: true,
      order_id: data.order_id,
      changed_fields: Object.keys(result.changes),
    });
  } catch (error) {
    if (error instanceof StatusCommandError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[UPDATE STATUS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
