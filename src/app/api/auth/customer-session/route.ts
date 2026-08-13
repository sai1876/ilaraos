// [PUBLIC] - Accessible by Firebase clients
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { verifyCustomerIdToken, createCustomerSessionCookie } from '@/server/auth/customerSession';
import { resolveActorContext } from '@/server/auth/resolveActor';
import { finalizePasswordlessLogin, canonicalizePhone } from '@/server/auth/whatsappChallenge';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { idToken, challengeId } = body;

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }
    
    if (!challengeId || typeof challengeId !== 'string') {
      return NextResponse.json({ error: 'Missing challengeId' }, { status: 400 });
    }

    const cookieStore = cookies();
    const bindingSecret = cookieStore.get('__wa_auth_bind')?.value;
    if (!bindingSecret) {
      return NextResponse.json({ error: 'Missing browser binding' }, { status: 400 });
    }
    const browserBindingHash = crypto.createHash('sha256').update(bindingSecret).digest('hex');

    // 1. Verify customer ID token and enforce security constraints (role=customer, recent auth, active account)
    const verification = await verifyCustomerIdToken(idToken);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.reason }, { status: 403 });
    }

    const uid = verification.actor!.uid;
    const userDoc = await adminDb!.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const rawPhone = userData.phone || userData.phone_number;
    const canonicalPhone = canonicalizePhone(rawPhone || '');

    if (!canonicalPhone) {
      return NextResponse.json({ error: 'Invalid phone format on profile' }, { status: 400 });
    }

    // 2. Finalize Passwordless Challenge Consumption
    const finalizeRes = await finalizePasswordlessLogin(challengeId, uid, canonicalPhone, browserBindingHash);
    
    if (!finalizeRes.success) {
      console.warn(`[CUSTOMER SESSION] Challenge finalize failed: ${finalizeRes.reason}`);
      return NextResponse.json({ error: `Challenge finalize failed: ${finalizeRes.reason}` }, { status: 403 });
    }

    // 3. Establish Canonical Session
    await createCustomerSessionCookie(idToken);
    
    // 4. Cleanup binding cookie
    cookieStore.delete('__wa_auth_bind');

    await logBusinessEvent({
      event_type: 'customer_session_created',
      actor_type: 'customer',
      actor_id: uid,
      target_type: 'system',
      target_id: 'session',
      severity: 'info',
      source: 'api',
      metadata: { method: 'passwordless' },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Customer session POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('__session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    try {
      // Verify session cookie
      const decodedClaims = await adminAuth!.verifySessionCookie(sessionCookie, true);
      
      const resolution = await resolveActorContext(adminDb!, decodedClaims as any);
      if (!resolution.ok || resolution.actor.role !== 'customer') {
        throw new Error('Not authorized or not a customer');
      }

      const uid = decodedClaims.uid;
      const fbUser = await adminAuth!.getUser(uid);
      if (fbUser.disabled) {
        throw new Error('Disabled');
      }
      
      return NextResponse.json({ 
        isAuthenticated: true, 
        uid,
        role: 'customer'
      });
    } catch (e) {
      return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }
  } catch (err) {
    return NextResponse.json({ isAuthenticated: false }, { status: 500 });
  }
}
