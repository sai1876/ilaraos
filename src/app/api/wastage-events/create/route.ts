import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const kitchenRoles = new Set(['kitchen', 'chef', 'deep_fryer', 'grill_fryer', 'biryani_master', 'brewer']);
const elevatedRoles = new Set(['manager', 'admin', 'owner']);
const schema = z.object({
  idempotency_key: z.string().uuid(),
  outlet_id: z.string().trim().min(1).max(128).optional(),
  order_id: z.string().trim().min(1).max(128).optional(),
  source_type: z.enum(['customer_complaint', 'kitchen_error', 'prep_damage', 'expired_stock', 'staff_meal', 'manual_adjustment']),
  event_type: z.enum(['remake', 'wastage', 'spoilage', 'missing_item']),
  items: z.array(z.object({
    menu_item_id: z.string().trim().min(1).max(128).optional(),
    stock_item_id: z.string().trim().min(1).max(128).optional(),
    item_name: z.string().trim().max(160).optional(),
    quantity: z.number().finite().positive().max(100_000),
    unit: z.string().trim().max(40).optional(),
    unit_cost_estimate: z.number().finite().nonnegative().max(1_000_000).optional(),
    station: z.string().trim().max(80).optional(),
    loss_basis: z.enum(['menu_item', 'stock_item']),
  }).strict()).min(1).max(50),
  reason_category: z.string().trim().min(2).max(100),
  manager_note: z.string().trim().min(1).max(500),
  document_ids: z.array(z.string()).min(1).max(5),
}).strict().superRefine((data, context) => {
  data.items.forEach((item, index) => {
    if (item.loss_basis === 'menu_item') {
      if (!item.menu_item_id || item.stock_item_id || !Number.isSafeInteger(item.quantity)) {
        context.addIssue({ code: 'custom', message: 'Invalid menu item', path: ['items', index] });
      }
    } else if (!item.stock_item_id || item.menu_item_id || Math.round(item.quantity * 1000) !== item.quantity * 1000) {
      context.addIssue({ code: 'custom', message: 'Invalid stock item', path: ['items', index] });
    }
  });
});

class WastageCommandError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['kitchen', 'manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!kitchenRoles.has(actor.role) && !elevatedRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const limit = await rateLimitDurable(`wastage-create:${actor.uid}`, 30, 15 * 60 * 1000);
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
    const eventId = hash(`${actor.uid}:${input.idempotency_key}`).slice(0, 40);
    const db = adminDb;
    const eventRef = db.collection('wastage_events').doc(eventId);
    const orderRef = input.order_id ? db.collection('orders').doc(input.order_id) : null;
    const itemRefs = input.items.map(item => item.loss_basis === 'menu_item'
      ? db.collection('menu').doc(item.menu_item_id!)
      : db.collection('inventory').doc(item.stock_item_id!));

    const result = await db.runTransaction(async transaction => {
      const [existingSnapshot, orderSnapshot, ...itemSnapshots] = await Promise.all([
        transaction.get(eventRef),
        orderRef ? transaction.get(orderRef) : Promise.resolve(null),
        ...itemRefs.map(reference => transaction.get(reference)),
      ]);
      if (existingSnapshot.exists) {
        const existing = existingSnapshot.data()!;
        if (existing.command_hash !== hash(JSON.stringify(input))) {
          throw new WastageCommandError(409, 'Idempotency key was already used');
        }
        return { replayed: true, outletId: String(existing.outlet_id || '') };
      }
      if (orderRef && !orderSnapshot?.exists) throw new WastageCommandError(404, 'Order not found');
      const order = orderSnapshot?.data();
      const outletId = String(order?.outlet_id || actor.outletId || input.outlet_id || '');
      if (!outletId) throw new WastageCommandError(400, 'Outlet is required');
      if (order?.outlet_id && order.outlet_id !== outletId) throw new WastageCommandError(409, 'Order outlet mismatch');
      if (!['admin', 'owner'].includes(actor.role) && actor.outletId !== outletId) {
        throw new WastageCommandError(403, 'Forbidden for this outlet');
      }
      if (input.outlet_id && input.outlet_id !== outletId) throw new WastageCommandError(409, 'Outlet mismatch');

      const canonicalItems = input.items.map((item, index) => {
        const snapshot = itemSnapshots[index];
        if (!snapshot.exists) throw new WastageCommandError(409, 'Referenced item is unavailable');
        const stored = snapshot.data()!;
        if (item.loss_basis === 'stock_item' && stored.outlet_id && stored.outlet_id !== outletId) {
          throw new WastageCommandError(403, 'Stock item belongs to another outlet');
        }
        let unitCostPaise: number | null = null;
        try {
          unitCostPaise = readCanonicalMoneyPaise(stored, 'cost_per_unit', 'cost_per_unit_paise');
          if (unitCostPaise === null && stored.unit_cost !== undefined) {
            unitCostPaise = readCanonicalMoneyPaise(
              { unit_cost: stored.unit_cost },
              'unit_cost',
              'unit_cost_paise',
            );
          }
        } catch {
          throw new WastageCommandError(409, 'Inventory cost requires reconciliation');
        }
        return {
          ...(item.loss_basis === 'menu_item'
            ? { menu_item_id: snapshot.id }
            : { stock_item_id: snapshot.id }),
          item_name: String(stored.name || 'Inventory item'),
          quantity: item.quantity,
          ...(typeof stored.unit === 'string' ? { unit: stored.unit } : {}),
          ...(unitCostPaise !== null
            ? {
                unit_cost_estimate: unitCostPaise / 100,
                unit_cost_estimate_paise: unitCostPaise,
              }
            : {}),
          ...(typeof stored.station === 'string' ? { station: stored.station } : {}),
          loss_basis: item.loss_basis,
        };
      });

      let deductInventory = false;
      let deductionMethod: 'none' | 'recipe' | 'stock_direct' = 'none';
      if ((input.event_type === 'remake' || input.source_type === 'staff_meal')
          && canonicalItems.some(item => item.loss_basis === 'menu_item')) {
        deductInventory = true;
        deductionMethod = 'recipe';
      } else if (['expired_stock', 'prep_damage'].includes(input.source_type)
          && canonicalItems.some(item => item.loss_basis === 'stock_item')) {
        deductInventory = true;
        deductionMethod = 'stock_direct';
      } else if (input.source_type === 'manual_adjustment') {
        deductInventory = true;
        deductionMethod = canonicalItems.some(item => item.loss_basis === 'stock_item') ? 'stock_direct' : 'recipe';
      }

      const now = Date.now();
      
      const validDocRefs = [];
      let foundPhoto = false;
      for (const docId of input.document_ids) {
        const docRef = db.collection('documents').doc(docId);
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) throw new WastageCommandError(422, `INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
        const docData = docSnap.data()!;
        if (docData.attachment_state !== 'pending_entity') throw new WastageCommandError(422, `INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
        if (docData.related_entity_id !== eventId && docData.related_entity_id !== input.idempotency_key) {
          throw new WastageCommandError(422, `INVALID_EVIDENCE_REFERENCE: relation mismatch`);
        }
        if (docData.document_type === 'wastage_photo') foundPhoto = true;
        validDocRefs.push(docRef);
      }
      
      if (!foundPhoto) {
         throw new WastageCommandError(422, 'REQUIRED_EVIDENCE_MISSING: wastage_photo is required');
      }

      transaction.create(eventRef, {
        event_id: eventId,
        outlet_id: outletId,
        ...(input.order_id ? { order_id: input.order_id } : {}),
        source_type: input.source_type,
        event_type: input.event_type,
        items: canonicalItems,
        reason_category: input.reason_category,
        manager_note: input.manager_note,
        document_ids: input.document_ids,
        reported_by: actor.uid,
        status: 'reported',
        deduct_inventory: deductInventory,
        deduction_method: deductionMethod,
        command_hash: hash(JSON.stringify(input)),
        created_at: now,
        updated_at: now,
      });

      for (const docRef of validDocRefs) {
        transaction.update(docRef, {
          attachment_state: 'attached',
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }

      return { replayed: false, outletId };
    });

    if (!result.replayed) {
      await logBusinessEvent({
        event_type: 'wastage_event_reported',
        actor_type: actor.role as ActorType,
        actor_id: actor.uid,
        target_type: 'order',
        target_id: input.order_id || eventId,
        ...(result.outletId ? { outlet_id: result.outletId } : {}),
        severity: 'info',
        source: 'api',
        metadata: { event_id: eventId, event_type: input.event_type, source_type: input.source_type, items_count: input.items.length },
      });
    }
    return NextResponse.json({ success: true, event_id: eventId, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof WastageCommandError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[WASTAGE CREATE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
