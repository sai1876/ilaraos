import { Timestamp } from 'firebase-admin/firestore';

export type EvidenceCategory =
  | 'WHATSAPP'
  | 'REFUND'
  | 'COMPLAINT'
  | 'WASTAGE'
  | 'INVENTORY'
  | 'PURCHASE'
  | 'CLOSING'
  | 'STAFF'
  | 'ORDER'
  | 'OTHER';

export type EvidenceSource =
  | 'WHATSAPP'
  | 'CUSTOMER'
  | 'MANAGER_UPLOAD'
  | 'OWNER_UPLOAD'
  | 'STAFF_UPLOAD'
  | 'SYSTEM';

export type EvidenceType =
  | 'IMAGE'
  | 'AUDIO'
  | 'VOICE_NOTE'
  | 'VIDEO'
  | 'PDF'
  | 'DOCUMENT'
  | 'SCREENSHOT'
  | 'INVOICE'
  | 'OTHER';

export type EvidenceImportance = 'NORMAL' | 'IMPORTANT' | 'CRITICAL';

export type StoragePolicy = 'ACTIVE_THEN_ARCHIVE' | 'DIRECT_ARCHIVE';

export type StorageState =
  | 'UPLOADING'
  | 'ACTIVE'
  | 'ARCHIVE_DUE'
  | 'ARCHIVING'
  | 'VERIFYING'
  | 'ARCHIVED'
  | 'UPLOAD_FAILED'
  | 'ARCHIVE_FAILED'
  | 'VERIFICATION_FAILED'
  | 'DELETE_FAILED';

export type IntegrityStatus =
  | 'PENDING'
  | 'SHA256_VERIFIED'
  | 'PROVIDER_CHECKSUM_VERIFIED'
  | 'METADATA_VERIFIED'
  | 'FAILED';

export type EvidenceStatus =
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type EntityType =
  | 'CUSTOMER'
  | 'CHAT'
  | 'MESSAGE'
  | 'ORDER'
  | 'REFUND'
  | 'ESCALATION'
  | 'COMPLAINT'
  | 'WASTAGE'
  | 'PURCHASE'
  | 'CLOSING'
  | 'STAFF'
  | 'OTHER';

export interface EvidenceRelatedEntity {
  type: EntityType;
  id: string;
}

export type CreatedByType = 'CUSTOMER' | 'USER' | 'SYSTEM';

export interface EvidenceRecord {
  id: string; // The internal immutable UUID/ULID
  evidence_no: string; // The human-readable EV-YYYYMMDD-XXXXXX
  outlet_id: string; // Canonical operating context

  category: EvidenceCategory;
  source: EvidenceSource;
  evidence_type: EvidenceType;
  importance: EvidenceImportance;
  
  storage_policy: StoragePolicy;
  storage_state: StorageState;
  evidence_status: EvidenceStatus;

  original_file_name: string;
  archive_file_name: string;

  mime_type?: string;
  declared_size_bytes?: number;
  size_bytes?: number; // Verified size
  
  sha256?: string;
  provider_checksum?: string;
  provider_checksum_algorithm?: 'SHA256' | 'SHA1' | 'MD5';
  integrity_status?: IntegrityStatus;

  related_entities: EvidenceRelatedEntity[];
  related_entity_keys?: string[];

  supabase_bucket?: string | null;
  supabase_path?: string | null;

  expected_drive_file_id?: string | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;

  activated_at?: Timestamp | null;
  archive_due_at?: Timestamp | null;
  archived_at?: Timestamp | null;
  archive_verified: boolean;

  importance_selected_by?: string;
  importance_selected_at?: Timestamp;
  direct_archive_reason?: string;

  created_by_type: CreatedByType;
  created_by_id?: string;

  created_at: Timestamp;
  updated_at: Timestamp;

  upload_attempt_count?: number;
  last_upload_attempt_at?: Timestamp;
  last_upload_error_code?: string;

  archive_trigger?: 'AUTOMATIC_72H' | 'MANUAL' | 'MARKED_IMPORTANT' | 'DIRECT_AT_CREATION';
  archive_requested_by?: string;
  archive_requested_at?: Timestamp;

  archive_lease_owner?: string;
  archive_lease_expires_at?: Timestamp | null;
  archive_attempt_count?: number;
  last_archive_attempt_at?: Timestamp;
  last_archive_error_code?: string;

  superseded_by?: string;

  retention_hold?: boolean;
  retention_hold_reason?: string;
}
