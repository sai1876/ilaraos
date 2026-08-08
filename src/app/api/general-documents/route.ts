import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { randomUUID } from 'node:crypto';

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // A general document container. It acts as the "business entity" so upload-intent 
    // sees it exists and makes the uploaded files vault_visible immediately.
    const documentId = randomUUID();
    const now = Date.now();

    await adminDb.collection('general_documents').doc(documentId).set({
      document_id: documentId,
      created_by: decodedToken.uid,
      created_at: now,
      status: 'active'
    });

    return NextResponse.json({ success: true, document_id: documentId }, { status: 201 });
  } catch (error: any) {
    console.error('[General Documents Init Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
