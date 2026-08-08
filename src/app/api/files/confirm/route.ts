// [INTERNAL] Upload confirmation route
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { verifyObject } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { resolveActorContext } from '@/server/auth/resolveActor';

const confirmSchema = z.object({
  documentId: z.string().min(1)
});

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitRes = await rateLimitDurable(`${ip}_confirm_upload`, 40, 60000);
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
      parsedBody = confirmSchema.parse(JSON.parse(bodyText));
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { documentId } = parsedBody;
    const docRef = adminDb.collection('documents').doc(documentId);

    // Run transaction adhering strictly to ALL READS FIRST, THEN WRITES
    const result = await adminDb.runTransaction(async (transaction) => {
      // 1. ALL READS FIRST
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const metadata = docSnap.data()!;

      if (metadata.uploaded_by !== actorRes.actor.uid && !['owner', 'admin', 'manager'].includes(actorRes.actor.role)) {
        throw new Error('FORBIDDEN');
      }

      if (metadata.status === 'available') {
        return metadata; // Idempotent success
      }

      // Read related entity if specified
      let entitySnap = null;
      let entityRef = null;
      if (metadata.related_entity_type && metadata.related_entity_id) {
        entityRef = adminDb!.collection(metadata.related_entity_type).doc(metadata.related_entity_id);
        entitySnap = await transaction.get(entityRef);
      }

      // Verify Supabase Object exists
      const fileInfo = await verifyObject(metadata.bucket, metadata.object_path);
      if (!fileInfo) {
        throw new Error('FILE_NOT_FOUND_IN_STORAGE');
      }

      // 2. NOW ALL WRITES
      transaction.update(docRef, {
        status: 'available',
        confirmed_at: Date.now(),
        confirmed_by: actorRes.actor.uid,
      });

      if (entitySnap && entitySnap.exists && entityRef) {
        const entityData = entitySnap.data() || {};
        if (metadata.related_entity_type === 'menu') {
          transaction.update(entityRef, {
            image_document_id: documentId,
            updated_at: Date.now(),
          });
        } else {
          const existingDocIds = Array.isArray(entityData.document_ids) ? entityData.document_ids : [];
          if (!existingDocIds.includes(documentId)) {
            transaction.update(entityRef, {
              document_ids: [...existingDocIds, documentId],
              updated_at: Date.now(),
            });
          }
        }
      }

      return { ...metadata, status: 'available' };
    });

    await logBusinessEvent({
      event_type: 'file_uploaded',
      actor_id: actorRes.actor.uid,
      actor_type: (actorRes.actor.role as any) || 'staff',
      target_type: result.category,
      target_id: documentId,
      severity: 'info',
      source: 'api',
      metadata: {
        documentId,
        category: result.category,
        relatedEntityType: result.related_entity_type,
        relatedEntityId: result.related_entity_id,
        sizeBytes: result.size_bytes,
      },
    });

    return NextResponse.json({ success: true, document: result });
  } catch (error: any) {
    console.error('[Confirm Upload Error]', error);
    if (error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error.message === 'DOCUMENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
