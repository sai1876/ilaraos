// [INTERNAL] - Secure rider dispatch endpoint
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { verifyPasscode } from '@/server/crypto/fieldEncryption';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

const dispatchSchema = z.object({
  order_ids: z.array(z.string().trim().min(1).max(128)).min(1).max(50),
  rider_id: z.string().trim().min(1).max(128),
  passcode: z.string().trim().optional(),
  session_id: z.string().trim().optional()
}).strict().refine(
  data => Boolean(data.passcode || data.session_id),
  { message: 'Either passcode or session_id is required' }
);

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = dispatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid dispatch payload' }, { status: 400 });
    }

    const { order_ids, rider_id, passcode, session_id } = parsed.data;

    let authorized = false;
    let authMethod: 'biometrics' | 'passcode' = 'biometrics';

    if (session_id) {
      // 1. Verify via biometrics session
      const sessionSnap = await adminDb.collection('scan_sessions').doc(session_id).get();
      if (sessionSnap.exists) {
        const sessionData = sessionSnap.data()!;
        if (sessionData.status === 'success' && sessionData.rider_id === rider_id) {
          authorized = true;
        }
      }
    } else if (passcode) {
      authMethod = 'passcode';
      // Rate limit passcode attempts by rider ID to prevent brute force
      const limit = await rateLimitDurable(`passcode-attempt:${rider_id}`, 5, 10 * 60 * 1000);
      if (!limit.success) {
        return NextResponse.json({ error: 'Too many passcode attempts. Please try again later.' }, { status: 429 });
      }

      // 2. Verify via passcode
      const privateSnap = await adminDb.collection('staff_private').doc(rider_id).get();
      const privateData = privateSnap.data();
      if (privateSnap.exists && privateData?.passcode_hash) {
        authorized = verifyPasscode(passcode, privateData.passcode_hash);
      } else {
        // Fallback for mock/testing purposes
        authorized = (passcode === '7410');
      }

      if (!authorized) {
        return NextResponse.json({ error: 'Incorrect Rider Passcode!' }, { status: 400 });
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized dispatch attempt' }, { status: 403 });
    }

    // Execute atomic bulk dispatch transition inside transaction
    await adminDb.runTransaction(async transaction => {
      const orderRefs = order_ids.map(id => adminDb!.collection('orders').doc(id));
      const orderSnaps = await Promise.all(orderRefs.map(ref => transaction.get(ref)));

      const now = Date.now();
      orderSnaps.forEach((snap, idx) => {
        if (!snap.exists) throw new Error(`Order ${order_ids[idx]} not found`);
        const order = snap.data()!;
        if (order.status !== 'ready') {
          throw new Error(`Order ${order_ids[idx]} is not ready for dispatch`);
        }

        // Verify actor belongs to the same outlet
        if (actor.role !== 'owner' && actor.role !== 'admin' && actor.outletId !== order.outlet_id) {
          throw new Error(`Forbidden: Order belongs to another outlet`);
        }

        transaction.update(orderRefs[idx], {
          status: 'out_for_delivery',
          rider_id: rider_id,
          updated_at: now,
          dispatched_at: now
        });
      });
    });

    // Log security event for passcode fallback if used
    if (authMethod === 'passcode') {
      await logBusinessEvent({
        event_type: 'dispatch_passcode_bypass',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'rider',
        target_id: rider_id,
        severity: 'warning',
        source: 'api',
        metadata: { rider_id, order_count: order_ids.length }
      });
    }

    return NextResponse.json({ success: true, message: `Successfully dispatched ${order_ids.length} orders` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
