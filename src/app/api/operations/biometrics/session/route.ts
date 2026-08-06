// [INTERNAL] - Biometric session management
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import crypto from 'node:crypto';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    
    // App Check validation
    const appCheckToken = req.headers.get('x-firebase-appcheck');
    if (process.env.NODE_ENV === 'production' && process.env.APP_CHECK_REQUIRED === 'true') {
      if (!appCheckToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      try {
        const admin = require('firebase-admin');
        await admin.appCheck().verifyToken(appCheckToken);
      } catch (err) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const actor = await requireSessionActor(['staff']);
    if (!OPERATIONAL_ROLES.has(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { type, staff_id, rider_id } = body;
    if (type !== 'enroll' && type !== 'verify') {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 });
    }

    // Generate cryptographic 128-bit session ID
    const sid = 'scan_' + crypto.randomBytes(16).toString('hex');
    const sessionRef = adminDb.collection('scan_sessions').doc(sid);

    await sessionRef.set({
      status: 'pending',
      type,
      ...(type === 'enroll' ? { staff_id } : { rider_id }),
      expires_at: Date.now() + 5 * 60 * 1000,
      created_at: Date.now(),
      updated_at: Date.now(),
      created_by: actor.uid,
      attempts: 0
    });

    return NextResponse.json({ success: true, session_id: sid }, { status: 201 });
  } catch (err: any) {
    console.error('[biometric-session] POST failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    const url = new URL(req.url);
    const sid = url.searchParams.get('session_id');
    if (!sid) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const sessionSnap = await adminDb.collection('scan_sessions').doc(sid).get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const data = sessionSnap.data()!;
    if (data.status !== 'pending' || data.expires_at <= Date.now()) {
      return NextResponse.json({ error: 'Session expired or completed' }, { status: 410 });
    }

    const targetId = data.type === 'enroll' ? data.staff_id : data.rider_id;
    const staffDirectorySnap = await adminDb.collection('staff_directory').doc(targetId).get();
    const staffName = staffDirectorySnap.exists ? staffDirectorySnap.data()?.name : 'Unknown Staff';

    return NextResponse.json({
      session_id: sid,
      type: data.type,
      staff_id: data.staff_id || null,
      rider_id: data.rider_id || null,
      staff_name: staffName,
      status: data.status
    });
  } catch (err: any) {
    console.error('[biometric-session] GET failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
