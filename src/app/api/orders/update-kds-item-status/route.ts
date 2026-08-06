// [INTERNAL] - Outlet-scoped KDS item state command.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';
import { canAccessKdsStation, isKdsRole, KDS_ROLE_LIST } from '@/server/operations/kdsAccess';

const schema = z.object({
  order_id: z.string().trim().min(1).max(128),
  item_index: z.number().int().min(0).max(49),
  item_id: z.string().trim().min(1).max(128),
  item_status: z.enum(['preparing', 'ready']),
  reason: z.string().trim().min(3).max(300).optional(),
}).strict();

const forwardItemStates: Record<string, string[]> = {
  ordered: ['preparing', 'ready'],
  preparing: ['ready'],
  ready: [],
};

class KdsCommandError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, [...KDS_ROLE_LIST]);
    if (actor instanceof NextResponse) return actor;
    if (!isKdsRole(actor.role)) {
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
    const rate = await rateLimitDurable(`kds-item:${actor.uid}`, 120, 5 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { success: false, error: rate.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: rate.source === 'unavailable' ? 503 : 429 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(data.order_id);
    const result = await adminDb.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw new KdsCommandError(404, 'Order not found');
      const order = orderSnapshot.data()!;
      const outletId = typeof order.outlet_id === 'string' ? order.outlet_id : '';
      if (!['admin', 'owner'].includes(actor.role) && (!actor.outletId || actor.outletId !== outletId)) {
        throw new KdsCommandError(403, 'Forbidden for this outlet');
      }
      if (['dispatched', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'rejected'].includes(order.status)) {
        throw new KdsCommandError(409, 'Order can no longer be changed in KDS');
      }
      if (!Array.isArray(order.items) || data.item_index >= order.items.length) {
        throw new KdsCommandError(400, 'Invalid order item');
      }

      const targetItem = order.items[data.item_index];
      if (targetItem?.item_id !== data.item_id) {
        throw new KdsCommandError(409, 'Stale order item update');
      }
      if (!canAccessKdsStation(actor.role, targetItem.station)) {
        throw new KdsCommandError(403, 'Forbidden station');
      }

      const previousItemStatus = String(targetItem.item_status || 'ordered');
      if (previousItemStatus !== data.item_status
        && !forwardItemStates[previousItemStatus]?.includes(data.item_status)) {
        throw new KdsCommandError(409, 'Invalid KDS state transition');
      }
      if (previousItemStatus === data.item_status) {
        return {
          changed: false,
          previousItemStatus,
          nextOrderStatus: order.status,
          previousOrderStatus: order.status,
          outletId,
        };
      }

      const items = [...order.items];
      items[data.item_index] = { ...targetItem, item_status: data.item_status };
      const allReady = items.length > 0 && items.every(item => item.item_status === 'ready');
      const anyStarted = items.some(item => ['preparing', 'ready'].includes(item.item_status));
      const nextOrderStatus = allReady ? 'ready' : anyStarted ? 'preparing' : 'confirmed';
      transaction.update(orderRef, {
        items,
        status: nextOrderStatus,
        updated_at: Date.now(),
      });
      return {
        changed: true,
        previousItemStatus,
        nextOrderStatus,
        previousOrderStatus: order.status,
        outletId,
      };
    });

    if (result.changed) {
      await logBusinessEvent({
        event_type: 'kds_item_status_changed',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order_item',
        target_id: `${data.order_id}:${data.item_id}`,
        order_id: data.order_id,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: 'info',
        source: 'api',
        metadata: {
          item_index: data.item_index,
          previous_status: result.previousItemStatus,
          next_status: data.item_status,
          parent_previous_status: result.previousOrderStatus,
          parent_next_status: result.nextOrderStatus,
          ...(data.reason ? { reason: data.reason } : {}),
        },
      });
    }

    return NextResponse.json({
      success: true,
      order_id: data.order_id,
      item_index: data.item_index,
      previous_status: result.previousItemStatus,
      next_status: data.item_status,
      order_status: result.nextOrderStatus,
      changed: result.changed,
    });
  } catch (error) {
    if (error instanceof KdsCommandError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[UPDATE KDS ITEM STATUS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
