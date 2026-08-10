import { Timestamp } from 'firebase-admin/firestore';

export type ArchiveStatus =
  | 'DRAFT'
  | 'SCANNING'
  | 'READY'
  | 'EXPORTING'
  | 'VERIFYING'
  | 'READY_TO_PURGE'
  | 'PURGING'
  | 'COMPLETED'
  | 'FAILED_SCAN'
  | 'FAILED_EXPORT'
  | 'FAILED_UPLOAD'
  | 'FAILED_VERIFICATION'
  | 'FAILED_PURGE';

export interface ArchiveJob {
  archive_id: string; // Internal UUID/ULID
  archive_no: string; // ARC-YYYYMMDD-XXXXXX
  type: 'CHAT_RANGE';
  status: ArchiveStatus;
  outlet_id: string;

  range_from_utc_ms: number;
  range_to_utc_ms: number;
  source_timezone: string;

  conversations_expected?: number;
  messages_expected?: number;
  evidence_reference_count?: number;

  conversations_exported: number;
  messages_exported: number;
  files_created: number;
  bytes_exported: number;
  messages_purged: number;

  drive_folder_id?: string;
  manifest_drive_file_id?: string;
  
  manifest_commit_sha256?: string;

  created_by: string;
  created_at: Timestamp;

  started_at?: Timestamp;
  verified_at?: Timestamp;
  purged_at?: Timestamp;
  completed_at?: Timestamp;

  failure_stage?: string;
  error_code?: string;
  last_attempt_at?: Timestamp;
  attempt_count: number;

  lease_owner?: string;
  lease_expires_at?: Timestamp;

  // Cursors for resumability
  current_conversation_id?: string | null;
  message_cursor?: string | null;
  purge_cursor?: string | null;
  shard_index?: number;
}

export interface MessageShard {
  shard_id: string; // subcollection doc ID
  conversation_key: string;
  part_no: number;
  message_ids: string[]; // Bounded ~250
  message_count: number;
  first_message_ms?: number;
  last_message_ms?: number;
  archive_file_id?: string;
  archive_file_sha256?: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'FAILED';
  purge_status: 'PENDING' | 'PURGED';
  created_at: Timestamp;
}

export interface ArchiveConversationIndex {
  id: string; // random UUID for this range record
  conversation_id: string; // Real normalized phone for internal lookup
  archive_conversation_key: string; // ULID alias
  archive_id: string; // Internal job ID
  archived_from_utc_ms: number;
  archived_to_utc_ms: number;
  message_count: number;
  drive_folder_id?: string;
  manifest_file_id?: string;
  integrity_status: 'VERIFIED' | 'FAILED';
  archived_at: Timestamp;
  archived_by: string;
}

// Global mapping to ensure one conversation always has the same alias
export interface ConversationAlias {
  conversation_id: string;
  archive_conversation_key: string;
  created_at: Timestamp;
}
