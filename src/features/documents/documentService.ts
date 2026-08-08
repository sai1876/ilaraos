import { apiRequest } from '@/lib/apiClient';
import { supabasePublic } from '@/lib/supabaseClient';

export interface DocumentRecord {
  document_id: string;
  outlet_id: string;
  category: 'evidence' | 'invoice' | 'receipt' | 'document' | 'report' | 'media' | 'menu' | 'atmosphere';
  document_type: string;
  related_entity_type: string;
  related_entity_id: string;
  bucket: string;
  object_path: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
  access_level: 'public' | 'private' | 'role_restricted';
  uploaded_by: string;
  uploaded_by_role?: string;
  uploaded_at: number;
  status: 'uploading' | 'available' | 'archived' | 'deleted';
  attachment_state?: 'pending_entity' | 'attached' | 'finalized';
  pending_owner_uid?: string;
  pending_expires_at?: number;
  version: number;
  description?: string;
  invoice_number?: string;
  invoice_date?: string;
  vendor_id?: string;
  amount_paise?: number;
  business_date?: string;
  finalized_at?: number;
  finalized_by?: string;
  supersedes_document_id?: string;
}

export interface UploadIntentResponse {
  success: boolean;
  documentId: string;
  bucket: string;
  objectPath: string;
  token: string;
  document: DocumentRecord;
}

export interface ConfirmUploadResponse {
  success: boolean;
  document: DocumentRecord;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

/**
 * Step 1: Create upload intent & metadata record
 */
export async function createDocumentUploadIntent(payload: {
  category: DocumentRecord['category'];
  documentType?: string;
  relatedEntityType: string;
  relatedEntityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  vendorId?: string;
  amountPaise?: number;
}): Promise<UploadIntentResponse> {
  return apiRequest<UploadIntentResponse>('/api/files/upload-intent', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Step 2: Upload file bytes directly to Supabase storage signed URL
 */
export async function uploadFileBytesToSupabase(
  bucket: string,
  objectPath: string,
  token: string,
  file: File
): Promise<void> {
  const { error } = await supabasePublic.storage
    .from(bucket)
    .uploadToSignedUrl(objectPath, token, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/**
 * Step 3: Confirm upload and attach to business entity
 */
export async function confirmDocumentUpload(documentId: string): Promise<ConfirmUploadResponse> {
  return apiRequest<ConfirmUploadResponse>('/api/files/confirm', {
    method: 'POST',
    body: JSON.stringify({ documentId }),
  });
}

/**
 * High level full upload helper: Intent -> Storage Upload -> Confirm
 */
export async function uploadAndAttachDocument(
  file: File,
  metadata: {
    category: DocumentRecord['category'];
    documentType?: string;
    relatedEntityType: string;
    relatedEntityId: string;
    description?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    vendorId?: string;
    amountPaise?: number;
  }
): Promise<DocumentRecord> {
  const intent = await createDocumentUploadIntent({
    category: metadata.category,
    documentType: metadata.documentType,
    relatedEntityType: metadata.relatedEntityType,
    relatedEntityId: metadata.relatedEntityId,
    originalFilename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    description: metadata.description,
    invoiceNumber: metadata.invoiceNumber,
    invoiceDate: metadata.invoiceDate,
    vendorId: metadata.vendorId,
    amountPaise: metadata.amountPaise,
  });

  await uploadFileBytesToSupabase(intent.bucket, intent.objectPath, intent.token, file);
  const confirm = await confirmDocumentUpload(intent.documentId);
  return confirm.document;
}

/**
 * Get temporary 300-second signed URL for viewing/downloading private file
 */
export async function getDocumentSignedUrl(
  documentId: string,
  disposition: 'inline' | 'download' = 'inline'
): Promise<SignedUrlResponse> {
  return apiRequest<SignedUrlResponse>('/api/files/signed-url', {
    method: 'POST',
    body: JSON.stringify({ documentId, disposition }),
  });
}

/**
 * Fetch documents for a specific entity
 */
export async function fetchEntityDocuments(
  entityType: string,
  entityId: string
): Promise<{ documents: DocumentRecord[] }> {
  return apiRequest<{ documents: DocumentRecord[] }>(
    `/api/documents/entity?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}`,
    {
      cacheKey: `entity_docs:${entityType}:${entityId}`,
      staleTimeMs: 10 * 1000,
    }
  );
}

/**
 * Query Document Vault files with filters
 */
export async function fetchVaultDocuments(filters?: {
  category?: string;
  documentType?: string;
  vendorId?: string;
  status?: string;
  search?: string;
}): Promise<{ documents: DocumentRecord[] }> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.documentType) params.set('documentType', filters.documentType);
  if (filters?.vendorId) params.set('vendorId', filters.vendorId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<{ documents: DocumentRecord[] }>(`/api/documents/vault${queryString}`, {
    cacheKey: `vault_docs:${queryString}`,
    staleTimeMs: 15 * 1000,
  });
}

/**
 * Link an existing document to a new entity (Reuse without re-uploading!)
 */
export async function linkExistingDocumentToEntity(
  documentId: string,
  targetEntityType: string,
  targetEntityId: string
): Promise<void> {
  await apiRequest(`/api/documents/link`, {
    method: 'POST',
    body: JSON.stringify({
      document_id: documentId,
      target_entity_type: targetEntityType,
      target_entity_id: targetEntityId,
    })
  });
}

/**
 * Legacy compatibility function for simple uploads
 */
export async function uploadFileViaIntent(
  file: File,
  options: {
    category: DocumentRecord['category'];
    documentType?: string;
    relatedEntityType: string;
    relatedEntityId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    description?: string;
    accessLevel?: string;
  }
): Promise<DocumentRecord> {
  const intent = await createDocumentUploadIntent(options);

  const { error } = await supabasePublic.storage
    .from(intent.bucket)
    .uploadToSignedUrl(intent.objectPath, intent.token, file);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const result = await confirmDocumentUpload(intent.documentId);
  return result.document;
}
