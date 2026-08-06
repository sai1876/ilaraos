// [INTERNAL] - Manage menu items and catalog settings
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

const menuItemSchema = z.object({
  item_id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(128),
  price: z.number().finite().positive(),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  is_available: z.boolean().default(true),
  sort_order: z.number().finite().default(0),
  station: z.string().trim().min(1).max(80).default('BREWER'),
  deleted: z.boolean().optional(),
  imageUrl: z.string().trim().max(2048).optional(),
  outlets: z.record(z.string(), z.boolean()).optional()
});

const catalogSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    item: menuItemSchema
  }),
  z.object({
    action: z.literal('delete'),
    item_id: z.string().trim().min(1).max(128)
  })
]);

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = catalogSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid catalog request: ' + parsed.error.message }, { status: 400 });
    }

    const { action } = parsed.data;

    if (action === 'save') {
      const { item } = parsed.data;
      await adminDb.collection('menu').doc(item.item_id).set({
        ...item,
        updated_at: Date.now(),
        updated_by: actor.uid
      }, { merge: true });

      await logBusinessEvent({
        event_type: 'menu_item_saved',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'menu',
        target_id: item.item_id,
        severity: 'info',
        source: 'api',
        metadata: { item_id: item.item_id, name: item.name }
      });
    } else if (action === 'delete') {
      const { item_id } = parsed.data;
      await adminDb.collection('menu').doc(item_id).update({
        deleted: true,
        updated_at: Date.now(),
        updated_by: actor.uid
      });

      await logBusinessEvent({
        event_type: 'menu_item_deleted',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'menu',
        target_id: item_id,
        severity: 'warning',
        source: 'api',
        metadata: { item_id }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
