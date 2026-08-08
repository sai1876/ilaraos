// [INTERNAL] Signed URL route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createPrivateSignedUrl } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { resolveActorContext } from '@/server/auth/resolveActor';

const signedUrlSchema = z.object({
  documentId: z.string().min(1),
  disposition: z.enum(['inline', 'download']).default('inline')
});

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitRes = await rateLimitDurable(`${ip}_signed_url`, 60, 60000);
    if (!rateLimitRes.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7), true);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const actorRes = await resolveActorContext(adminDb, decodedToken);
    if (!actorRes.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bodyText = await req.text();
    if (bodyText.length > 32 * 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let parsedBody;
    try {
      parsedBody = signedUrlSchema.parse(JSON.parse(bodyText));
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { documentId, disposition } = parsedBody;

    const docRef = adminDb.collection('documents').doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const metadata = docSnap.data()!;
    
    if (metadata.status !== 'available' && metadata.status !== 'archived') {
      return NextResponse.json({ error: `Document status is ${metadata.status}` }, { status: 400 });
    }

    // Resolve Access
    let hasAccess = false;
    const userRole = actorRes.actor.role;

    if (metadata.bucket === 'ilara-public-media' || metadata.access_level === 'public') {
      hasAccess = true;
    } else if (['owner', 'admin', 'manager', 'ca_auditor'].includes(userRole)) {
      hasAccess = true;
    } else if (metadata.uploaded_by === actorRes.actor.uid) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let url = '';
    const expiry = new Date(Date.now() + 300 * 1000); // 300 seconds

    if (metadata.bucket === 'ilara-public-media') {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      url = `${SUPABASE_URL}/storage/v1/object/public/${metadata.bucket}/${metadata.object_path}`;
    } else {
      url = await createPrivateSignedUrl(metadata.bucket, metadata.object_path, 300);
      if (disposition === 'download') {
        url += `&download=${encodeURIComponent(metadata.original_filename || 'document')}`;
      }
    }

    await logBusinessEvent({
      event_type: disposition === 'download' ? 'file_downloaded' : 'file_viewed',
      actor_id: actorRes.actor.uid,
      actor_type: userRole as any,
      target_type: metadata.category,
      target_id: documentId,
      severity: 'info',
      source: 'api',
      metadata: {
        documentId,
        category: metadata.category
      }
    });

    return NextResponse.json({ 
      url, 
      expiresAt: expiry.toISOString()
    });

  } catch (error: any) {
    console.error('[Signed URL Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
