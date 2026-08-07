// [INTERNAL] Signed URL route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createPrivateSignedUrl } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const signedUrlSchema = z.object({
  documentId: z.string().uuid(),
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
    } catch (err) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const bodyText = await req.text();
    if (bodyText.length > 32 * 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let parsedBody;
    try {
      parsedBody = signedUrlSchema.parse(JSON.parse(bodyText));
    } catch (err) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { documentId, disposition } = parsedBody;

    const docRef = adminDb.collection('documents').doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const metadata = docSnap.data()!;
    
    // Reject deleted, failed, expired or unavailable documents
    if (metadata.status !== 'available' && metadata.status !== 'archived') {
      return NextResponse.json({ error: `Document is ${metadata.status}` }, { status: 400 });
    }

    const userRole = decodedToken.role || 'customer';
    
    // Resolve Access
    let hasAccess = false;
    
    if (metadata.bucket === 'ilara-public-media' || metadata.access_level === 'public') {
      hasAccess = true;
    } else if (userRole === 'owner' || userRole === 'manager') {
      hasAccess = true; // Owners and managers generally have access to all documents
    } else if (metadata.uploaded_by === decodedToken.uid) {
      hasAccess = true;
    } else if (metadata.access_level === 'role_restricted') {
      // Custom business logic for restricted access based on related entity
      // E.g., a staff member might be able to view their own payroll slip.
      // We will allow access if uploaded by them, otherwise forbidden unless specific rule applies.
      // For now, only owner/manager or uploader.
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let url = '';
    const expiry = new Date(Date.now() + 300 * 1000); // 300 seconds

    if (metadata.bucket === 'ilara-public-media') {
      const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      url = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${metadata.bucket}/${metadata.object_path}`;
    } else {
      url = await createPrivateSignedUrl(metadata.bucket, metadata.object_path, 300);
      
      // Optionally adjust disposition using URL parameters if Supabase supports it, 
      // otherwise client handles downloading vs inline.
      if (disposition === 'download') {
        url += `&download=${encodeURIComponent(metadata.original_filename)}`;
      }
    }

    // Record Audit Event
    await logBusinessEvent({
      event_type: disposition === 'download' ? 'file_downloaded' : 'file_viewed',
      actor_id: decodedToken.uid,
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
