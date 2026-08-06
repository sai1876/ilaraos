// [INTERNAL] - Outlet-scoped KDS station item bumping
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { canAccessKdsStation, isKdsRole, KDS_ROLE_LIST } from '@/server/operations/kdsAccess';

const schema = z.object({
  order_id: z.string().trim().min(1).max(128)
}).strict();

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, [...KDS_ROLE_LIST]);
    if (actor instanceof NextResponse) return actor;
    if (!isKdsRole(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
    }
    const { order_id } = parsed.data;

    const limit = await rateLimitDurable(`kds-bump:${actor.uid}`, 60, 5 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const orderRef = adminDb.collection('orders').doc(order_id);
    const result = await adminDb.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) {
        throw new Error('Order not found');
      }
      const order = orderSnapshot.data()!;
      const outletId = typeof order.outlet_id === 'string' ? order.outlet_id : '';
      if (!['admin', 'owner'].includes(actor.role) && (!actor.outletId || actor.outletId !== outletId)) {
        throw new Error('Forbidden for this outlet');
      }
      if (['dispatched', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'rejected'].includes(order.status)) {
        throw new Error('Order can no longer be changed in KDS');
      }

      if (!Array.isArray(order.items)) {
        throw new Error('Invalid order items format');
      }

      let updatedAny = false;
      const items = order.items.map((item: any) => {
        if (canAccessKdsStation(actor.role, item.station) && item.item_status !== 'ready') {
          updatedAny = true;
          return { ...item, item_status: 'ready' };
        }
        return item;
      });

      if (!updatedAny) {
        return { success: true, changed: false };
      }

      const allReady = items.length > 0 && items.every((item: any) => item.item_status === 'ready');
      const anyStarted = items.some((item: any) => ['preparing', 'ready'].includes(item.item_status));
      const nextOrderStatus = allReady ? 'ready' : anyStarted ? 'preparing' : 'confirmed';

      transaction.update(orderRef, {
        items,
        status: nextOrderStatus,
        updated_at: Date.now()
      });

      return { success: true, changed: true, status: nextOrderStatus };
    });

    if (result.changed) {
      await logBusinessEvent({
        event_type: 'kds_station_bump',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'order',
        target_id: order_id,
        severity: 'info',
        source: 'api',
        metadata: { order_id, role: actor.role, next_status: result.status }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
