import { createHash } from 'node:crypto';
import { getStorageProvider } from './storageProvider';
import { adminDb } from '@/lib/firebaseAdmin'; // Or supabaseAdmin
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function getIntegrationConfig(outletId: string, provider: string = 'google_drive') {
  const { data, error } = await supabase
    .from('storage_integrations')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('provider', provider)
    .single();

  if (error || !data) {
    throw new Error(`Storage integration not found for outlet ${outletId}`);
  }
  
  if (data.status !== 'connected') {
    throw new Error(`Storage integration ${provider} is in ${data.status} state.`);
  }

  return data;
}

export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function resolveFolderId(outletId: string, category: string, providerConfig: any): Promise<string> {
  // Check local mapping cache
  const { data: mapping } = await supabase
    .from('drive_folder_mappings')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('category', category)
    .single();

  if (mapping) return mapping.google_drive_folder_id;

  // Provisioning logic occurs asynchronously upon oauth connect, but if missing, provider must handle it.
  const provider = getStorageProvider(providerConfig.provider, providerConfig);
  // Simple fallback implementation
  const root = providerConfig.root_folder_id;
  if (!root) throw new Error('Root folder not configured for this integration');
  
  const result = await provider.createFolder(category, root);
  
  await supabase.from('drive_folder_mappings').insert({
    outlet_id: outletId,
    category,
    google_drive_folder_id: result.folderId,
    parent_folder_id: root,
    folder_name: category
  });

  return result.folderId;
}

export async function getFileStream(outletId: string, storedFileId: string): Promise<NodeJS.ReadableStream> {
  const { data: file } = await supabase
    .from('stored_files')
    .select('*')
    .eq('id', storedFileId)
    .eq('outlet_id', outletId)
    .single();

  if (!file) throw new Error('File not found');

  const config = await getIntegrationConfig(outletId, file.provider);
  const provider = getStorageProvider(file.provider, config);

  return provider.getFileStream(file.provider_file_id);
}

export async function uploadFileBuffer(
  outletId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  category: string,
  createdById: string
) {
  const config = await getIntegrationConfig(outletId, 'google_drive');
  const folderId = await resolveFolderId(outletId, category, config);
  const provider = getStorageProvider('google_drive', config);

  const { data: dbRecord } = await supabase.from('stored_files').insert({
    outlet_id: outletId,
    provider: 'google_drive',
    category,
    original_filename: filename,
    stored_filename: filename,
    mime_type: mimeType,
    size_bytes: buffer.length,
    upload_status: 'pending',
    created_by: createdById
  }).select('id').single();

  if (!dbRecord) throw new Error('Failed to create file record');

  const result = await provider.uploadFile({
    buffer,
    filename,
    mimeType,
    folderId
  });

  await supabase.from('stored_files').update({
    provider_file_id: result.providerFileId,
    provider_folder_id: result.providerFolderId,
    checksum_sha256: result.checksumSha256,
    upload_status: 'completed',
    uploaded_at: new Date().toISOString()
  }).eq('id', dbRecord.id);

  return { fileId: dbRecord.id, result };
}
