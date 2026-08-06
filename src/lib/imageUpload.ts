/**
 * imageUpload.ts
 * Validated Firebase Storage upload pipeline for admin image assets.
 *
 * Rules:
 * - Accepted MIME types: image/jpeg, image/png, image/webp, image/gif
 * - Maximum file size: 5 MB
 * - Files are stored under the provided `storagePath` (e.g. "menu-catalog/<id>.jpg")
 * - Returns the public download URL on success
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ImageUploadResult {
  ok: true;
  url: string;
}

export interface ImageUploadError {
  ok: false;
  reason: 'invalid_type' | 'too_large' | 'upload_failed';
  message: string;
}

export type ImageUploadOutcome = ImageUploadResult | ImageUploadError;

/**
 * Validate and upload `file` to Firebase Storage at `storagePath`.
 * Returns a discriminated union — always check `result.ok` before using `result.url`.
 */
export async function uploadImageToFirebase(
  file: File,
  storagePath: string,
): Promise<ImageUploadOutcome> {
  // --- Guard 1: MIME type ---
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: 'invalid_type',
      message: `File type "${file.type}" is not allowed. Please upload a JPEG, PNG, WEBP, or GIF image.`,
    };
  }

  // --- Guard 2: File size ---
  if (file.size > MAX_FILE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: 'too_large',
      message: `File is ${sizeMB} MB. Maximum allowed size is 5 MB.`,
    };
  }

  // --- Upload ---
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(snapshot.ref);
    return { ok: true, url };
  } catch (err) {
    console.error('[IMAGE UPLOAD] Firebase Storage upload failed:', err);
    return {
      ok: false,
      reason: 'upload_failed',
      message: 'Upload failed. Please check your connection and try again.',
    };
  }
}
