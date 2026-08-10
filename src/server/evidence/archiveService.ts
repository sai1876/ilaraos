import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { EvidenceRecord } from './types';
import { getStreamForTransfer, deleteObject } from '../supabase/storageAdmin';
import { getOrCreateCategoryFolder, getPreGeneratedFileId, streamToDrive, verifyDriveObject } from '../google/driveAdmin';
import { Readable, Transform } from 'stream';
import * as crypto from 'crypto';
import { logBusinessEvent } from '../events/logBusinessEvent';
import { EVIDENCE_COL } from './evidenceService';

const LEASE_DURATION_MS = 15 * 60 * 1000;

export async function getEligibleEvidenceForArchive(batchSize: number): Promise<string[]> {
  const now = Timestamp.now();
  const snapshot = await adminDb!.collection(EVIDENCE_COL)
    .where('storage_policy', '==', 'ACTIVE_THEN_ARCHIVE')
    .where('storage_state', '==', 'ACTIVE')
    .where('archive_due_at', '<=', now)
    .orderBy('archive_due_at', 'asc')
    .limit(batchSize)
    .get();
  return snapshot.docs.map(d => d.id);
}

export async function getRecoveryEvidenceForArchive(batchSize: number): Promise<string[]> {
  // We cannot do an IN query on multiple states easily combined with an inequality on lease time
  // without composite indexes for every combination. 
  // Instead, we just query for anything that is fundamentally broken or stale and sort in memory for this worker.
  // Given NoSQL limitations, querying specific failure states requires specific indexes. 
  // To keep it simple and bounded, we will query each recovery state with limit.

  const states = ['ARCHIVE_FAILED', 'VERIFICATION_FAILED', 'DELETE_FAILED', 'ARCHIVING', 'VERIFYING'];
  let results: any[] = [];
  
  for (const state of states) {
    if (results.length >= batchSize) break;
    const snap = await adminDb!.collection(EVIDENCE_COL)
      .where('storage_policy', '==', 'ACTIVE_THEN_ARCHIVE')
      .where('storage_state', '==', state)
      .limit(batchSize)
      .get();
    
    for (const doc of snap.docs) {
      const data = doc.data();
      // If it's a working state, it must be stale
      if (['ARCHIVING', 'VERIFYING'].includes(state)) {
        if (!data.archive_lease_expires_at || data.archive_lease_expires_at.toMillis() <= Date.now()) {
          results.push(doc.id);
        }
      } else {
        // Already failed, eligible for retry (ideally with backoff, but immediate for now)
        results.push(doc.id);
      }
    }
  }

  return results.slice(0, batchSize);
}

async function acquireLease(evidenceId: string, workerId: string) {
  const docRef = adminDb!.collection(EVIDENCE_COL).doc(evidenceId);
  return await adminDb!.runTransaction(async (t) => {
    const doc = await t.get(docRef);
    if (!doc.exists) return null;
    const data = doc.data() as EvidenceRecord;

    if (data.storage_policy !== 'ACTIVE_THEN_ARCHIVE') return null;
    if (data.storage_state === 'ARCHIVED') return null;

    if (
      data.archive_lease_owner &&
      data.archive_lease_expires_at &&
      data.archive_lease_expires_at.toMillis() > Date.now()
    ) {
      // Lease is currently held by someone else
      return null;
    }

    const nextState = (data.storage_state === 'ACTIVE' || data.storage_state === 'ARCHIVE_FAILED' || data.storage_state === 'VERIFICATION_FAILED') 
      ? 'ARCHIVING' 
      : data.storage_state; // KEEP DELETE_FAILED or VERIFYING as is so we don't regress

    t.update(docRef, {
      storage_state: nextState,
      archive_lease_owner: workerId,
      archive_lease_expires_at: Timestamp.fromMillis(Date.now() + LEASE_DURATION_MS),
      archive_attempt_count: FieldValue.increment(1),
      last_archive_attempt_at: FieldValue.serverTimestamp()
    });

    return data;
  });
}

async function markFailed(evidenceId: string, workerId: string, state: 'VERIFICATION_FAILED' | 'ARCHIVE_FAILED' | 'DELETE_FAILED', errorCode: string) {
  await adminDb!.collection(EVIDENCE_COL).doc(evidenceId).update({
    storage_state: state,
    archive_lease_owner: FieldValue.delete(),
    archive_lease_expires_at: FieldValue.delete(),
    last_archive_error_code: errorCode,
    updated_at: FieldValue.serverTimestamp()
  });

  await logBusinessEvent({
    event_type: 'evidence_archive_failed',
    actor_type: 'system',
    actor_id: workerId,
    target_type: 'evidence',
    target_id: evidenceId,
    outlet_id: 'system',
    severity: state === 'DELETE_FAILED' ? 'critical' : 'warning',
    source: 'cron',
    metadata: { state, errorCode }
  });
}

export async function requestEvidenceArchive(params: {
  evidenceId: string;
  trigger: 'MANUAL' | 'MARKED_IMPORTANT';
  actorId: string;
  allowBeforeDue?: boolean;
}): Promise<'QUEUED' | 'ALREADY_ARCHIVED' | 'LOCKED' | 'NOT_ELIGIBLE'> {
  const docRef = adminDb!.collection(EVIDENCE_COL).doc(params.evidenceId);
  return await adminDb!.runTransaction(async (t) => {
    const doc = await t.get(docRef);
    if (!doc.exists) return 'NOT_ELIGIBLE';
    const data = doc.data() as EvidenceRecord;

    if (data.storage_policy !== 'ACTIVE_THEN_ARCHIVE') return 'NOT_ELIGIBLE';
    if (data.storage_state === 'ARCHIVED') return 'ALREADY_ARCHIVED';

    if (!params.allowBeforeDue && data.archive_due_at && data.archive_due_at.toMillis() > Date.now()) {
      return 'NOT_ELIGIBLE';
    }

    if (
      data.archive_lease_owner &&
      data.archive_lease_expires_at &&
      data.archive_lease_expires_at.toMillis() > Date.now()
    ) {
      // It's already being worked on. We just record the request so history is preserved.
      t.update(docRef, {
        archive_trigger: params.trigger,
        archive_requested_by: params.actorId,
        archive_requested_at: FieldValue.serverTimestamp()
      });
      return 'LOCKED';
    }

    t.update(docRef, {
      storage_state: 'ARCHIVING', // immediately cue it up
      archive_trigger: params.trigger,
      archive_requested_by: params.actorId,
      archive_requested_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      // We clear the lease so the next worker run immediately picks it up, or a background invoke can take it.
      // We do not acquire it to ourselves because we are not the worker.
      archive_lease_owner: FieldValue.delete(),
      archive_lease_expires_at: FieldValue.delete()
    });

    return 'QUEUED';
  });
}

export async function markImportantAndRequestArchive(params: {
  evidenceId: string;
  actorId: string;
  reason: string;
}): Promise<'QUEUED' | 'ALREADY_ARCHIVED' | 'LOCKED' | 'NOT_ELIGIBLE'> {
  const docRef = adminDb!.collection(EVIDENCE_COL).doc(params.evidenceId);
  return await adminDb!.runTransaction(async (t) => {
    const doc = await t.get(docRef);
    if (!doc.exists) return 'NOT_ELIGIBLE';
    const data = doc.data() as EvidenceRecord;

    if (data.storage_policy !== 'ACTIVE_THEN_ARCHIVE') return 'NOT_ELIGIBLE';
    if (data.storage_state === 'ARCHIVED') return 'ALREADY_ARCHIVED';

    const updates: any = {
      importance: 'IMPORTANT',
      archive_trigger: 'MARKED_IMPORTANT',
      archive_requested_by: params.actorId,
      archive_requested_at: FieldValue.serverTimestamp(),
      importance_selected_by: params.actorId,
      importance_selected_at: FieldValue.serverTimestamp(),
      direct_archive_reason: params.reason,
      updated_at: FieldValue.serverTimestamp()
    };

    if (
      data.archive_lease_owner &&
      data.archive_lease_expires_at &&
      data.archive_lease_expires_at.toMillis() > Date.now()
    ) {
      t.update(docRef, updates);
      return 'LOCKED';
    }

    updates.storage_state = 'ARCHIVING';
    updates.archive_lease_owner = FieldValue.delete();
    updates.archive_lease_expires_at = FieldValue.delete();

    t.update(docRef, updates);

    return 'QUEUED';
  });
}

export async function processArchiveItem(evidenceId: string, workerId: string): Promise<string> {
  const recordBefore = await acquireLease(evidenceId, workerId);
  if (!recordBefore) return 'SKIPPED_OR_LOCKED';

  // We re-fetch to get the precise state after transaction
  const docRef = adminDb!.collection(EVIDENCE_COL).doc(evidenceId);
  let record = (await docRef.get()).data() as EvidenceRecord;

  try {
    // 1. Resolve Drive Identity
    if (!record.expected_drive_file_id) {
      const newId = await getPreGeneratedFileId();
      await docRef.update({ expected_drive_file_id: newId });
      record.expected_drive_file_id = newId;
    }

    // 2. DELETE_FAILED Recovery Fast Path
    if (record.storage_state === 'DELETE_FAILED' && record.archive_verified) {
      await deleteObject(record.supabase_bucket || 'evidence_bucket', record.supabase_path!);
      await docRef.update({
        storage_state: 'ARCHIVED',
        archived_at: FieldValue.serverTimestamp(),
        archive_lease_owner: FieldValue.delete(),
        archive_lease_expires_at: FieldValue.delete(),
      });
      return 'ARCHIVED_FROM_DELETE_FAILED';
    }

    const driveFolderId = await getOrCreateCategoryFolder(
      record.activated_at?.toDate() || record.created_at.toDate(),
      record.category
    );

    // 3. Stale VERIFYING Recovery
    if (record.storage_state === 'VERIFYING') {
      try {
        const driveMeta = await verifyDriveObject(record.expected_drive_file_id);
        if (!driveMeta.trashed && driveMeta.size === record.size_bytes?.toString()) {
           // We can safely resume verify
           record.drive_folder_id = driveFolderId;
        } else {
           record.storage_state = 'ARCHIVING'; // Needs re-upload
        }
      } catch (e) {
        record.storage_state = 'ARCHIVING';
      }
    }

    let streamMd5: string | undefined;

    // 4. Transfer Stream (if ARCHIVING)
    if (record.storage_state === 'ARCHIVING') {
      if (!record.supabase_path) throw new Error('Missing supabase_path');
      
      const { res: fetchRes, controller } = await getStreamForTransfer('evidence_bucket', record.supabase_path);
      
      const hashSha256 = crypto.createHash('sha256');
      const hashMd5 = crypto.createHash('md5');
      let bytesSeen = 0;

      const hashingTransform = new Transform({
        transform(chunk, encoding, callback) {
          hashSha256.update(chunk);
          hashMd5.update(chunk);
          bytesSeen += chunk.length;
          callback(null, chunk);
        }
      });

      const nodeStream = Readable.fromWeb(fetchRes.body as any);
      
      // Pipe through transform
      const finalStream = nodeStream.pipe(hashingTransform);

      try {
        await streamToDrive(
          driveFolderId,
          record.archive_file_name,
          record.mime_type || 'application/octet-stream',
          record.expected_drive_file_id,
          finalStream
        );
      } catch (err: any) {
        controller.abort();
        throw new Error(`Upload to drive failed: ${err.message}`);
      }

      const streamSha256 = hashSha256.digest('hex');
      streamMd5 = hashMd5.digest('hex');

      if (streamSha256 !== record.sha256) {
        throw new Error(`SOURCE_CORRUPTION_OR_MISMATCH: expected ${record.sha256}, got ${streamSha256}`);
      }

      await docRef.update({ storage_state: 'VERIFYING' });
      record.storage_state = 'VERIFYING';
    }

    // 5. Verification Phase
    if (record.storage_state === 'VERIFYING') {
      const driveMeta = await verifyDriveObject(record.expected_drive_file_id);
      
      if (driveMeta.trashed) throw new Error('DRIVE_VERIFY_FAILED: File is trashed');
      if (driveMeta.name !== record.archive_file_name) throw new Error('DRIVE_VERIFY_FAILED: Name mismatch');
      if (driveMeta.size !== record.size_bytes?.toString()) throw new Error('DRIVE_VERIFY_FAILED: Size mismatch');
      
      const isParentCorrect = driveMeta.parents && driveMeta.parents.includes(driveFolderId);
      if (!isParentCorrect) throw new Error('DRIVE_VERIFY_FAILED: Parent folder mismatch');

      let integrity_status = record.integrity_status;
      let provider_checksum = record.provider_checksum;
      let provider_checksum_algorithm = record.provider_checksum_algorithm;

      if (driveMeta.sha256Checksum) {
        if (driveMeta.sha256Checksum !== record.sha256) throw new Error('DRIVE_VERIFY_FAILED: SHA256 mismatch');
        integrity_status = 'SHA256_VERIFIED';
        provider_checksum = driveMeta.sha256Checksum;
        provider_checksum_algorithm = 'SHA256';
      } else if (driveMeta.md5Checksum) {
        if (streamMd5 && driveMeta.md5Checksum !== streamMd5) {
          throw new Error('DRIVE_VERIFY_FAILED: MD5 mismatch');
        }
        integrity_status = 'PROVIDER_CHECKSUM_VERIFIED';
        provider_checksum = driveMeta.md5Checksum;
        provider_checksum_algorithm = 'MD5';
      }

      // Safe state before destructive delete
      await docRef.update({
        archive_verified: true,
        drive_file_id: record.expected_drive_file_id,
        drive_folder_id: driveFolderId,
        integrity_status,
        provider_checksum,
        provider_checksum_algorithm,
        storage_state: 'VERIFYING'
      });
      record.archive_verified = true;
    }

    // 6. Delete Supabase Source (Only if verified and we still own lease)
    if (record.archive_verified) {
      // Lease check
      const leaseCheck = await docRef.get();
      if (leaseCheck.data()?.archive_lease_owner !== workerId) {
         return 'LOST_LEASE_BEFORE_DELETE';
      }

      try {
        await deleteObject('evidence_bucket', record.supabase_path!);
      } catch (err: any) {
        await markFailed(evidenceId, workerId, 'DELETE_FAILED', err.message);
        return 'DELETE_FAILED';
      }

      // Success
      await docRef.update({
        storage_state: 'ARCHIVED',
        archived_at: FieldValue.serverTimestamp(),
        archive_lease_owner: FieldValue.delete(),
        archive_lease_expires_at: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp()
      });

      await logBusinessEvent({
        event_type: 'evidence_archive_completed',
        actor_type: 'system',
        actor_id: workerId,
        target_type: 'evidence',
        target_id: evidenceId,
        outlet_id: 'system',
        severity: 'info',
        source: 'cron',
        metadata: { expected_drive_file_id: record.expected_drive_file_id }
      });

      return 'ARCHIVED';
    }

    return 'UNKNOWN_STATE';

  } catch (error: any) {
    console.error(`Archive processing failed for ${evidenceId}:`, error);
    if (error.message.includes('SOURCE_CORRUPTION') || error.message.includes('DRIVE_VERIFY_FAILED')) {
      await markFailed(evidenceId, workerId, 'VERIFICATION_FAILED', error.message);
      return 'VERIFICATION_FAILED';
    } else {
      await markFailed(evidenceId, workerId, 'ARCHIVE_FAILED', error.message);
      return 'ARCHIVE_FAILED';
    }
  }
}
