import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireSessionActorApi } from '@/server/auth/requireSessionActor';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

const exactRoles = new Set(['manager', 'admin', 'owner']);
const schema = z.object({
  event_id: z.string().trim().min(1).max(128),
  decision: z.enum(['approved', 'rejected']),
  manager_note: z.string().trim().min(3).max(500).optional(),
}).strict();

class WastageApprovalError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

type EventItem = {
  menu_item_id?: string;
  stock_item_id?: string;
  quantity: number;
  loss_basis: 'menu_item' | 'stock_item';
};

export async function POST(req: Request) {
  try {
    const actor = await requireSessionActorApi(['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const limit = await rateLimitDurable(`wastage-approve:${actor.uid}`, 40, 15 * 60 * 1000);
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
    const db = adminDb;
    const eventRef = db.collection('wastage_events').doc(input.event_id);
    const result = await db.runTransaction(async transaction => {
      const [eventSnapshot, existingMovements] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(db.collection('stock_movements').where('event_id', '==', input.event_id)),
      ]);
      if (!eventSnapshot.exists) throw new WastageApprovalError(404, 'Wastage event not found');
      const event = eventSnapshot.data()!;
      if (event.tenantId !== actor.tenantId) throw new WastageApprovalError(404, 'Wastage event not found');
      const outletId = String(event.outlet_id || '');
      if (!['admin', 'owner'].includes(actor.role)
          && (!actor.outletId || actor.outletId !== outletId)) {
        throw new WastageApprovalError(403, 'Forbidden for this outlet');
      }
      if (event.status === input.decision) {
        return { replayed: true, outletId, deductionOccurred: !existingMovements.empty, event };
      }
      if (event.status !== 'reported') {
        throw new WastageApprovalError(409, 'Wastage event was already reviewed');
      }
      if (!existingMovements.empty || event.inventory_deducted_at) {
        throw new WastageApprovalError(409, 'Inventory deduction state is inconsistent');
      }

      const now = Date.now();
      if (input.decision === 'rejected') {
        transaction.update(eventRef, {
          status: 'rejected',
          approved_by: actor.uid,
          reviewed_at: now,
          ...(input.manager_note ? { manager_note: input.manager_note } : {}),
          updated_at: now,
        });
        return { replayed: false, outletId, deductionOccurred: false, event };
      }

      const items: EventItem[] = Array.isArray(event.items) ? event.items : [];
      const requirements = new Map<string, number>();
      if (event.deduct_inventory && event.deduction_method === 'stock_direct') {
        for (const item of items) {
          if (item.loss_basis === 'stock_item' && item.stock_item_id) {
            requirements.set(item.stock_item_id, (requirements.get(item.stock_item_id) || 0) + Number(item.quantity || 0));
          }
        }
      } else if (event.deduct_inventory && event.deduction_method === 'recipe') {
        const menuItems = items.filter(item => item.loss_basis === 'menu_item' && item.menu_item_id);
        const menuIds = [...new Set(menuItems.map(item => item.menu_item_id!))];
        const menuSnapshots = await Promise.all(menuIds.map(id => transaction.get(db.collection('menu').doc(id))));
        const menuById = new Map(menuSnapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, snapshot.data()!]));
        for (const item of menuItems) {
          const menu = menuById.get(item.menu_item_id!);
          if (!menu || !Array.isArray(menu.recipe)) throw new WastageApprovalError(409, 'Menu recipe is unavailable');
          for (const ingredient of menu.recipe as Array<Record<string, unknown>>) {
            const stockId = typeof ingredient.stock_id === 'string' ? ingredient.stock_id : '';
            const recipeQuantity = typeof ingredient.quantity === 'number' ? ingredient.quantity : 0;
            if (!stockId || !Number.isFinite(recipeQuantity) || recipeQuantity <= 0) {
              throw new WastageApprovalError(409, 'Menu recipe is invalid');
            }
            requirements.set(stockId, (requirements.get(stockId) || 0) + recipeQuantity * item.quantity);
          }
        }
      }

      if (event.deduct_inventory && event.deduction_method !== 'none' && requirements.size === 0) {
        throw new WastageApprovalError(409, 'No inventory requirements were found');
      }
      const stockIds = [...requirements.keys()].sort();
      const stockRefs = stockIds.map(id => db.collection('inventory').doc(id));
      const movementRefs = stockIds.map(id => db.collection('stock_movements').doc(`wastage_${input.event_id}_${id}`));
      const [stockSnapshots, movementSnapshots] = await Promise.all([
        Promise.all(stockRefs.map(reference => transaction.get(reference))),
        Promise.all(movementRefs.map(reference => transaction.get(reference))),
      ]);
      if (movementSnapshots.some(snapshot => snapshot.exists)) {
        throw new WastageApprovalError(409, 'Inventory movement already exists');
      }
      stockSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) throw new WastageApprovalError(409, 'Inventory item is unavailable');
        const stock = snapshot.data()!;
        if (stock.outlet_id && stock.outlet_id !== outletId) {
          throw new WastageApprovalError(403, 'Inventory item belongs to another outlet');
        }
        const currentQuantity = Number(stock.current_quantity);
        const requiredQuantity = requirements.get(stockIds[index])!;
        if (!Number.isFinite(currentQuantity) || currentQuantity < requiredQuantity) {
          throw new WastageApprovalError(409, 'Insufficient inventory for this wastage event');
        }
      });

      stockSnapshots.forEach((snapshot, index) => {
        const stock = snapshot.data()!;
        const currentQuantity = Number(stock.current_quantity);
        const requiredQuantity = requirements.get(stockIds[index])!;
        const nextQuantity = currentQuantity - requiredQuantity;
        transaction.update(stockRefs[index], { current_quantity: nextQuantity, last_updated: now, updated_by: actor.uid });
        transaction.create(movementRefs[index], {
          movement_id: `wastage_${input.event_id}_${stockIds[index]}`,
          stock_id: stockIds[index],
          event_id: input.event_id,
          outlet_id: outletId,
          tenantId: actor.tenantId,
          movement_type: event.event_type === 'missing_item' ? 'wastage' : event.event_type,
          quantity_delta: -requiredQuantity,
          quantity_before: currentQuantity,
          quantity_after: nextQuantity,
          reason_category: event.reason_category,
          actor_id: actor.uid,
          created_at: now,
          ...(event.order_id ? { linked_order_id: event.order_id } : {}),
          ...(event.linked_refund_request_id ? { linked_refund_request_id: event.linked_refund_request_id } : {}),
        });
      });
      transaction.update(eventRef, {
        status: 'approved',
        approved_by: actor.uid,
        approved_at: now,
        updated_at: now,
        ...(input.manager_note ? { manager_note: input.manager_note } : {}),
        ...(requirements.size > 0 ? {
          inventory_deducted_at: now,
          inventory_deduction_ref: `wastage_${input.event_id}`,
        } : {}),
      });
      return { replayed: false, outletId, deductionOccurred: requirements.size > 0, event };
    });

    if (!result.replayed) {
      await logBusinessEvent({
        event_type: input.decision === 'approved' ? 'wastage_event_approved' : 'wastage_event_rejected',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: result.event.order_id || input.event_id,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: input.decision === 'approved' ? 'warning' : 'info',
        source: 'api',
        metadata: {
          event_id: input.event_id,
          decision: input.decision,
          deduction_occurred: result.deductionOccurred,
          deduction_method: result.event.deduction_method,
          item_count: Array.isArray(result.event.items) ? result.event.items.length : 0,
        },
      });
    }
    return NextResponse.json({ success: true, event_id: input.event_id, replayed: result.replayed });
  } catch (error) {
    if (error instanceof WastageApprovalError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[WASTAGE APPROVE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
