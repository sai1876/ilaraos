// [PUBLIC] Link existing document to business entity endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { resolveActorContext, isRoleAllowed } from '@/server/auth/resolveActor';

export async function POST(request: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorRes = await resolveActorContext(adminDb, decodedToken);
    if (!actorRes.ok || !isRoleAllowed(actorRes.actor.role, ['manager', 'admin', 'owner'])) {
      return NextResponse.json({ error: 'Manager or Owner authorization required' }, { status: 403 });
    }

    const body = await request.json();
    const { documentId, targetEntityType, targetEntityId } = body;

    if (!documentId || !targetEntityType || !targetEntityId) {
      return NextResponse.json({ error: 'documentId, targetEntityType and targetEntityId required' }, { status: 400 });
    }

    const docRef = adminDb.collection('documents').doc(documentId);
    const targetRef = adminDb.collection(targetEntityType).doc(targetEntityId);

    await adminDb.runTransaction(async (transaction) => {
      // ALL READS FIRST
      const docSnap = await transaction.get(docRef);
      const targetSnap = await transaction.get(targetRef);

      if (!docSnap.exists) throw new Error('DOCUMENT_NOT_FOUND');
      if (!targetSnap.exists) throw new Error('TARGET_ENTITY_NOT_FOUND');

      const targetData = targetSnap.data() || {};
      const existingDocIds = Array.isArray(targetData.document_ids) ? targetData.document_ids : [];

      // ALL WRITES SECOND
      if (!existingDocIds.includes(documentId)) {
        transaction.update(targetRef, {
          document_ids: [...existingDocIds, documentId],
          updated_at: Date.now(),
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Document linked successfully.' });
  } catch (error: any) {
    console.error('Failed to link document:', error);
    if (error.message === 'DOCUMENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (error.message === 'TARGET_ENTITY_NOT_FOUND') {
      return NextResponse.json({ error: 'Target entity not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
