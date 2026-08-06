// [INTERNAL] - Idempotent compatibility projection for KDS parent status.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

const schema = z.object({ order_id: z.string().trim().min(1).max(128) }).strict();
const roles = new Set([
  'manager', 'admin', 'owner',
  'deep_fryer', 'grill_fryer', 'biryani_master', 'brewer',
]);

class RecalculateError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, [...roles]);
    if (actor instanceof NextResponse) return actor;
    if (!roles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload format' }, { status: 400 });
    }
    const rate = await rateLimitDurable(`kds-recalculate:${actor.uid}`, 120, 5 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { success: false, error: rate.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: rate.source === 'unavailable' ? 503 : 429 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(parsed.data.order_id);
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) throw new RecalculateError(404, 'Order not found');
      const order = snapshot.data()!;
      const outletId = typeof order.outlet_id === 'string' ? order.outlet_id : '';
      if (!['admin', 'owner'].includes(actor.role) && (!actor.outletId || actor.outletId !== outletId)) {
        throw new RecalculateError(403, 'Forbidden for this outlet');
      }
      if (['dispatched', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'rejected'].includes(order.status)) {
        throw new RecalculateError(409, 'Order can no longer be changed in KDS');
      }
      if (!Array.isArray(order.items) || order.items.length === 0) {
        throw new RecalculateError(409, 'Order has no KDS items');
      }
      const allReady = order.items.every((item: Record<string, unknown>) => item.item_status === 'ready');
      const anyStarted = order.items.some((item: Record<string, unknown>) =>
        item.item_status === 'preparing' || item.item_status === 'ready',
      );
      const nextStatus = allReady ? 'ready' : anyStarted ? 'preparing' : 'confirmed';
      const previousStatus = String(order.status || 'confirmed');
      if (nextStatus !== previousStatus) {
        transaction.update(orderRef, { status: nextStatus, updated_at: Date.now() });
      }
      return { previousStatus, nextStatus, changed: nextStatus !== previousStatus, outletId };
    });

    if (result.changed) {
      await logBusinessEvent({
        event_type: 'order_status_changed',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: parsed.data.order_id,
        order_id: parsed.data.order_id,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: 'info',
        source: 'api',
        metadata: {
          previous_status: result.previousStatus,
          next_status: result.nextStatus,
          reason: 'KDS projection repair',
        },
      });
    }

    return NextResponse.json({
      success: true,
      order_id: parsed.data.order_id,
      previous_status: result.previousStatus,
      next_status: result.nextStatus,
      changed: result.changed,
    });
  } catch (error) {
    if (error instanceof RecalculateError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[RECALCULATE KDS STATUS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
