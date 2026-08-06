// [INTERNAL] - Manage marketing offer settings
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

const offerSchema = z.object({
  code: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  discountPercent: z.number().finite().min(0).max(100),
  description: z.string().trim().min(1).max(500),
  categoryScope: z.string().trim().min(1).max(80),
  isActive: z.boolean().default(true),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outlets: z.record(z.string(), z.boolean()).optional(),
  deleted: z.boolean().optional()
});

const offerActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    offer: offerSchema
  }),
  z.object({
    action: z.literal('delete'),
    code: z.string().trim().min(1).max(128)
  })
]);

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = offerActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid offer request: ' + parsed.error.message }, { status: 400 });
    }

    const { action } = parsed.data;

    if (action === 'save') {
      const { offer } = parsed.data;
      await adminDb.collection('offers').doc(offer.code).set({
        ...offer,
        updated_at: Date.now(),
        updated_by: actor.uid
      }, { merge: true });

      await logBusinessEvent({
        event_type: 'offer_saved',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'offer',
        target_id: offer.code,
        severity: 'info',
        source: 'api',
        metadata: { code: offer.code, discount: offer.discountPercent }
      });
    } else if (action === 'delete') {
      const { code } = parsed.data;
      await adminDb.collection('offers').doc(code).update({
        deleted: true,
        updated_at: Date.now(),
        updated_by: actor.uid
      });

      await logBusinessEvent({
        event_type: 'offer_deleted',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'offer',
        target_id: code,
        severity: 'warning',
        source: 'api',
        metadata: { code }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
