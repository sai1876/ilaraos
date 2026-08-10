import { NextRequest, NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { getFileStream } from '@/server/storage/storageService';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actorResult = await requireSessionActor(req);
    if (!actorResult.ok) {
      return NextResponse.json({ error: actorResult.reason }, { status: 401 });
    }
    const { actor } = actorResult;
    
    // We enforce that the user is part of the outlet the file belongs to
    // or is a global staff (owner/admin)
    const storedFileId = params.id;
    
    const { data: file } = await supabase
      .from('stored_files')
      .select('outlet_id, mime_type, original_filename')
      .eq('id', storedFileId)
      .single();

    if (!file) {
      return new NextResponse('File not found', { status: 404 });
    }

    if (actor.role !== 'owner' && actor.role !== 'admin' && actor.outletId !== file.outlet_id) {
      return new NextResponse('Permission denied', { status: 403 });
    }

    const stream = await getFileStream(file.outlet_id, storedFileId);
    
    // Convert NodeJS.ReadableStream to web stream for fetch response
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        if ('destroy' in stream) {
          (stream as any).destroy();
        }
      }
    });

    const headers = new Headers();
    headers.set('Content-Type', file.mime_type || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${file.original_filename}"`);
    
    return new NextResponse(webStream, {
      status: 200,
      headers
    });
    
  } catch (error: any) {
    console.error('File stream error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
