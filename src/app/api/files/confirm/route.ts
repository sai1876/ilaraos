// [INTERNAL] Upload confirmation route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { verifyObject } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const confirmSchema = z.object({
  documentId: z.string().uuid()
});

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitRes = await rateLimitDurable(`${ip}_confirm_upload`, 30, 60000);
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
      parsedBody = confirmSchema.parse(JSON.parse(bodyText));
    } catch (err) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { documentId } = parsedBody;
    const docRef = adminDb.collection('documents').doc(documentId);
    
    // We use a transaction to attach documentId to the related entity and update status
    const result = await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) {
        throw new Error('Document metadata not found');
      }

      const metadata = docSnap.data()!;
      
      const userRole = decodedToken.role || 'customer';
      if (metadata.uploaded_by !== decodedToken.uid && !['owner', 'manager'].includes(userRole)) {
        throw new Error('Forbidden');
      }

      if (metadata.status === 'available') {
        return metadata; // Idempotent success
      }
      
      if (metadata.status !== 'uploading') {
        throw new Error(`Invalid status: ${metadata.status}`);
      }

      // Verify Supabase Object
      const fileInfo = await verifyObject(metadata.bucket, metadata.object_path);
      
      if (!fileInfo) {
        throw new Error('File not found in Supabase Storage');
      }

      if (fileInfo.metadata?.size === 0) {
        throw new Error('File is empty');
      }

      // Mark metadata available
      transaction.update(docRef, {
        status: 'available',
        confirmed_at: new Date()
      });

      // Attach documentId to the related entity using transaction
      if (metadata.related_entity_type && metadata.related_entity_id) {
        const entityRef = adminDb!.collection(metadata.related_entity_type).doc(metadata.related_entity_id);
        const entitySnap = await transaction.get(entityRef);
        
        if (entitySnap.exists) {
           // Decide how to attach based on type
           // The prompt said: "Do not append duplicate references"
           // Example mapping: 
           // Menu: image_document_id
           if (metadata.related_entity_type === 'menu') {
             transaction.update(entityRef, {
               image_document_id: documentId,
               updated_at: new Date()
             });
           } else if (metadata.related_entity_type === 'config') { // For atmosphere
             // Custom logic for atmosphere if needed
           }
        }
      }

      return { ...metadata, status: 'available' };
    });

    // Record audit event
    await logBusinessEvent({
      event_type: 'file_uploaded',
      actor_id: decodedToken.uid,
      actor_type: (decodedToken.role as any) || 'customer',
      target_type: result.category,
      target_id: documentId,
      severity: 'info',
      source: 'api',
      metadata: {
        documentId,
        category: result.category,
        relatedEntityType: result.related_entity_type,
        relatedEntityId: result.related_entity_id,
        sizeBytes: result.size_bytes
      }
    });

    return NextResponse.json({ success: true, document: result });

  } catch (error: any) {
    console.error('[Confirm Upload Error]', error);
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error.message === 'Document metadata not found') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
