import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { USERS_COL } from '@/lib/firebase/collections';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { rateLimitDurable } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!adminDb || !adminAuth) {
      return NextResponse.json({ detail: 'Firebase Admin not configured' }, { status: 500 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken, true);
    } catch {
      return NextResponse.json({ detail: 'Invalid Firebase ID token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const [ipLimit, actorLimit] = await Promise.all([
      rateLimitDurable(`activate-profile-ip:${ip}`, 20, 15 * 60 * 1000),
      rateLimitDurable(`activate-profile-uid:${userId}`, 5, 15 * 60 * 1000),
    ]);
    if (!ipLimit.success || !actorLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || actorLimit.source === 'unavailable';
      return NextResponse.json(
        { detail: unavailable ? 'Authentication temporarily unavailable' : 'Too many requests' },
        { status: unavailable ? 503 : 429 },
      );
    }
    
    // Fetch user directly from Firebase Auth to verify email status
    const authUser = await adminAuth.getUser(userId);

    if (authUser.disabled || !authUser.emailVerified) {
      return NextResponse.json({ detail: 'Email is not verified' }, { status: 403 });
    }

    const db = adminDb;
    const userRef = db.collection(USERS_COL).doc(userId);
    
    // Check if profile exists
    const existingDoc = await userRef.get();
    if (!existingDoc.exists) {
      return NextResponse.json({ detail: 'Profile does not exist' }, { status: 404 });
    }

    // Securely update status fields using admin privileges
    await userRef.update({
      email_verified: true,
      is_email_verified: true,
      account_status: "active",
      status: "active",
      is_active: true,
      activated_at: Date.now()
    });

    await logBusinessEvent({
      event_type: 'profile_activated',
      actor_type: 'customer',
      actor_id: userId,
      target_type: 'user',
      target_id: userId,
      severity: 'info',
      source: 'api'
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Activate profile error:", error);
    return NextResponse.json({ detail: 'Internal server error processing activation' }, { status: 500 });
  }
}
