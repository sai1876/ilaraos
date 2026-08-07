import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  isRoleAllowed,
  resolveActorContext,
  type ActorContext,
} from '@/server/auth/resolveActor';

export class SessionAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = 'SessionAuthorizationError';
  }
}

export async function requireSessionActor(allowedRoles: string[]): Promise<ActorContext> {
  const session = cookies().get('__session')?.value || cookies().get('session')?.value;
  if (!session) throw new SessionAuthorizationError('Authentication required', 401);
  if (!adminAuth || !adminDb) {
    throw new SessionAuthorizationError('Authentication unavailable', 503);
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifySessionCookie(session, false);
  } catch (err: any) {
    console.error('[requireSessionActor] Session cookie verification failed:', err?.message || err);
    throw new SessionAuthorizationError('Invalid session', 401);
  }

  const resolution = await resolveActorContext(adminDb, decodedToken);
  if (!resolution.ok) {
    throw new SessionAuthorizationError('Account is not authorized', 403);
  }
  if (!isRoleAllowed(resolution.actor.role, allowedRoles)) {
    throw new SessionAuthorizationError('Insufficient permissions', 403);
  }

  return resolution.actor;
}
