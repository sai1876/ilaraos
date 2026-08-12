import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentData, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { USERS_COL } from '@/lib/firebase/collections';

import { KITCHEN_ROLES, STAFF_ROLES } from '@/lib/auth/roles';
import { getDefaultPermissionsForRole } from '@/lib/auth/permissions';

const CUSTOMER_ROLE = 'customer';
const BLOCKED_STATUSES = new Set(['suspended', 'inactive', 'disabled', 'blacklisted', 'deleted']);
const ALLOWED_STAFF_STATUSES = new Set(['active', 'offline']);

export interface ActorContext {
  uid: string;
  email?: string;
  role: string;
  staffId?: string;
  tenantId: string;
  outletId?: string;
  allowedOutletIds: string[];
  permissions: string[];
  tokenVersion?: number;
}

export type ActorResolution =
  | { ok: true; actor: ActorContext }
  | {
      ok: false;
      reason:
        | 'profile_not_found'
        | 'account_inactive'
        | 'staff_record_required'
        | 'staff_inactive'
        | 'invalid_role'
        | 'stale_token';
    };

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function documentStatus(data: DocumentData | undefined): string {
  return normalize(data?.account_status || data?.status);
}

async function findStaffDocument(
  db: Firestore,
  uid: string,
  email?: string,
): Promise<DocumentSnapshot | null> {
  const direct = await db.collection('staff').doc(uid).get();
  if (direct.exists) return direct;

  for (const field of ['auth_uid', 'firebase_uid']) {
    const byUid = await db.collection('staff').where(field, '==', uid).limit(1).get();
    if (!byUid.empty) return byUid.docs[0];
  }

  if (email) {
    const candidates = new Set([email.trim(), email.trim().toLowerCase()]);
    for (const candidate of candidates) {
      const byEmail = await db.collection('staff').where('email', '==', candidate).limit(1).get();
      if (!byEmail.empty) return byEmail.docs[0];
    }
  }

  return null;
}

export function isRoleAllowed(role: string, allowedRoles: string[]): boolean {
  if (allowedRoles.includes(role)) return true;
  if (allowedRoles.includes('staff') && STAFF_ROLES.has(role)) return true;
  if (allowedRoles.includes('kitchen') && KITCHEN_ROLES.has(role)) return true;
  return false;
}

interface CachedActor {
  actor: ActorContext;
  cachedAt: number;
}

const ACTOR_CACHE = new Map<string, CachedActor>();
const CACHE_TTL_MS = 20_000; // 20s TTL for hot-path staff requests

export function clearActorCache(uid?: string) {
  if (uid) {
    ACTOR_CACHE.delete(uid);
  } else {
    ACTOR_CACHE.clear();
  }
}

/** Resolve current authority from server-side documents; token role claims are never authoritative. */
export async function resolveActorContext(
  db: Firestore,
  decodedToken: DecodedIdToken,
): Promise<ActorResolution> {
  const uid = decodedToken.uid;
  const tokenVersion = decodedToken.token_version ?? 0;
  const cacheKey = `${uid}:${tokenVersion}`;
  const cached = ACTOR_CACHE.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { ok: true, actor: cached.actor };
  }

  const [userDoc, accessDoc] = await Promise.all([
    db.collection(USERS_COL).doc(uid).get(),
    db.collection('staff_access').doc(uid).get(),
  ]);

  const userData = userDoc.exists ? userDoc.data() : undefined;
  const userStatus = documentStatus(userData);

  if (userStatus && BLOCKED_STATUSES.has(userStatus)) {
    ACTOR_CACHE.delete(cacheKey);
    return { ok: false, reason: 'account_inactive' };
  }

  if (accessDoc.exists) {
    const access = accessDoc.data();
    const role = normalize(access?.role);
    const status = documentStatus(access);
    if (!STAFF_ROLES.has(role)) return { ok: false, reason: 'invalid_role' };
    if (!ALLOWED_STAFF_STATUSES.has(status)) return { ok: false, reason: 'staff_inactive' };
    const tokenVersion = access?.token_version;
    // Only enforce token_version when both the Firestore doc and decodedToken specify one
    if (tokenVersion !== undefined && decodedToken.token_version !== undefined && decodedToken.token_version !== tokenVersion) {
      return { ok: false, reason: 'stale_token' };
    }
    const actor: ActorContext = {
      uid,
      email: decodedToken.email,
      role,
      staffId: access?.staff_id || uid,
      tenantId: access?.tenant_id || 'main',
      outletId: access?.outlet_id || 'main',
      allowedOutletIds: Array.isArray(access?.allowed_outlet_ids) ? access.allowed_outlet_ids : [access?.outlet_id || 'main'],
      permissions: Array.isArray(access?.permissions) ? access.permissions : getDefaultPermissionsForRole(role),
      tokenVersion,
    };
    ACTOR_CACHE.set(cacheKey, { actor, cachedAt: Date.now() });
    return { ok: true, actor };
  }

  const staffDoc = await findStaffDocument(db, uid, decodedToken.email);
  if (staffDoc) {
    const staffData = staffDoc.data();
    const role = normalize(staffData?.role);
    const status = documentStatus(staffData);

    if (!STAFF_ROLES.has(role)) return { ok: false, reason: 'invalid_role' };
    if (!ALLOWED_STAFF_STATUSES.has(status)) return { ok: false, reason: 'staff_inactive' };

    const tokenVersion = staffData?.token_version ?? userData?.token_version;
    if (tokenVersion !== undefined && decodedToken.token_version !== undefined && decodedToken.token_version !== tokenVersion) {
      return { ok: false, reason: 'stale_token' };
    }

    const actor: ActorContext = {
      uid,
      email: decodedToken.email,
      role,
      staffId: staffDoc.id,
      tenantId: staffData?.tenant_id || 'main',
      outletId: staffData?.outlet_id || 'main',
      allowedOutletIds: Array.isArray(staffData?.allowed_outlet_ids) ? staffData.allowed_outlet_ids : [staffData?.outlet_id || 'main'],
      permissions: Array.isArray(staffData?.permissions) ? staffData.permissions : getDefaultPermissionsForRole(role),
      tokenVersion,
    };
    ACTOR_CACHE.set(cacheKey, { actor, cachedAt: Date.now() });
    return { ok: true, actor };
  }

  if (!userDoc.exists) return { ok: false, reason: 'profile_not_found' };

  const userRole = normalize(userData?.role) || CUSTOMER_ROLE;
  if (userRole !== CUSTOMER_ROLE) {
    return { ok: false, reason: 'staff_record_required' };
  }

  const actor: ActorContext = {
    uid,
    email: decodedToken.email,
    role: CUSTOMER_ROLE,
    tenantId: userData?.tenant_id || 'main',
    allowedOutletIds: [],
    permissions: [],
    tokenVersion: userData?.token_version,
  };
  ACTOR_CACHE.set(cacheKey, { actor, cachedAt: Date.now() });
  return { ok: true, actor };
}
