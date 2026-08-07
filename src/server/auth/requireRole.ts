import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  isRoleAllowed,
  resolveActorContext,
  type ActorContext,
} from '@/server/auth/resolveActor';

export type AuthContext = ActorContext;

/**
 * Validates the Authorization header or session cookie, verifies the Firebase ID token
 * or session cookie, resolves current server-side authority and ensures the actor has
 * one of the allowed roles. Token role claims are never authoritative.
 * 
 * Returns the AuthContext if successful, or a NextResponse error if unauthorized.
 */
export async function requireRole(req: Request, allowedRoles: string[]): Promise<AuthContext | NextResponse> {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ detail: 'Firebase Admin not configured' }, { status: 500 });
  }

  let decodedToken: any = null;

  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken, true);
    } catch {
      // Ignore bearer error and try session cookie fallback
    }
  }

  if (!decodedToken) {
    const sessionCookie = cookies().get('__session')?.value || cookies().get('session')?.value;
    if (sessionCookie) {
      try {
        decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
      } catch {
        // invalid session
      }
    }
  }

  if (!decodedToken) {
    return NextResponse.json({ detail: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  let resolution;
  try {
    resolution = await resolveActorContext(adminDb, decodedToken);
  } catch (error) {
    console.error('Failed to resolve server-side actor context:', error);
    return NextResponse.json({ detail: 'Internal server error verifying role' }, { status: 500 });
  }

  if (!resolution.ok) {
    console.warn(`[AUDIT] Actor resolution denied for ${decodedToken.uid}: ${resolution.reason}`);
    return NextResponse.json({ detail: 'Forbidden: Account is not authorized' }, { status: 403 });
  }

  if (!isRoleAllowed(resolution.actor.role, allowedRoles)) {
    console.warn(`[AUDIT] Forbidden access attempt by ${resolution.actor.uid}. Required: ${allowedRoles.join(', ')}`);
    return NextResponse.json({ detail: 'Forbidden: Insufficient permissions' }, { status: 403 });
  }

  return resolution.actor;
}
