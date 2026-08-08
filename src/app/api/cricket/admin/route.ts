// [INTERNAL] Requires manager or admin authorization
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { resolveActorContext, isRoleAllowed } from '@/server/auth/resolveActor';

export async function POST(request: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable', code: 'DATABASE_UNAVAILABLE' }, { status: 503 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const resolution = await resolveActorContext(adminDb, decodedToken);
    if (!resolution.ok || !isRoleAllowed(resolution.actor.role, ['manager', 'admin', 'owner'])) {
      return NextResponse.json({ error: 'Manager or Admin permissions required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'update_config') {
      const {
        opening_time,
        closing_time,
        slot_duration_minutes,
        minimum_lead_minutes,
        booking_horizon_days,
        base_price_paise,
        enabled,
      } = body.config || {};

      // Validate config
      if (opening_time && closing_time && opening_time >= closing_time) {
        return NextResponse.json({ error: 'Opening time must be strictly before closing time', code: 'INVALID_CONFIG' }, { status: 400 });
      }

      const updateData: Record<string, any> = {
        updated_at: Date.now(),
        updated_by: decodedToken.uid,
      };

      if (opening_time) updateData.opening_time = opening_time;
      if (closing_time) updateData.closing_time = closing_time;
      if (typeof slot_duration_minutes === 'number') updateData.slot_duration_minutes = slot_duration_minutes;
      if (typeof minimum_lead_minutes === 'number') updateData.minimum_lead_minutes = minimum_lead_minutes;
      if (typeof booking_horizon_days === 'number') updateData.booking_horizon_days = booking_horizon_days;
      if (typeof base_price_paise === 'number') updateData.base_price_paise = base_price_paise;
      if (typeof enabled === 'boolean') updateData.enabled = enabled;

      await adminDb.collection('config').doc('cricket_settings').set(updateData, { merge: true });

      return NextResponse.json({ success: true, message: 'Cricket configuration updated successfully.' });
    }

    if (action === 'block_slot') {
      const { slot_key, business_date, reason } = body;
      if (!slot_key || !business_date) {
        return NextResponse.json({ error: 'slot_key and business_date required', code: 'INVALID_PARAMS' }, { status: 400 });
      }

      await adminDb.collection('cricket_slot_blocks').doc(slot_key).set({
        slot_key,
        venue_id: 'box-main',
        business_date,
        reason: reason || 'Blocked by Management',
        blocked_by: decodedToken.uid,
        created_at: Date.now(),
        active: true,
      });

      return NextResponse.json({ success: true, message: `Slot ${slot_key} blocked.` });
    }

    if (action === 'unblock_slot') {
      const { slot_key } = body;
      if (!slot_key) {
        return NextResponse.json({ error: 'slot_key required', code: 'INVALID_PARAMS' }, { status: 400 });
      }

      await adminDb.collection('cricket_slot_blocks').doc(slot_key).delete();

      return NextResponse.json({ success: true, message: `Slot ${slot_key} unblocked.` });
    }

    return NextResponse.json({ error: 'Unknown action', code: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: any) {
    console.error('Cricket admin mutation failed:', error);
    return NextResponse.json({ error: 'Admin action failed', code: 'ADMIN_ERROR' }, { status: 500 });
  }
}
