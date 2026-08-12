import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  isRoleAllowed,
  resolveActorContext,
  type ActorContext,
} from '@/server/auth/resolveActor';

export class SessionAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 | 503,
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
    decodedToken = await adminAuth.verifySessionCookie(session, true);
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

export function requirePermission(actor: ActorContext, permission: string): void {
  // Global roles bypass permission checks if desired, but let's stick to explicit if needed.
  // Actually, owner and admin usually have all permissions implicitly, but let's check.
  if (actor.role === 'owner' || actor.role === 'admin') {
    return;
  }
  
  if (!actor.permissions || !actor.permissions.includes(permission)) {
    throw new SessionAuthorizationError(`Missing required permission: ${permission}`, 403);
  }
}
export function requireTenant(actor: ActorContext, tenantId: string): void {
  if (actor.tenantId !== tenantId) {
    // 404 is preferable for cross-tenant object access to avoid confirming resource exists
    throw new SessionAuthorizationError('Resource not found', 404 as any); // use 404, we will allow 404 in SessionAuthorizationError
  }
}

export function requireOutletAccess(actor: ActorContext, outletId: string): void {
  if (actor.role === 'owner' || actor.role === 'admin') {
    return;
  }
  if (!actor.allowedOutletIds.includes(outletId)) {
    throw new SessionAuthorizationError('Unauthorized outlet access', 403);
  }
}

export async function requireSessionActorApi(allowedRoles: string[]): Promise<ActorContext | NextResponse> {
  try {
    return await requireSessionActor(allowedRoles);
  } catch (error: any) {
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ detail: error.message }, { status: error.status as any });
    }
    return NextResponse.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}
