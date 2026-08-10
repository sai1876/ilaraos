// Client-safe models for Evidence API DTOs

export interface EvidenceUploadIntentRequest {
  category: string;
  evidence_type: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  related_entities?: { type: string; id: string }[];
  
  // Explicit overrides requested by Manager/Owner
  request_importance?: 'NORMAL' | 'IMPORTANT';
  direct_archive_reason?: string;
}

export interface EvidenceUploadIntentResponse {
  evidence_id: string;
  evidence_no: string;
  storage_policy: 'ACTIVE_THEN_ARCHIVE' | 'DIRECT_ARCHIVE';
  
  // For ACTIVE_THEN_ARCHIVE
  upload_url?: string;
  supabase_path?: string;
}

// Structured error for oversized limits
export interface EvidenceSizeLimitError {
  code: 'FILE_TOO_LARGE_FOR_ACTIVE_STORAGE';
  message: string;
  fileSizeBytes: number;
  normalLimitBytes: number;
  importantUploadAllowed: boolean;
}

export interface EvidenceFeatureNotAvailableError {
  code: 'FEATURE_NOT_AVAILABLE_IN_PHASE_1';
  message: string;
}
