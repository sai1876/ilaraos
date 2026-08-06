import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Staff } from '@/lib/types';
import { setCustomUserClaimsLocked } from '@/server/auth/customClaimsLock';
import {
  publicStaffProjection,
  type DataRecord,
} from '@/server/database/canonicalMigration';
import {
  encryptField,
  fieldAad,
  fieldEncryptionKeyVersion,
  getConfiguredFieldEncryptionKey,
  getConfiguredPasscodePepper,
  hashPasscode,
} from '@/server/crypto/fieldEncryption';

const PRIVATE_ENCRYPTED_FIELDS = [
  ['faceDescriptor', 'face_descriptor'],
  ['face_descriptor', 'face_descriptor'],
  ['salary', 'salary'],
  ['hourly_rate', 'hourly_rate'],
] as const;
const ALLOWED_ROLES = new Set([
  'staff', 'manager', 'admin', 'owner', 'rider', 'kitchen', 'chef',
  'deep_fryer', 'grill_fryer', 'biryani_master', 'brewer',
]);
const ALLOWED_STATUSES = new Set(['active', 'offline', 'suspended', 'inactive']);

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export function validateStaffPrivateConfiguration(staff: Staff): void {
  const source = staff as unknown as DataRecord;
  if (PRIVATE_ENCRYPTED_FIELDS.some(([sourceField]) => source[sourceField] !== undefined)) {
    getConfiguredFieldEncryptionKey();
  }
  if (typeof source.passcode === 'string' && source.passcode) getConfiguredPasscodePepper();
}

async function canonicalOutletId(db: Firestore, source: DataRecord): Promise<string> {
  return 'main';
}

function customClaims(
  existing: Record<string, unknown> | undefined,
  role: string,
  outletId: string,
  tokenVersion: number,
): Record<string, unknown> {
  const claims = { ...(existing || {}) };
  delete claims.role;
  delete claims.outlet;
  delete claims.outlet_id;
  delete claims.token_version;
  return { ...claims, role, outlet_id: outletId, token_version: tokenVersion };
}

export async function persistStaffRecords(
  db: Firestore,
  auth: Auth,
  staff: Staff,
  authUid: string,
): Promise<{ outletId: string; tokenVersion: number }> {
  const source = { ...staff } as unknown as DataRecord;
  const role = normalize(source.role);
  const status = normalize(source.status) || 'inactive';
  if (!ALLOWED_ROLES.has(role) || !ALLOWED_STATUSES.has(status)) {
    throw new Error('Invalid staff role or status');
  }
  if (!staff.id || staff.id.length > 128 || !staff.name?.trim() || staff.name.length > 160) {
    throw new Error('Invalid staff identity');
  }
  const outletId = await canonicalOutletId(db, source);
  const accessRef = db.collection('staff_access').doc(authUid);
  const accessSnapshot = await accessRef.get();
  const storedVersion = accessSnapshot.data()?.token_version;
  const tokenVersion = typeof storedVersion === 'number'
    && Number.isSafeInteger(storedVersion)
    && storedVersion > 0
    ? storedVersion
    : 1;
  const encryptedFields: DataRecord = {};
  const plaintextDeletions: DataRecord = {};
  const hasEncryptedValues = PRIVATE_ENCRYPTED_FIELDS.some(([sourceField]) => source[sourceField] !== undefined);
  const encryptionKey = hasEncryptedValues ? getConfiguredFieldEncryptionKey() : null;
  for (const [sourceField, privateField] of PRIVATE_ENCRYPTED_FIELDS) {
    if (source[sourceField] === undefined || !encryptionKey || encryptedFields[privateField]) continue;
    encryptedFields[privateField] = encryptField(
      source[sourceField],
      encryptionKey,
      fieldAad('staff_private', staff.id, privateField),
    );
    plaintextDeletions[sourceField] = FieldValue.delete();
  }
  const passcodeHash = typeof source.passcode === 'string' && source.passcode
    ? hashPasscode(source.passcode)
    : null;
  if (passcodeHash) plaintextDeletions.passcode = FieldValue.delete();

  // Claims are non-authoritative and do not grant access without staff_access.
  await setCustomUserClaimsLocked(
    db,
    auth,
    authUid,
    authUser => customClaims(authUser.customClaims, role, outletId, tokenVersion),
  );

  const sanitizedStaff = { ...source };
  for (const [sourceField] of PRIVATE_ENCRYPTED_FIELDS) delete sanitizedStaff[sourceField];
  delete sanitizedStaff.passcode;
  Object.assign(sanitizedStaff, {
    id: staff.id,
    auth_uid: authUid,
    outlet_id: outletId,
    token_version: tokenVersion,
    updated_at: Date.now(),
  });

  const batch = db.batch();
  batch.set(db.collection('staff').doc(staff.id), {
    ...sanitizedStaff,
    ...plaintextDeletions,
  }, { merge: true });
  batch.set(accessRef, {
    staff_id: staff.id,
    role,
    status,
    outlet_id: outletId,
    token_version: tokenVersion,
    updated_at: Date.now(),
  }, { merge: true });
  batch.set(
    db.collection('staff_directory').doc(staff.id),
    publicStaffProjection(staff.id, source, outletId),
    { merge: false },
  );
  if (Object.keys(encryptedFields).length || passcodeHash) {
    batch.set(db.collection('staff_private').doc(staff.id), {
      staff_id: staff.id,
      auth_uid: authUid,
      key_version: fieldEncryptionKeyVersion(),
      schema_version: 1,
      encrypted_fields: encryptedFields,
      ...(passcodeHash ? { passcode_hash: passcodeHash } : {}),
      updated_at: Date.now(),
    }, { merge: true });
  }
  await batch.commit();
  return { outletId, tokenVersion };
}
