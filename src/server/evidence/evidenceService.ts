import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logBusinessEvent, ActorType } from '../events/logBusinessEvent';
import { EvidenceRecord, EvidenceCategory, EvidenceType, StoragePolicy, EvidenceImportance, EvidenceRelatedEntity, CreatedByType, EvidenceSource } from './types';

export const EVIDENCE_COL = 'evidence_records';
export const COUNTERS_COL = 'counters';

export interface CreateEvidenceParams {
  category: EvidenceCategory;
  evidence_type: EvidenceType;
  importance: EvidenceImportance;
  storage_policy: StoragePolicy;
  original_file_name: string;
  mime_type?: string;
  declared_size_bytes?: number;
  expected_drive_file_id?: string;
  related_entities: EvidenceRelatedEntity[];
  created_by_type: CreatedByType;
  created_by_id: string;
  outlet_id: string;
  source: EvidenceSource;
  importance_selected_by?: string;
  direct_archive_reason?: string;
}

function sanitizeFilename(filename: string): string {
  // Remove PII-like patterns (e.g. phone numbers, emails)
  // This is a basic sanitizer; replace spaces and special chars.
  let safe = filename.replace(/[\s\/\\:*?"<>|]/g, '_');
  // Strip potential phone numbers (consecutive 10+ digits)
  safe = safe.replace(/\d{10,}/g, 'REDACTED');
  // Strip potential emails
  safe = safe.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 'REDACTED');
  return safe;
}

export async function createEvidenceRecord(params: CreateEvidenceParams): Promise<EvidenceRecord> {
  const now = new Date();
  // YYYYMMDD in IST or UTC (we use UTC here for consistency in global counters)
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); 
  
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');

  const counterRef = adminDb!.collection(COUNTERS_COL).doc(`evidence-${dateStr}`);
  const internalId = crypto.randomUUID();
  const evidenceRef = adminDb!.collection(EVIDENCE_COL).doc(internalId);

  const recordPayload = await adminDb!.runTransaction(async (t) => {
    const counterSnap = await t.get(counterRef);
    let seq = 1;
    if (counterSnap.exists) {
      seq = (counterSnap.data()?.seq || 0) + 1;
    }
    t.set(counterRef, { seq }, { merge: true });

    const paddedSeq = String(seq).padStart(6, '0');
    const evidenceNo = `EV-${dateStr}-${paddedSeq}`;

    const safeOriginal = sanitizeFilename(params.original_file_name);
    // e.g. EV-20260810-000184_REFUND_ORD-184_photo.jpg
    const mainEntity = params.related_entities.length > 0 ? params.related_entities[0] : null;
    const entityTag = mainEntity ? `_${mainEntity.type}-${mainEntity.id}` : '';
    
    // Extract extension safely
    const extMatch = safeOriginal.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? `.${extMatch[1]}` : '';
    const archiveFileName = `${evidenceNo}_${params.category}${entityTag}${ext}`;

    const storagePath = `evidence/${yyyy}/${mm}/${dd}/${internalId}/${archiveFileName}`;

    const related_entity_keys = params.related_entities.map(
      e => `${e.type.toUpperCase()}:${e.id}`
    );

    const newRecord: EvidenceRecord = {
      id: internalId,
      evidence_no: evidenceNo,
      outlet_id: params.outlet_id,
      category: params.category,
      source: params.source,
      evidence_type: params.evidence_type,
      importance: params.importance,
      storage_policy: params.storage_policy,
      storage_state: 'UPLOADING',
      evidence_status: 'PENDING_REVIEW',
      original_file_name: safeOriginal,
      archive_file_name: archiveFileName,
      mime_type: params.mime_type,
      declared_size_bytes: params.declared_size_bytes,
      related_entities: params.related_entities,
      related_entity_keys,
      supabase_path: params.storage_policy === 'ACTIVE_THEN_ARCHIVE' ? storagePath : null,
      expected_drive_file_id: params.storage_policy === 'DIRECT_ARCHIVE' ? params.expected_drive_file_id || null : null,
      archive_verified: false,
      importance_selected_by: params.importance_selected_by,
      importance_selected_at: params.importance_selected_by ? FieldValue.serverTimestamp() as any : undefined,
      direct_archive_reason: params.direct_archive_reason,
      created_by_type: params.created_by_type,
      created_by_id: params.created_by_id,
      created_at: FieldValue.serverTimestamp() as any,
      updated_at: FieldValue.serverTimestamp() as any,
    };

    t.set(evidenceRef, newRecord);
    return newRecord;
  });

  // Fire business events after successful transaction
  let actorType: ActorType = 'system';
  if (params.created_by_type === 'USER') actorType = 'manager';
  if (params.created_by_type === 'CUSTOMER') actorType = 'customer';

  await logBusinessEvent({
    event_type: 'evidence_record_created',
    actor_type: actorType,
    actor_id: params.created_by_id,
    target_type: 'evidence',
    target_id: internalId,
    outlet_id: params.outlet_id,
    severity: 'info',
    source: 'api',
    metadata: {
      evidence_no: recordPayload.evidence_no,
      category: params.category,
      evidence_type: params.evidence_type,
      storage_policy: params.storage_policy
    }
  });

  if (params.importance !== 'NORMAL' && params.importance_selected_by) {
    await logBusinessEvent({
      event_type: 'evidence_importance_selected',
      actor_type: actorType,
      actor_id: params.importance_selected_by,
      target_type: 'evidence',
      target_id: internalId,
      outlet_id: params.outlet_id,
      severity: 'info',
      source: 'api',
      metadata: {
        evidence_no: recordPayload.evidence_no,
        importance: params.importance,
        reason: params.direct_archive_reason
      }
    });
  }

  return recordPayload;
}
