import type { Firestore } from 'firebase-admin/firestore';
import {
  buildOutletAliasMap,
  resolveCanonicalOutletId,
} from '@/server/database/canonicalMigration';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import type { ActorContext } from '@/server/auth/resolveActor';

const OPERATIONAL_ROLES = new Set(['manager', 'admin', 'owner']);

export class OperationalAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = 'OperationalAccessError';
  }
}

export async function requireOperationalActor(): Promise<ActorContext> {
  const actor = await requireSessionActor(['staff']);
  if (!OPERATIONAL_ROLES.has(actor.role)) {
    throw new OperationalAccessError('Manager access required', 403);
  }
  return actor;
}

export async function resolveOperationalOutlet(
  db: Firestore,
  actor: ActorContext,
  requestedOutlet: string | undefined,
  options: { allowGlobalRead?: boolean } = {},
): Promise<string | null> {
  const isGlobal = actor.role === 'owner' || actor.role === 'admin';
  if (isGlobal && !requestedOutlet && options.allowGlobalRead) return null;

  const outletSnapshot = await db.collection('outlets').get();
  const aliases = buildOutletAliasMap(outletSnapshot.docs.map(document => ({
    id: document.id,
    data: document.data(),
  })));
  const actorOutlet = actor.outletId
    ? resolveCanonicalOutletId([actor.outletId], aliases) || actor.outletId
    : null;
  const requestedCanonical = requestedOutlet
    ? resolveCanonicalOutletId([requestedOutlet], aliases)
    : null;

  if (!isGlobal) {
    if (!actorOutlet) throw new OperationalAccessError('Staff outlet is not configured', 403);
    if (requestedOutlet && requestedCanonical !== actorOutlet) {
      throw new OperationalAccessError('Outlet scope mismatch', 403);
    }
    return actorOutlet;
  }

  if (!requestedCanonical) throw new OperationalAccessError('A valid outlet is required', 400);
  return requestedCanonical;
}

export async function assertStaffInOutlet(
  db: Firestore,
  staffId: string,
  outletId: string,
): Promise<void> {
  const staff = await db.collection('staff_directory').doc(staffId).get();
  if (!staff.exists || staff.data()?.outlet_id !== outletId
      || !['active', 'offline'].includes(String(staff.data()?.status || '').toLowerCase())) {
    throw new OperationalAccessError('Staff member is not active at this outlet', 400);
  }
}

export function moneyToPaise(value: number): number {
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(rounded)
      || Math.abs(scaled - rounded) > 1e-8) {
    throw new OperationalAccessError('Amount must have at most two decimal places', 400);
  }
  return rounded;
}
