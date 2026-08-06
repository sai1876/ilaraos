import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { removeObject } from '@/server/supabase/storageAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export async function DELETE(req: Request, { params }: { params: { documentId: string } }) {
  try {
    const { documentId } = params;
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitRes = await rateLimitDurable(`${ip}_delete_file`, 30, 60000);
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

    const docRef = adminDb.collection('documents').doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const metadata = docSnap.data()!;
    const userRole = decodedToken.role || 'customer';

    // Verify Permission
    let hasPermission = false;
    if (userRole === 'owner') {
      hasPermission = true;
    } else if (userRole === 'manager' && metadata.status !== 'archived') {
      hasPermission = true;
    } else if (metadata.uploaded_by === decodedToken.uid) {
      hasPermission = true;
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if it is finalized evidence that shouldn't be deleted physically
    // The requirement: Do not physically delete evidence attached to:
    // - approved Daily Closing reports
    // - completed refunds
    // - completed approvals
    // - finalized expenses
    // - verified compliance records
    const uneditableCategories = ['evidence', 'invoice', 'receipt', 'report', 'compliance'];
    const isFinalized = uneditableCategories.includes(metadata.category) && metadata.status === 'archived';

    if (isFinalized) {
       return NextResponse.json({ error: 'Cannot delete finalized evidence' }, { status: 403 });
    }

    // If it's safe to delete:
    // 3. Delete exact Supabase object
    try {
       await removeObject(metadata.bucket, metadata.object_path);
    } catch (error: any) {
       console.error(`Failed to remove object from Supabase: ${error.message}`);
       // Continue to soft-delete even if Supabase fails (maybe it's already gone)
    }

    // 4. Soft-delete Firestore metadata
    await docRef.update({
      status: 'deleted',
      deleted_at: new Date(),
      deleted_by: decodedToken.uid
    });

    // 5. Detach from editable related entity (best effort)
    if (metadata.related_entity_type && metadata.related_entity_id) {
       const entityRef = adminDb.collection(metadata.related_entity_type).doc(metadata.related_entity_id);
       try {
           const entitySnap = await entityRef.get();
           if (entitySnap.exists) {
              if (metadata.related_entity_type === 'menu') {
                 await entityRef.update({
                    image_document_id: null,
                    updated_at: new Date()
                 });
              }
           }
       } catch (e) {
           console.error('Failed to detach document from related entity', e);
       }
    }

    // Record Audit Event
    await logBusinessEvent({
      event_type: 'file_deleted',
      actor_id: decodedToken.uid,
      actor_type: userRole as any,
      target_type: metadata.category,
      target_id: documentId,
      severity: 'warning',
      source: 'api',
      metadata: {
        documentId,
        category: metadata.category
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Delete File Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
