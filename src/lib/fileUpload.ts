import { supabasePublic } from './supabaseClient';
import { getAuth } from 'firebase/auth';

export type UploadProgressState = 'validating' | 'requesting_intent' | 'uploading' | 'confirming' | 'completed' | 'failed';

export interface UploadIntentRequest {
  category: 'menu' | 'atmosphere' | 'evidence' | 'invoice' | 'receipt' | 'document' | 'report' | 'media';
  relatedEntityType: string;
  relatedEntityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  accessLevel: 'public' | 'private' | 'role_restricted';
}

export interface UploadOptions {
  onProgress?: (state: UploadProgressState, progress?: number) => void;
}

export async function uploadFileViaIntent(
  file: File, 
  intentRequest: UploadIntentRequest, 
  options?: UploadOptions
) {
  const { onProgress } = options || {};
  
  try {
    // 1. Local Validation
    onProgress?.('validating');
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('File size exceeds maximum limit of 20MB');
    }
    // More specific validation can be added here
    
    // Get Firebase token
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }
    const token = await currentUser.getIdToken();

    // 2. Request Upload Intent
    onProgress?.('requesting_intent');
    const intentRes = await fetch('/api/files/upload-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...intentRequest,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      })
    });

    if (!intentRes.ok) {
      const errorData = await intentRes.json();
      throw new Error(errorData.error || 'Failed to request upload intent');
    }

    const { documentId, bucket, objectPath, uploadToken } = await intentRes.json();

    // 3 & 4. Upload to Supabase using Signed URL
    onProgress?.('uploading', 0);
    
    const { error: uploadError } = await supabasePublic.storage
      .from(bucket)
      .uploadToSignedUrl(objectPath, uploadToken, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false // Intentional: Do not allow upsert per requirements
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }
    
    onProgress?.('uploading', 100);

    // 5. Confirm Upload
    onProgress?.('confirming');
    const confirmRes = await fetch('/api/files/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentId })
    });

    if (!confirmRes.ok) {
      const errorData = await confirmRes.json();
      throw new Error(errorData.error || 'Failed to confirm upload');
    }

    const { document } = await confirmRes.json();
    
    onProgress?.('completed');
    return document;
    
  } catch (error: any) {
    onProgress?.('failed');
    console.error('File upload flow failed:', error);
    throw error;
  }
}
