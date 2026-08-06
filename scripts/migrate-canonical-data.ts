import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  analyzeOutletEvidence,
  buildMoneyMigrationPatch,
  buildOutletAliasMap,
  calculateOrderItemSubtotalPaise,
  publicStaffProjection,
  resolveCanonicalOutletId,
  stockMovementBalances,
  type DataRecord,
} from '../src/server/database/canonicalMigration';
import { readCanonicalMoneyPaise } from '../src/server/database/canonicalMoney';
import {
  claimsFingerprint,
  setCustomUserClaimsLocked,
} from '../src/server/auth/customClaimsLock';
import {
  decryptField,
  encryptField,
  fieldAad,
  fieldEncryptionKeyVersion,
  getConfiguredFieldEncryptionKey,
  getFieldEncryptionKey,
  hashPasscode,
  type EncryptedFieldEnvelope,
} from '../src/server/crypto/fieldEncryption';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type Snapshot = FirebaseFirestore.QueryDocumentSnapshot;
type SourceVersionCheck = {
  ref: FirebaseFirestore.DocumentReference;
  expectedVersion: number | 'missing';
};
type PlannedWrite = {
  ref: FirebaseFirestore.DocumentReference;
  data: DataRecord;
  merge?: boolean;
  expectedVersion: number | 'missing';
  dependencies: SourceVersionCheck[];
};
type WriteGroup = PlannedWrite[];
type UnversionedWrite = {
  ref: FirebaseFirestore.DocumentReference;
  data: DataRecord;
  merge?: boolean;
  dependencyRefs?: FirebaseFirestore.DocumentReference[];
};
type ClaimUpdate = {
  user: UserRecord;
  claims: Record<string, unknown>;
  staffRef: FirebaseFirestore.DocumentReference;
  staffVersion: number;
};

const MIGRATION_VERSION = 'canonical-data-v2.1';
const MIGRATION_LOCK_ID = 'canonical-data-v2';
const LEASE_DURATION_MS = 15 * 60 * 1000;
const MAX_TRANSACTION_WRITES = 150;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const rotateEncryption = args.has('--rotate-encryption');
const confirmProject = [...args].find(value => value.startsWith('--confirm-project='))?.split('=')[1];
const confirmManifest = [...args].find(value => value.startsWith('--confirm-manifest='))?.split('=')[1];
const resumeRun = [...args].find(value => value.startsWith('--resume-run='))?.split('=')[1];
const maxDocumentsArg = [...args].find(value => value.startsWith('--max-documents='))?.split('=')[1];
const maxDocuments = maxDocumentsArg ? Number(maxDocumentsArg) : 100_000;
const pageSize = 250;

if (args.has('--help')) {
  console.log('Dry run: npm run db:migrate:dry-run');
  console.log('Apply: npx tsx scripts/migrate-canonical-data.ts --apply --confirm-project=<project-id> --confirm-manifest=<dry-run-hash>');
  console.log('Resume after an expired lease: add --resume-run=<previous-manifest-hash>');
  process.exit(0);
}
if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1) {
  throw new Error('--max-documents must be a positive integer');
}

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase Admin credentials are required in .env.local');
}
if (apply && confirmProject !== projectId) {
  throw new Error('Apply refused: --confirm-project must exactly match FIREBASE_PROJECT_ID');
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}
const db = getFirestore();
const auth = getAuth();

const collections = [
  'orders',
  'inventory',
  'stock_movements',
  'refund_requests',
  'wastage_events',
  'dough_batches',
  'daily_closings',
  'payment_ledger',
  'cash_sessions',
  'expenses',
  'attendance',
  'shifts',
] as const;

const issueCounts = new Map<string, number>();
const scannedCounts = new Map<string, number>();
const writeCounts = new Map<string, number>();
const writeGroups: WriteGroup[] = [];
const claimUpdates: ClaimUpdate[] = [];
const sourceVersionTokens: string[] = [];
const sourceVersionsByPath = new Map<string, number>();
let scanLimitReached = false;

const count = (map: Map<string, number>, key: string, increment = 1): void => {
  map.set(key, (map.get(key) || 0) + increment);
};
const issue = (collection: string, reason: string): void => count(issueCounts, `${collection}:${reason}`);
const asRecord = (value: unknown): DataRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as DataRecord
    : {};
const normalized = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';
const sameScalar = (left: unknown, right: unknown): boolean => left === right;
const isEncryptedEnvelope = (value: unknown): value is EncryptedFieldEnvelope => {
  const envelope = asRecord(value);
  return envelope.scheme === 'aes-256-gcm'
    && typeof envelope.key_version === 'string'
    && typeof envelope.iv === 'string'
    && typeof envelope.tag === 'string'
    && typeof envelope.ciphertext === 'string';
};

async function scan(query: FirebaseFirestore.Query, label: string): Promise<Snapshot[]> {
  const documents: Snapshot[] = [];
  let cursor: Snapshot | undefined;
  while (documents.length < maxDocuments) {
    let pageQuery = query.orderBy(FieldPath.documentId()).limit(Math.min(pageSize, maxDocuments - documents.length));
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;
    documents.push(...page.docs);
    cursor = page.docs[page.docs.length - 1];
    if (page.size < pageSize) break;
  }
  if (documents.length === maxDocuments) {
    const next = await query.orderBy(FieldPath.documentId()).startAfter(documents[documents.length - 1]).limit(1).get();
    if (!next.empty) {
      scanLimitReached = true;
      issue(label, 'scan_limit_reached');
    }
  }
  scannedCounts.set(label, documents.length);
  for (const document of documents) {
    const sourceVersion = document.updateTime?.toMillis() || 0;
    sourceVersionTokens.push(`${label}:${document.ref.path}:${sourceVersion}`);
    sourceVersionsByPath.set(document.ref.path, sourceVersion);
  }
  return documents;
}

function versionChecks(refs: FirebaseFirestore.DocumentReference[]): SourceVersionCheck[] {
  const unique = new Map(refs.map(ref => [ref.path, ref]));
  return [...unique.values()].map(ref => ({
    ref,
    expectedVersion: sourceVersionsByPath.get(ref.path) ?? 'missing',
  }));
}

function plan(
  ref: FirebaseFirestore.DocumentReference,
  data: DataRecord,
  merge = true,
  dependencyRefs: FirebaseFirestore.DocumentReference[] = [],
): void {
  if (Object.keys(data).length === 0) return;
  writeGroups.push([{
    ref,
    data,
    merge,
    expectedVersion: sourceVersionsByPath.get(ref.path) ?? 'missing',
    dependencies: versionChecks(dependencyRefs),
  }]);
  count(writeCounts, ref.parent.id);
}

function planGroup(group: UnversionedWrite[]): void {
  const nonEmpty = group.filter(operation => Object.keys(operation.data).length > 0);
  if (!nonEmpty.length) return;
  const versioned = nonEmpty.map(operation => ({
    ...operation,
    expectedVersion: sourceVersionsByPath.get(operation.ref.path) ?? 'missing' as const,
    dependencies: versionChecks(operation.dependencyRefs || []),
  }));
  writeGroups.push(versioned);
  for (const operation of versioned) count(writeCounts, operation.ref.parent.id);
}

function getBusinessDate(timestampMs: number): string {
  const dateStr = new Date(timestampMs).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(dateStr);
  const hour = istDate.getHours();
  if (hour < 11) {
    istDate.setDate(istDate.getDate() - 1);
  }
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function canonicalPatch(source: DataRecord, outletId: string | null, collection: string): DataRecord {
  const result = buildMoneyMigrationPatch(collection, source);
  for (const conflict of result.conflicts) issue(collection, `money_conflict:${conflict}`);
  if (outletId && source.outlet_id !== outletId) result.patch.outlet_id = outletId;
  
  if (collection === 'orders') {
    if (source.timezone === undefined || source.timezone === null) {
      result.patch.timezone = 'Asia/Kolkata';
    }
    if (source.business_date === undefined || source.business_date === null) {
      const createdAt = typeof source.created_at === 'number' ? source.created_at : Date.now();
      result.patch.business_date = getBusinessDate(createdAt);
    }
  }

  if (source.schema_version !== 2) result.patch.schema_version = 2;
  if (Object.keys(result.patch).length > 0) {
    result.patch.migration_updated_at = Date.now();
  }
  return result.patch;
}

async function loadAuthUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  scannedCounts.set('auth_users', users.length);
  return users;
}

function resolveAuthUser(
  staffId: string,
  source: DataRecord,
  byUid: ReadonlyMap<string, UserRecord>,
  byEmail: ReadonlyMap<string, UserRecord>,
): { user: UserRecord | null; conflict: boolean } {
  const matches = new Map<string, UserRecord>();
  let conflict = false;
  const declaredUids = [source.auth_uid, source.firebase_uid]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  for (const uid of declaredUids) {
    const user = byUid.get(uid);
    if (!user) conflict = true;
    else matches.set(user.uid, user);
  }
  const documentUser = byUid.get(staffId);
  if (documentUser) matches.set(documentUser.uid, documentUser);
  if (typeof source.email === 'string' && source.email.trim()) {
    const emailUser = byEmail.get(source.email.trim().toLowerCase());
    if (!emailUser) conflict = true;
    else matches.set(emailUser.uid, emailUser);
  }
  return {
    user: !conflict && matches.size === 1 ? [...matches.values()][0] : null,
    conflict: conflict || matches.size > 1,
  };
}

function claimsFor(user: UserRecord, role: string, outletId: string, tokenVersion: number): Record<string, unknown> {
  const claims = { ...(user.customClaims || {}) } as DataRecord;
  delete claims.role;
  delete claims.outlet;
  delete claims.outlet_id;
  delete claims.token_version;
  return { ...claims, role, outlet_id: outletId, token_version: tokenVersion };
}

function claimsMatch(user: UserRecord, role: string, outletId: string, tokenVersion: number): boolean {
  return user.customClaims?.role === role
    && user.customClaims?.outlet_id === outletId
    && user.customClaims?.token_version === tokenVersion;
}

function migrationCodeHash(): string {
  const files = [
    'scripts/migrate-canonical-data.ts',
    'src/server/database/canonicalMigration.ts',
    'src/server/database/canonicalMoney.ts',
    'src/server/crypto/fieldEncryption.ts',
    'src/server/auth/customClaimsLock.ts',
  ];
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(file).update('\0').update(readFileSync(path.resolve(process.cwd(), file))).update('\0');
  }
  return digest.digest('hex');
}

function detectDuplicateWriteTargets(): void {
  const paths = new Set<string>();
  const duplicates = new Set<string>();
  for (const operation of writeGroups.flat()) {
    if (paths.has(operation.ref.path)) duplicates.add(operation.ref.path);
    paths.add(operation.ref.path);
  }
  for (const duplicate of duplicates) issue('migration', `duplicate_target_write:${duplicate}`);
}

function buildWriteChunks(startGroup: number): Array<{
  operations: PlannedWrite[];
  completedGroups: number;
}> {
  const chunks: Array<{ operations: PlannedWrite[]; completedGroups: number }> = [];
  let operations: PlannedWrite[] = [];
  let completedGroups = startGroup;
  for (let index = startGroup; index < writeGroups.length; index += 1) {
    const group = writeGroups[index];
    if (group.length > MAX_TRANSACTION_WRITES) {
      throw new Error('A migration write group is unexpectedly large');
    }
    if (operations.length > 0 && operations.length + group.length > MAX_TRANSACTION_WRITES) {
      chunks.push({ operations, completedGroups });
      operations = [];
    }
    operations.push(...group);
    completedGroups = index + 1;
    const nextGroup = writeGroups[index + 1];
    if (!nextGroup || operations.length + nextGroup.length > MAX_TRANSACTION_WRITES) {
      chunks.push({ operations, completedGroups });
      operations = [];
    }
  }
  return chunks;
}

async function acquireMigrationLease(manifestHash: string): Promise<{
  alreadyComplete: boolean;
  completedGroups: number;
  leaseToken: string;
  lockRef: FirebaseFirestore.DocumentReference;
  runRef: FirebaseFirestore.DocumentReference;
}> {
  const leaseToken = randomUUID();
  const lockRef = db.collection('migration_locks').doc(MIGRATION_LOCK_ID);
  const runRef = db.collection('migration_runs').doc(manifestHash);
  const previousRunRef = resumeRun && resumeRun !== manifestHash
    ? db.collection('migration_runs').doc(resumeRun)
    : null;
  let alreadyComplete = false;
  let completedGroups = 0;

  await db.runTransaction(async transaction => {
    const reads = [transaction.get(lockRef), transaction.get(runRef)];
    if (previousRunRef) reads.push(transaction.get(previousRunRef));
    const [lockSnapshot, runSnapshot, previousRunSnapshot] = await Promise.all(reads);
    const lock = asRecord(lockSnapshot.data());
    const run = asRecord(runSnapshot.data());
    const now = Date.now();

    if (run.status === 'complete') {
      alreadyComplete = true;
      return;
    }
    if (run.status === 'in_progress' && resumeRun !== manifestHash) {
      throw new Error(`Apply refused: unfinished run requires --resume-run=${manifestHash}`);
    }
    if (previousRunRef) {
      const previousRun = asRecord(previousRunSnapshot?.data());
      if (previousRun.status !== 'in_progress') {
        throw new Error('Apply refused: --resume-run must identify an unfinished migration run');
      }
    }
    if (lock.status === 'in_progress') {
      const leaseExpiresAt = typeof lock.lease_expires_at === 'number' ? lock.lease_expires_at : 0;
      if (leaseExpiresAt > now) {
        throw new Error('Apply refused: another migration runner holds the active lease');
      }
      if (resumeRun !== lock.manifest_hash) {
        throw new Error(`Apply refused: expired migration lease requires --resume-run=${String(lock.manifest_hash || '')}`);
      }
    }

    completedGroups = resumeRun === manifestHash
      && typeof run.completed_write_groups === 'number'
      && Number.isSafeInteger(run.completed_write_groups)
      ? run.completed_write_groups
      : 0;
    if (completedGroups < 0 || completedGroups > writeGroups.length) {
      throw new Error('Apply refused: migration journal has an invalid completed group count');
    }

    transaction.set(lockRef, {
      migration: MIGRATION_LOCK_ID,
      manifest_hash: manifestHash,
      lease_token: leaseToken,
      lease_expires_at: now + LEASE_DURATION_MS,
      status: 'in_progress',
      resumed_from_manifest: resumeRun || null,
      updated_at: now,
    }, { merge: false });
    transaction.set(runRef, {
      migration: MIGRATION_VERSION,
      manifest_hash: manifestHash,
      status: 'in_progress',
      phase: 'claims',
      total_write_groups: writeGroups.length,
      completed_write_groups: completedGroups,
      planned_claim_updates: claimUpdates.length,
      resumed_from_manifest: resumeRun || null,
      started_at: run.started_at || now,
      updated_at: now,
    }, { merge: true });
  });

  return { alreadyComplete, completedGroups, leaseToken, lockRef, runRef };
}

async function renewMigrationLease(
  lockRef: FirebaseFirestore.DocumentReference,
  runRef: FirebaseFirestore.DocumentReference,
  leaseToken: string,
  phase: string,
): Promise<void> {
  await db.runTransaction(async transaction => {
    const lockSnapshot = await transaction.get(lockRef);
    const lock = asRecord(lockSnapshot.data());
    if (lock.status !== 'in_progress' || lock.lease_token !== leaseToken) {
      throw new Error('Migration lease was lost');
    }
    const now = Date.now();
    transaction.set(lockRef, { lease_expires_at: now + LEASE_DURATION_MS, updated_at: now }, { merge: true });
    transaction.set(runRef, { phase, updated_at: now }, { merge: true });
  });
}

async function applyWriteChunk(
  operations: PlannedWrite[],
  completedGroups: number,
  lockRef: FirebaseFirestore.DocumentReference,
  runRef: FirebaseFirestore.DocumentReference,
  leaseToken: string,
): Promise<void> {
  await db.runTransaction(async transaction => {
    const checksByPath = new Map<string, SourceVersionCheck>();
    for (const operation of operations) {
      checksByPath.set(operation.ref.path, {
        ref: operation.ref,
        expectedVersion: operation.expectedVersion,
      });
      for (const dependency of operation.dependencies) {
        const previous = checksByPath.get(dependency.ref.path);
        if (previous && previous.expectedVersion !== dependency.expectedVersion) {
          throw new Error(`Conflicting source preconditions: ${dependency.ref.path}`);
        }
        checksByPath.set(dependency.ref.path, dependency);
      }
    }
    const checks = [...checksByPath.values()];
    const lockSnapshot = await transaction.get(lockRef);
    const sourceSnapshots = await Promise.all(checks.map(check => transaction.get(check.ref)));
    const lock = asRecord(lockSnapshot.data());
    const now = Date.now();
    if (lock.status !== 'in_progress' || lock.lease_token !== leaseToken
        || typeof lock.lease_expires_at !== 'number' || lock.lease_expires_at <= now) {
      throw new Error('Migration lease expired or was lost');
    }
    checks.forEach((check, index) => {
      const snapshot = sourceSnapshots[index];
      const actualVersion = snapshot.exists ? snapshot.updateTime?.toMillis() || 0 : 'missing';
      if (actualVersion !== check.expectedVersion) {
        throw new Error(`Source changed after scan: ${check.ref.path}; rerun the dry-run`);
      }
    });
    operations.forEach(operation => {
      transaction.set(operation.ref, operation.data, { merge: operation.merge !== false });
    });
    transaction.set(runRef, { completed_write_groups: completedGroups, updated_at: now }, { merge: true });
    transaction.set(lockRef, { lease_expires_at: now + LEASE_DURATION_MS, updated_at: now }, { merge: true });
  });
}

async function main(): Promise<void> {
  const outletDocs = await scan(db.collection('outlets'), 'outlets');
  const outletDependencyRefs = outletDocs.map(document => document.ref);
  const aliases = buildOutletAliasMap(outletDocs.map(document => ({ id: document.id, data: document.data() })));
  for (const outlet of outletDocs) {
    const data = outlet.data();
    const canonicalId = resolveCanonicalOutletId([data.outlet_id, outlet.id, data.name], aliases);
    if (!canonicalId) {
      issue('outlets', 'unresolved_outlet');
    } else if (data.outlet_id !== canonicalId) {
      plan(outlet.ref, { outlet_id: canonicalId, schema_version: 2, migration_updated_at: Date.now() });
    }
  }

  const documents = new Map<string, Snapshot[]>();
  for (const collection of collections) {
    documents.set(collection, await scan(db.collection(collection), collection));
  }
  const refundDocs = await scan(db.collectionGroup('refunds'), 'refunds');
  const staffDocs = await scan(db.collection('staff'), 'staff');
  const privateStaffDocs = await scan(db.collection('staff_private'), 'staff_private');
  const accessDocs = await scan(db.collection('staff_access'), 'staff_access');
  const directoryDocs = await scan(db.collection('staff_directory'), 'staff_directory');
  const secretDocs = await scan(db.collection('admin_secrets'), 'admin_secrets');
  const authUsers = await loadAuthUsers();
  const authByUid = new Map(authUsers.map(user => [user.uid, user]));
  const authByEmail = new Map(
    authUsers
      .filter(user => user.email)
      .map(user => [user.email!.trim().toLowerCase(), user]),
  );

  const orderOutlets = new Map<string, string>();
  const inventoryOutlets = new Map<string, string>();
  const rawStaffOutlets = new Map<string, string>();
  for (const staff of staffDocs) {
    const data = staff.data();
    const evidence = analyzeOutletEvidence([data.outlet_id, data.outlet, data.assigned_hatch], aliases);
    if (evidence.outletId) rawStaffOutlets.set(staff.id, evidence.outletId);
  }

  for (const order of documents.get('orders') || []) {
    const data = order.data();
    const evidence = analyzeOutletEvidence([data.outlet_id, data.outlet, data.hatch], aliases);
    if (evidence.conflict) issue('orders', 'conflicting_outlet_evidence');
    if (evidence.unresolvedEvidence) issue('orders', 'unknown_outlet_evidence');
    const outletId = evidence.outletId;
    if (!outletId) issue('orders', 'unresolved_outlet');
    else orderOutlets.set(order.id, outletId);
    plan(order.ref, canonicalPatch(data, outletId, 'orders'), true, outletDependencyRefs);
  }

  for (const inventory of documents.get('inventory') || []) {
    const data = inventory.data();
    const evidence = analyzeOutletEvidence([data.outlet_id, data.outlet], aliases);
    if (evidence.conflict) issue('inventory', 'conflicting_outlet_evidence');
    if (evidence.unresolvedEvidence) issue('inventory', 'unknown_outlet_evidence');
    const outletId = evidence.outletId;
    if (!outletId) issue('inventory', 'unresolved_outlet');
    else inventoryOutlets.set(inventory.id, outletId);
    plan(inventory.ref, canonicalPatch(data, outletId, 'inventory'), true, outletDependencyRefs);
  }

  const dependentCollections = collections.filter(name => !['orders', 'inventory'].includes(name));
  for (const collection of dependentCollections) {
    for (const document of documents.get(collection) || []) {
      const data = document.data();
      const orderOutlet = typeof data.order_id === 'string' ? orderOutlets.get(data.order_id) : undefined;
      const stockOutlet = typeof data.stock_id === 'string' ? inventoryOutlets.get(data.stock_id) : undefined;
      const staffOutlet = typeof data.staff_id === 'string' ? rawStaffOutlets.get(data.staff_id) : undefined;
      const itemOutlets = Array.isArray(data.items)
        ? [...new Set(data.items.map(item => inventoryOutlets.get(String(asRecord(item).stock_item_id || ''))).filter(Boolean))]
        : [];
      const dependencyRefs = [...outletDependencyRefs];
      if (typeof data.order_id === 'string' && data.order_id) {
        dependencyRefs.push(db.collection('orders').doc(data.order_id));
      }
      if (typeof data.stock_id === 'string' && data.stock_id) {
        dependencyRefs.push(db.collection('inventory').doc(data.stock_id));
      }
      if (typeof data.staff_id === 'string' && data.staff_id) {
        dependencyRefs.push(db.collection('staff').doc(data.staff_id));
      }
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          const stockId = asRecord(item).stock_item_id;
          if (typeof stockId === 'string' && stockId) {
            dependencyRefs.push(db.collection('inventory').doc(stockId));
          }
        }
      }
      if (itemOutlets.length > 1) issue(collection, 'multiple_item_outlets');
      const evidence = analyzeOutletEvidence(
        [
          data.outlet_id, data.outlet, orderOutlet, stockOutlet, staffOutlet,
          itemOutlets.length === 1 ? itemOutlets[0] : undefined,
        ],
        aliases,
      );
      if (evidence.conflict) issue(collection, 'conflicting_outlet_evidence');
      if (evidence.unresolvedEvidence) issue(collection, 'unknown_outlet_evidence');
      const outletId = evidence.outletId;
      if (!outletId) issue(collection, 'unresolved_outlet');
      if (collection === 'stock_movements' && stockMovementBalances(data) === false) {
        issue(collection, 'quantity_arithmetic_mismatch');
      }
      plan(document.ref, canonicalPatch(data, outletId, collection), true, dependencyRefs);
    }
  }

  for (const refund of refundDocs) {
    const data = refund.data();
    const orderId = refund.ref.parent.parent?.id;
    const evidence = analyzeOutletEvidence(
      [data.outlet_id, orderId ? orderOutlets.get(orderId) : undefined],
      aliases,
    );
    if (evidence.conflict) issue('refunds', 'conflicting_outlet_evidence');
    if (evidence.unresolvedEvidence) issue('refunds', 'unknown_outlet_evidence');
    const outletId = evidence.outletId;
    if (!outletId) issue('refunds', 'unresolved_outlet');
    const dependencyRefs = [...outletDependencyRefs];
    if (orderId) dependencyRefs.push(db.collection('orders').doc(orderId));
    plan(refund.ref, canonicalPatch(data, outletId, 'refunds'), true, dependencyRefs);
  }

  const accessByUid = new Map(accessDocs.map(document => [document.id, document]));
  const directoryByStaffId = new Map(directoryDocs.map(document => [document.id, document]));
  const staffIds = new Set(staffDocs.map(document => document.id));
  for (const directory of directoryDocs) {
    if (!staffIds.has(directory.id)) issue('staff_directory', 'orphan_projection');
  }
  const allowedRoles = new Set([
    'staff', 'manager', 'admin', 'owner', 'rider', 'kitchen', 'chef',
    'deep_fryer', 'grill_fryer', 'biryani_master', 'brewer',
  ]);
  const sensitiveFields = [
    ['faceDescriptor', 'face_descriptor'],
    ['face_descriptor', 'face_descriptor'],
    ['biometric_template', 'biometric_template'],
    ['totp_secret', 'totp_secret'],
    ['salary', 'salary'],
    ['hourly_rate', 'hourly_rate'],
  ] as const;
  let encryptionKey: Buffer | null = null;
  try {
    encryptionKey = getConfiguredFieldEncryptionKey();
  } catch {
    // Reported as blocking only if encrypted source data is actually present.
  }
  if (rotateEncryption && !encryptionKey) issue('staff_private', 'current_encryption_key_not_configured');
  const claimedAuthUids = new Map<string, string>();

  for (const staff of staffDocs) {
    const data = staff.data();
    const role = normalized(data.role) || 'staff';
    const status = normalized(data.status) || 'inactive';
    if (!allowedRoles.has(role)) {
      issue('staff', 'invalid_role');
      continue;
    }
    const outletEvidence = analyzeOutletEvidence(
      [data.outlet_id, data.outlet, data.assigned_hatch],
      aliases,
    );
    if (outletEvidence.conflict) issue('staff', 'conflicting_outlet_evidence');
    if (outletEvidence.unresolvedEvidence && !['owner', 'admin'].includes(role)) {
      issue('staff', 'unknown_outlet_evidence');
    }
    const outletId = outletEvidence.outletId || (role === 'owner' || role === 'admin' ? 'global' : null);
    if (!outletId) {
      issue('staff', 'unresolved_outlet');
      continue;
    }
    const identity = resolveAuthUser(staff.id, data, authByUid, authByEmail);
    const user = identity.user;
    if (!user) {
      issue('staff', identity.conflict ? 'conflicting_auth_identity' : 'unresolved_auth_user');
      continue;
    }
    if (claimedAuthUids.has(user.uid)) {
      issue('staff', 'duplicate_auth_uid');
      continue;
    }
    claimedAuthUids.set(user.uid, staff.id);

    const existingAccess = accessByUid.get(user.uid)?.data();
    const accessChanged = !existingAccess
      || existingAccess.role !== role
      || existingAccess.status !== status
      || existingAccess.outlet_id !== outletId
      || existingAccess.staff_id !== staff.id;
    const storedVersion = existingAccess?.token_version;
    const legacyVersion = data.token_version ?? user.customClaims?.token_version;
    const baseVersion = typeof storedVersion === 'number' && Number.isSafeInteger(storedVersion) && storedVersion > 0
      ? storedVersion
      : typeof legacyVersion === 'number' && Number.isSafeInteger(legacyVersion) && legacyVersion > 0
        ? legacyVersion
        : 1;
    // Role and outlet are authoritative in staff_access, so a stable version avoids
    // a cross-service lockout window while Auth claims and Firestore update separately.
    const tokenVersion = baseVersion;
    const accessData = {
      staff_id: staff.id,
      role,
      status,
      outlet_id: outletId,
      token_version: tokenVersion,
      updated_at: Date.now(),
    };

    const group: UnversionedWrite[] = [];
    if (accessChanged || existingAccess?.token_version !== tokenVersion) {
      group.push({ ref: db.collection('staff_access').doc(user.uid), data: accessData });
    }

    const directoryRef = db.collection('staff_directory').doc(staff.id);
    const existingDirectory = directoryByStaffId.get(staff.id)?.data();
    const directory = publicStaffProjection(staff.id, data, outletId);
    const directoryFields = ['staff_id', 'employee_id', 'name', 'role', 'status', 'outlet_id', 'assigned_hatch'];
    const directoryChanged = !existingDirectory
      || directoryFields.some(field => !sameScalar(existingDirectory[field], directory[field]))
      || Object.keys(existingDirectory).some(field => ![...directoryFields, 'updated_at'].includes(field));
    if (directoryChanged) group.push({ ref: directoryRef, data: directory, merge: false });

    const encryptedFields: DataRecord = {};
    const deletions: DataRecord = {};
    let passcodeHash: ReturnType<typeof hashPasscode> | null = null;
    for (const [sourceField, privateField] of sensitiveFields) {
      if (data[sourceField] === undefined) continue;
      if (encryptedFields[privateField] !== undefined) {
        issue('staff', 'duplicate_sensitive_field');
        continue;
      }
      count(writeCounts, 'sensitive_fields_planned');
      if (!encryptionKey) {
        issue('staff', 'encryption_key_not_configured');
      } else {
        encryptedFields[privateField] = encryptField(
          data[sourceField],
          encryptionKey,
          fieldAad('staff_private', staff.id, privateField),
        );
        deletions[sourceField] = FieldValue.delete();
      }
    }
    if (typeof data.passcode === 'string' && data.passcode) {
      count(writeCounts, 'passcodes_planned');
      try {
        passcodeHash = hashPasscode(data.passcode);
        deletions.passcode = FieldValue.delete();
      } catch {
        issue('staff', 'passcode_pepper_not_configured');
      }
    }
    if (Object.keys(encryptedFields).length > 0 || passcodeHash) {
      group.push({
        ref: db.collection('staff_private').doc(staff.id),
        data: {
          staff_id: staff.id,
          auth_uid: user.uid,
          key_version: fieldEncryptionKeyVersion(),
          schema_version: 1,
          encrypted_fields: encryptedFields,
          ...(passcodeHash ? { passcode_hash: passcodeHash } : {}),
          migrated_at: Date.now(),
        },
      });
      group.push({
        ref: staff.ref,
        data: {
          ...deletions,
          auth_uid: user.uid,
          outlet_id: outletId,
          token_version: tokenVersion,
          sensitive_data_migrated_at: Date.now(),
        },
      });
    } else if (data.auth_uid !== user.uid || data.outlet_id !== outletId || data.token_version !== tokenVersion) {
      group.push({
        ref: staff.ref,
        data: { auth_uid: user.uid, outlet_id: outletId, token_version: tokenVersion },
      });
    }
    for (const operation of group) {
      operation.dependencyRefs = [staff.ref, ...outletDependencyRefs];
    }
    planGroup(group);

    if (!claimsMatch(user, role, outletId, tokenVersion)) {
      claimUpdates.push({
        user,
        claims: claimsFor(user, role, outletId, tokenVersion),
        staffRef: staff.ref,
        staffVersion: sourceVersionsByPath.get(staff.ref.path) || 0,
      });
    }
  }
  for (const access of accessDocs) {
    if (!claimedAuthUids.has(access.id)) issue('staff_access', 'orphan_access_record');
  }

  for (const privateDocument of privateStaffDocs) {
    const data = privateDocument.data();
    const encryptedFields = asRecord(data.encrypted_fields);
    const rotatedFields: DataRecord = {};
    for (const [field, value] of Object.entries(encryptedFields)) {
      if (!isEncryptedEnvelope(value)) {
        issue('staff_private', 'malformed_encrypted_field');
        continue;
      }
      try {
        const plaintext = decryptField<unknown>(
          value,
          getFieldEncryptionKey(value.key_version),
          fieldAad('staff_private', privateDocument.id, field),
        );
        if (rotateEncryption && value.key_version !== fieldEncryptionKeyVersion() && encryptionKey) {
          rotatedFields[field] = encryptField(
            plaintext,
            encryptionKey,
            fieldAad('staff_private', privateDocument.id, field),
          );
        }
      } catch {
        issue('staff_private', 'undecryptable_encrypted_field');
      }
    }
    if (Object.keys(rotatedFields).length > 0) {
      plan(privateDocument.ref, {
        encrypted_fields: { ...encryptedFields, ...rotatedFields },
        key_version: fieldEncryptionKeyVersion(),
        rotated_at: Date.now(),
      });
    }
  }

  for (const secretDocument of secretDocs) {
    const data = secretDocument.data();
    const hasPlaintext = data.secret !== undefined && data.secret !== null;
    const plaintext = typeof data.secret === 'string' && data.secret ? data.secret : null;
    if (hasPlaintext && plaintext === null) {
      issue('admin_secrets', 'malformed_plaintext_secret');
      continue;
    }
    if (plaintext !== null && data.secret_encrypted !== undefined) {
      if (!isEncryptedEnvelope(data.secret_encrypted)) {
        issue('admin_secrets', 'malformed_encrypted_secret');
        continue;
      }
      try {
        const encryptedPlaintext = decryptField<string>(
          data.secret_encrypted,
          getFieldEncryptionKey(data.secret_encrypted.key_version),
          fieldAad('admin_secrets', secretDocument.id, 'secret'),
        );
        if (encryptedPlaintext !== plaintext) {
          issue('admin_secrets', 'plaintext_encrypted_secret_mismatch');
          continue;
        }
        const patch: DataRecord = {
          secret: FieldValue.delete(),
          plaintext_removed_at: Date.now(),
        };
        if (rotateEncryption && data.secret_encrypted.key_version !== fieldEncryptionKeyVersion()) {
          if (!encryptionKey) {
            issue('admin_secrets', 'encryption_key_not_configured');
            continue;
          }
          patch.secret_encrypted = encryptField(
            plaintext,
            encryptionKey,
            fieldAad('admin_secrets', secretDocument.id, 'secret'),
          );
          patch.key_version = fieldEncryptionKeyVersion();
          patch.rotated_at = Date.now();
        }
        count(writeCounts, 'totp_secrets_planned');
        plan(secretDocument.ref, patch);
      } catch {
        issue('admin_secrets', 'undecryptable_encrypted_secret');
      }
    } else if (plaintext !== null) {
      if (!encryptionKey) {
        issue('admin_secrets', 'encryption_key_not_configured');
      } else {
        count(writeCounts, 'totp_secrets_planned');
        plan(secretDocument.ref, {
          secret_encrypted: encryptField(
            plaintext,
            encryptionKey,
            fieldAad('admin_secrets', secretDocument.id, 'secret'),
          ),
          secret: FieldValue.delete(),
          key_version: fieldEncryptionKeyVersion(),
          encrypted_at: Date.now(),
        });
      }
    } else if (data.secret_encrypted !== undefined) {
      if (!isEncryptedEnvelope(data.secret_encrypted)) {
        issue('admin_secrets', 'malformed_encrypted_secret');
        continue;
      }
      try {
        const plaintext = decryptField<string>(
          data.secret_encrypted,
          getFieldEncryptionKey(data.secret_encrypted.key_version),
          fieldAad('admin_secrets', secretDocument.id, 'secret'),
        );
        if (rotateEncryption && data.secret_encrypted.key_version !== fieldEncryptionKeyVersion() && encryptionKey) {
          plan(secretDocument.ref, {
            secret_encrypted: encryptField(
              plaintext,
              encryptionKey,
              fieldAad('admin_secrets', secretDocument.id, 'secret'),
            ),
            key_version: fieldEncryptionKeyVersion(),
            rotated_at: Date.now(),
          });
        }
      } catch {
        issue('admin_secrets', 'undecryptable_encrypted_secret');
      }
    }
  }

  const orderRefundTotals = new Map<string, number>();
  for (const refund of refundDocs) {
    const orderId = refund.ref.parent.parent?.id;
    let amount: number | null = null;
    try {
      amount = readCanonicalMoneyPaise(refund.data(), 'refund_amount', 'refund_amount_paise');
    } catch {
      issue('refunds', 'money_conflict:refund_amount_paise');
    }
    if (!orderId) issue('refunds', 'missing_parent_order');
    else if (amount !== null) orderRefundTotals.set(orderId, (orderRefundTotals.get(orderId) || 0) + amount);
    if (Array.isArray(refund.data().items_refunded) && refund.data().items_refunded.length > 0) {
      let itemTotal = 0;
      try {
        for (const item of refund.data().items_refunded) {
          itemTotal += readCanonicalMoneyPaise(asRecord(item), 'refund_amount', 'refund_amount_paise') || 0;
        }
        if (amount !== null && itemTotal !== amount) issue('refunds', 'item_total_mismatch');
      } catch {
        issue('refunds', 'item_money_conflict');
      }
    }
  }

  const orderPaymentTotals = new Map<string, number>();
  for (const payment of documents.get('payment_ledger') || []) {
    const data = payment.data();
    if (data.status !== 'captured') continue;
    if (typeof data.order_id !== 'string' || !data.order_id) {
      issue('payment_ledger', 'missing_order_id');
      continue;
    }
    if (!orderOutlets.has(data.order_id)) issue('payment_ledger', 'orphan_order_reference');
    let amount: number | null = null;
    try {
      amount = readCanonicalMoneyPaise(data, 'amount', 'amount_paise');
    } catch {
      issue('payment_ledger', 'money_conflict:amount_paise');
    }
    if (amount !== null) {
      orderPaymentTotals.set(data.order_id, (orderPaymentTotals.get(data.order_id) || 0) + amount);
    }
  }

  for (const order of documents.get('orders') || []) {
    const data = order.data();
    let total: number | null = null;
    let refunded: number | null = null;
    let subtotal: number | null = null;
    let platformFee = 0;
    let promoDiscount = 0;
    let itemSubtotal: number | null = null;
    try {
      total = readCanonicalMoneyPaise(data, 'gross_amount', 'gross_amount_paise');
      refunded = readCanonicalMoneyPaise(data, 'refunded_amount', 'refunded_amount_paise') || 0;
      subtotal = readCanonicalMoneyPaise(data, 'subtotal_amount', 'subtotal_amount_paise');
      platformFee = readCanonicalMoneyPaise(data, 'platform_fee', 'platform_fee_paise') || 0;
      promoDiscount = readCanonicalMoneyPaise(data, 'promo_discount', 'promo_discount_paise') || 0;
      itemSubtotal = calculateOrderItemSubtotalPaise(data);
    } catch {
      issue('orders', 'money_conflict:aggregate');
    }
    if (total === null) issue('orders', 'missing_gross_amount');
    if (itemSubtotal === null) {
      issue('orders', 'missing_or_invalid_item_total');
    } else if (subtotal !== null && subtotal !== itemSubtotal) {
      issue('orders', 'item_subtotal_mismatch');
    }
    const reconciledSubtotal = subtotal ?? itemSubtotal;
    const points = data.points_redeemed === undefined || data.points_redeemed === null
      ? 0
      : data.points_redeemed;
    if (typeof points !== 'number' || !Number.isSafeInteger(points) || points < 0) {
      issue('orders', 'invalid_points_redeemed');
    } else if (total !== null && reconciledSubtotal !== null) {
      const expectedGross = reconciledSubtotal + platformFee - promoDiscount - (points * 100);
      if (!Number.isSafeInteger(expectedGross) || expectedGross < 0 || expectedGross !== total) {
        issue('orders', 'gross_pricing_equation_mismatch');
      }
    }
    const refunds = orderRefundTotals.get(order.id) || 0;
    if (total !== null && refunds > total) issue('orders', 'refunds_exceed_order_total');
    if (refunded !== null && refunded !== refunds) issue('orders', 'refund_ledger_total_mismatch');
    const captured = orderPaymentTotals.get(order.id) || 0;
    const paid = data.is_paid === true || data.payment_status === 'paid';
    if (paid && captured === 0) issue('orders', 'paid_order_missing_payment_ledger');
    if (total !== null && captured > 0 && captured !== total) issue('orders', 'payment_ledger_total_mismatch');
    if (!paid && captured > 0) issue('orders', 'captured_payment_on_unpaid_order');
  }

  for (const request of documents.get('refund_requests') || []) {
    const data = request.data();
    if (data.request_scope !== 'items' || !Array.isArray(data.items_requested)) continue;
    try {
      const total = readCanonicalMoneyPaise(data, 'requested_amount', 'requested_amount_paise') || 0;
      const itemTotal = data.items_requested.reduce((sum: number, item: unknown) => (
        sum + (readCanonicalMoneyPaise(
          asRecord(item),
          'requested_amount',
          'requested_amount_paise',
        ) || 0)
      ), 0);
      if (total !== itemTotal) issue('refund_requests', 'item_total_mismatch');
    } catch {
      issue('refund_requests', 'item_money_conflict');
    }
  }

  for (const closing of documents.get('daily_closings') || []) {
    const data = closing.data();
    const money = asRecord(data.money_paise);
    try {
      const sales = asRecord(data.sales_summary);
      const cash = asRecord(data.cash_reconciliation);
      const payment = asRecord(data.payment_reconciliation);
      const gross = readCanonicalMoneyPaise(
        { amount: sales.gross_sales, amount_paise: money.gross_sales },
        'amount',
        'amount_paise',
      ) || 0;
      const net = readCanonicalMoneyPaise(
        { amount: sales.net_sales, amount_paise: money.net_sales },
        'amount',
        'amount_paise',
      ) || 0;
      const discount = readCanonicalMoneyPaise(
        { amount: sales.discount_amount, amount_paise: money.discount_amount },
        'amount',
        'amount_paise',
      ) || 0;
      if (gross !== net + discount) issue('daily_closings', 'gross_net_discount_equation');
      const expectedCash = readCanonicalMoneyPaise(
        { amount: cash.expected_cash, amount_paise: money.expected_cash },
        'amount',
        'amount_paise',
      ) || 0;
      const countedCash = readCanonicalMoneyPaise(
        { amount: cash.counted_cash, amount_paise: money.counted_cash },
        'amount',
        'amount_paise',
      ) || 0;
      const cashDifference = readCanonicalMoneyPaise(
        { amount: cash.cash_difference, amount_paise: money.cash_difference },
        'amount',
        'amount_paise',
        true,
      ) || 0;
      if (cashDifference !== countedCash - expectedCash) issue('daily_closings', 'cash_reconciliation_equation');
      const expectedUpi = readCanonicalMoneyPaise(
        { amount: payment.expected_upi, amount_paise: money.expected_upi },
        'amount',
        'amount_paise',
      ) || 0;
      const verifiedUpi = readCanonicalMoneyPaise(
        { amount: payment.verified_upi, amount_paise: money.verified_upi },
        'amount',
        'amount_paise',
      ) || 0;
      const upiDifference = readCanonicalMoneyPaise(
        { amount: payment.upi_difference, amount_paise: money.upi_difference },
        'amount',
        'amount_paise',
        true,
      ) || 0;
      if (upiDifference !== verifiedUpi - expectedUpi) issue('daily_closings', 'upi_reconciliation_equation');
    } catch {
      issue('daily_closings', 'reconciliation_money_conflict');
    }
  }

  detectDuplicateWriteTargets();
  const codeHash = migrationCodeHash();
  const manifestHash = createHash('sha256').update(JSON.stringify({
    migration_version: MIGRATION_VERSION,
    migration_code_hash: codeHash,
    project_id: projectId,
    options: {
      max_documents: maxDocuments,
      rotate_encryption: rotateEncryption,
      key_version: fieldEncryptionKeyVersion(),
    },
    source_versions: [...sourceVersionTokens].sort(),
    writes: writeGroups.flatMap(group => group.map(operation => ({
      path: operation.ref.path,
      merge: operation.merge !== false,
      expected_version: operation.expectedVersion,
      dependencies: operation.dependencies
        .map(dependency => ({ path: dependency.ref.path, expected_version: dependency.expectedVersion }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      keys: Object.keys(operation.data).sort(),
    }))),
    claims: claimUpdates.map(update => ({
      uid: update.user.uid,
      current_claims: Object.entries(update.user.customClaims || {}).sort(([left], [right]) => left.localeCompare(right)),
      next_claims: Object.entries(update.claims).sort(([left], [right]) => left.localeCompare(right)),
      staff_path: update.staffRef.path,
      staff_version: update.staffVersion,
    })).sort((left, right) => left.uid.localeCompare(right.uid)),
  })).digest('hex');
  const blockers = [...issueCounts.values()].reduce((sum, value) => sum + value, 0);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    project_confirmed: apply,
    scanned: Object.fromEntries([...scannedCounts].sort()),
    planned_writes: Object.fromEntries([...writeCounts].sort()),
    planned_claim_updates: claimUpdates.length,
    migration_version: MIGRATION_VERSION,
    migration_code_hash: codeHash,
    manifest_hash: manifestHash,
    blocking_issues: Object.fromEntries([...issueCounts].sort()),
    scan_limit_reached: scanLimitReached,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log(blockers ? 'DRY RUN BLOCKED: resolve reported issues before apply.' : 'DRY RUN READY: no blocking reconciliation issues found.');
    return;
  }
  if (blockers || scanLimitReached) throw new Error('Apply refused because the dry-run checks found blocking issues');
  if (confirmManifest !== manifestHash) {
    throw new Error('Apply refused: --confirm-manifest must exactly match the current dry-run manifest hash');
  }

  const lease = await acquireMigrationLease(manifestHash);
  if (lease.alreadyComplete) {
    console.log(JSON.stringify({ status: 'already_complete', manifest_hash: manifestHash }));
    return;
  }

  // Claims do not grant authority without staff_access, so this phase is safe to repeat.
  for (let index = 0; index < claimUpdates.length; index += 1) {
    const update = claimUpdates[index];
    if (index > 0 && index % 50 === 0) {
      await renewMigrationLease(lease.lockRef, lease.runRef, lease.leaseToken, 'claims');
    }
    const currentStaff = await update.staffRef.get();
    const currentStaffVersion = currentStaff.exists ? currentStaff.updateTime?.toMillis() || 0 : -1;
    if (currentStaffVersion !== update.staffVersion) {
      throw new Error(`Staff source changed after scan: ${update.staffRef.path}; rerun the dry-run`);
    }
    await setCustomUserClaimsLocked(
      db,
      auth,
      update.user.uid,
      () => update.claims,
      claimsFingerprint(update.user.customClaims),
    );
  }
  await renewMigrationLease(lease.lockRef, lease.runRef, lease.leaseToken, 'database');

  const writeChunks = buildWriteChunks(lease.completedGroups);
  for (const chunk of writeChunks) {
    await applyWriteChunk(
      chunk.operations,
      chunk.completedGroups,
      lease.lockRef,
      lease.runRef,
      lease.leaseToken,
    );
  }

  await renewMigrationLease(lease.lockRef, lease.runRef, lease.leaseToken, 'revoking_tokens');
  for (let index = 0; index < claimUpdates.length; index += 1) {
    const update = claimUpdates[index];
    if (index > 0 && index % 50 === 0) {
      await renewMigrationLease(lease.lockRef, lease.runRef, lease.leaseToken, 'revoking_tokens');
    }
    await auth.revokeRefreshTokens(update.user.uid);
  }
  await db.runTransaction(async transaction => {
    const lockSnapshot = await transaction.get(lease.lockRef);
    const lock = asRecord(lockSnapshot.data());
    if (lock.status !== 'in_progress' || lock.lease_token !== lease.leaseToken) {
      throw new Error('Migration lease was lost before completion');
    }
    const now = Date.now();
    transaction.set(lease.runRef, {
      status: 'complete',
      phase: 'complete',
      completed_write_groups: writeGroups.length,
      completed_at: now,
      updated_at: now,
    }, { merge: true });
    transaction.set(lease.lockRef, {
      status: 'complete',
      completed_at: now,
      lease_expires_at: now,
      lease_token: FieldValue.delete(),
      updated_at: now,
    }, { merge: true });
  });
  console.log(JSON.stringify({ applied_write_groups: writeGroups.length, applied_claim_updates: claimUpdates.length }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
});
