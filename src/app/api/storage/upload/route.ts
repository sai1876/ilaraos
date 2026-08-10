import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { getStorageProvider, getIntegrationConfig, resolveFolderId } from '@/server/storage/storageService';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
  try {
    const actorResult = await requireSessionActor(req);
    if (!actorResult.ok) {
      return NextResponse.json({ error: actorResult.reason }, { status: 401 });
    }
    const { actor } = actorResult;
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string || 'Uploads';
    
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const outletId = actor.outletId || 'main';
    const config = await getIntegrationConfig(outletId, 'google_drive');
    const folderId = await resolveFolderId(outletId, category, config);
    const provider = getStorageProvider('google_drive', config);

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // DB record: pending
    const { data: dbRecord } = await supabase.from('stored_files').insert({
      outlet_id: outletId,
      provider: 'google_drive',
      category,
      original_filename: file.name,
      stored_filename: file.name,
      mime_type: file.type,
      size_bytes: buffer.length,
      upload_status: 'pending',
      created_by: actor.uid
    }).select('id').single();

    if (!dbRecord) throw new Error('Failed to create file record');

    // Perform upload
    const result = await provider.uploadFile({
      buffer,
      filename: file.name,
      mimeType: file.type,
      folderId
    });

    // DB record: complete
    await supabase.from('stored_files').update({
      provider_file_id: result.providerFileId,
      provider_folder_id: result.providerFolderId,
      checksum_sha256: result.checksumSha256,
      upload_status: 'completed',
      uploaded_at: new Date().toISOString()
    }).eq('id', dbRecord.id);

    return NextResponse.json({ 
      ok: true, 
      fileId: dbRecord.id,
      checksum: result.checksumSha256
    });

  } catch (error: any) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
