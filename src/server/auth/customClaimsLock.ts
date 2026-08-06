import { createHash, randomUUID } from 'node:crypto';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

const CLAIM_LOCK_LEASE_MS = 5 * 60 * 1000;

type ClaimsBuilder = (user: UserRecord) => Record<string, unknown>;

export function claimsFingerprint(claims: Record<string, unknown> | undefined): string {
  return JSON.stringify(Object.entries(claims || {}).sort(([left], [right]) => left.localeCompare(right)));
}

export async function setCustomUserClaimsLocked(
  db: Firestore,
  auth: Auth,
  uid: string,
  buildClaims: ClaimsBuilder,
  expectedClaimsFingerprint?: string,
): Promise<void> {
  const lockId = createHash('sha256').update(uid).digest('hex');
  const lockRef = db.collection('auth_claim_locks').doc(lockId);
  const leaseToken = randomUUID();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(lockRef);
    const lock = snapshot.data() || {};
    const now = Date.now();
    if (lock.status === 'in_progress'
        && typeof lock.lease_expires_at === 'number'
        && lock.lease_expires_at > now) {
      throw new Error('A custom-claim update is already in progress');
    }
    transaction.set(lockRef, {
      status: 'in_progress',
      lease_token: leaseToken,
      lease_expires_at: now + CLAIM_LOCK_LEASE_MS,
      updated_at: now,
    }, { merge: false });
  });

  try {
    const currentUser = await auth.getUser(uid);
    if (expectedClaimsFingerprint !== undefined
        && claimsFingerprint(currentUser.customClaims) !== expectedClaimsFingerprint) {
      throw new Error(`Auth claims changed before the locked update: ${uid}`);
    }
    await auth.setCustomUserClaims(uid, buildClaims(currentUser));
  } finally {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(lockRef);
      const lock = snapshot.data() || {};
      if (lock.lease_token !== leaseToken) return;
      const now = Date.now();
      transaction.set(lockRef, {
        status: 'complete',
        lease_expires_at: now,
        lease_token: null,
        updated_at: now,
      }, { merge: true });
    });
  }
}
