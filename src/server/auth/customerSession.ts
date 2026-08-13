import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { resolveActorContext } from './resolveActor';
import { cookies } from 'next/headers';

export async function verifyCustomerIdToken(idToken: string) {
  // 1. Verify token
  const decodedToken = await adminAuth!.verifyIdToken(idToken, true);
  
  // 2. Require recent auth (<= 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (!decodedToken.auth_time || (now - decodedToken.auth_time > 300)) {
    return { ok: false, reason: 'RECENT_AUTH_REQUIRED' as const };
  }
  
  // 3. Resolve actor context (automatically checks user document for inactive/blocked status)
  const resolution = await resolveActorContext(adminDb!, decodedToken);
  if (!resolution.ok) {
    return { ok: false, reason: resolution.reason };
  }
  
  // 4. Strictly require customer role (rejects all staff)
  if (resolution.actor.role !== 'customer') {
    return { ok: false, reason: 'STAFF_ACTOR_REJECTED' as const };
  }
  
  // 5. Verify Firebase user is not disabled
  const fbUser = await adminAuth!.getUser(decodedToken.uid);
  if (fbUser.disabled) {
    return { ok: false, reason: 'ACCOUNT_DISABLED' as const };
  }
  
  return { ok: true, actor: resolution.actor };
}

export async function createCustomerSessionCookie(idToken: string) {
  // Same parameters as staff session
  const expiresIn = 1000 * 60 * 60 * 24 * 7; // 1 week
  const sessionCookie = await adminAuth!.createSessionCookie(idToken, { expiresIn });
  
  const cookieStore = cookies();
  cookieStore.set('__session', sessionCookie, {
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}
