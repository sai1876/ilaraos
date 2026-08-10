import { NextRequest, NextResponse } from 'next/server';
import { getStorageProvider, resolveFolderId } from '@/server/storage/storageService';
import { getIntegrationConfig } from '@/server/storage/storageService';

export async function POST(req: NextRequest) {
  try {
    // Note: this should be secured with a secret key or internal network check in production
    const { outletId } = await req.json();

    if (!outletId) return NextResponse.json({ error: 'Missing outletId' }, { status: 400 });

    const config = await getIntegrationConfig(outletId, 'google_drive');
    
    // We can pre-provision common categories
    const categories = ['IlaraOS-System', 'Evidence', 'Proofs', 'Archives', 'Recordings'];
    
    let rootFolderId = config.root_folder_id;
    
    const provider = getStorageProvider('google_drive', config);

    if (!rootFolderId) {
      // Create root folder
      const result = await provider.createFolder('IlaraOS-System');
      rootFolderId = result.folderId;
      
      // Update config
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '', 
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      );
      
      await supabase
        .from('storage_integrations')
        .update({ root_folder_id: rootFolderId })
        .eq('id', config.id);
        
      // Pre-provision children
      for (const cat of categories.slice(1)) {
        await resolveFolderId(outletId, cat, { ...config, root_folder_id: rootFolderId });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Folder Provisioning Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
