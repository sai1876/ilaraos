import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  isRoleAllowed,
  resolveActorContext,
  type ActorContext,
} from '@/server/auth/resolveActor';

export type AuthContext = ActorContext;

/**
 * Validates the Authorization header, verifies the Firebase ID token,
 * resolves current server-side authority and ensures the actor has one of
 * the allowed roles. Token role claims are never authoritative.
 * 
 * Returns the AuthContext if successful, or a NextResponse error if unauthorized.
 */
export async function requireRole(req: Request, allowedRoles: string[]): Promise<AuthContext | NextResponse> {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ detail: 'Firebase Admin not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ detail: 'Invalid Firebase ID token' }, { status: 401 });
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
