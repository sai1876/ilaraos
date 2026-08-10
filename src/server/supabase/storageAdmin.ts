import 'server-only';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase server credentials. Do not expose these to the client.');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function createUploadIntent(bucket: string, objectPath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);
    
  if (error) {
    throw new Error(`Failed to create upload intent: ${error.message}`);
  }
  
  return data;
}

export async function createPrivateSignedUrl(bucket: string, objectPath: string, expiresInSeconds: number = 300) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresInSeconds);
    
  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }
  
  return data.signedUrl;
}

export async function removeObject(bucket: string, objectPath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([objectPath]);
    
  if (error) {
    throw new Error(`Failed to remove object: ${error.message}`);
  }
  
  return data;
}

export async function verifyObject(bucket: string, objectPath: string) {
  // getPublicUrl doesn't check existence. To check existence, we can list or get metadata.
  // We can use list with prefix.
  const pathParts = objectPath.split('/');
  const fileName = pathParts.pop() || '';
  const folder = pathParts.join('/');
  
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(folder, {
      search: fileName
    });
    
  if (error) {
    throw new Error(`Failed to verify object: ${error.message}`);
  }
  
  const fileInfo = data.find(f => f.name === fileName);
  if (!fileInfo) {
    return null;
  }
  
  return fileInfo;
}

export async function moveObject(bucket: string, fromPath: string, toPath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .move(fromPath, toPath);
    
  if (error) {
    throw new Error(`Failed to move object: ${error.message}`);
  }
  
  return data;
}

export async function copyObject(bucket: string, fromPath: string, toPath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .copy(fromPath, toPath);
    
  if (error) {
    throw new Error(`Failed to copy object: ${error.message}`);
  }
  
  return data;
}

export async function streamAndHashObject(bucket: string, objectPath: string, maxBytes: number) {
  // Generate a short-lived signed URL
  const signedUrl = await createPrivateSignedUrl(bucket, objectPath, 60);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const res = await fetch(signedUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch from Supabase: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('No response body from Supabase.');
    }

    const hash = crypto.createHash('sha256');
    let totalBytes = 0;

    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        controller.abort();
        throw new Error(`FILE_TOO_LARGE_DURING_STREAM: File exceeded maximum allowed size of ${maxBytes} bytes`);
      }

      hash.update(value);
    }

    return {
      sha256: hash.digest('hex'),
      sizeBytes: totalBytes,
      mimeType: res.headers.get('content-type') || 'application/octet-stream'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStreamForTransfer(bucket: string, objectPath: string) {
  const signedUrl = await createPrivateSignedUrl(bucket, objectPath, 60 * 15); // 15 mins for large transfers

  const controller = new AbortController();
  const res = await fetch(signedUrl, { signal: controller.signal });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch from Supabase for transfer: ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('No response body from Supabase.');
  }

  return { res, controller };
}

export async function deleteObject(bucket: string, objectPath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(bucket).remove([objectPath]);
  if (error) {
    throw new Error(`Failed to delete object from Supabase: ${error.message}`);
  }
}
