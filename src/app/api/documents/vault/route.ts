// [PUBLIC] Central Document Vault API endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { resolveActorContext, isRoleAllowed } from '@/server/auth/resolveActor';

export async function GET(request: Request) {
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
    if (!actorRes.ok || !isRoleAllowed(actorRes.actor.role, ['manager', 'admin', 'owner', 'ca_auditor'])) {
      return NextResponse.json({ error: 'Manager, Admin or Owner permissions required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const documentType = searchParams.get('documentType');
    const vendorId = searchParams.get('vendorId');
    const status = searchParams.get('status') || 'available';
    const search = searchParams.get('search')?.toLowerCase() || '';

    let queryRef: FirebaseFirestore.Query = adminDb.collection('documents');

    if (category) {
      queryRef = queryRef.where('category', '==', category);
    }
    if (documentType) {
      queryRef = queryRef.where('document_type', '==', documentType);
    }
    if (vendorId) {
      queryRef = queryRef.where('vendor_id', '==', vendorId);
    }
    if (status && status !== 'all') {
      queryRef = queryRef.where('status', '==', status);
    }

    const snap = await queryRef.get();
    let documents = snap.docs.map((doc) => doc.data());

    if (search) {
      documents = documents.filter((d: any) =>
        (d.original_filename || '').toLowerCase().includes(search) ||
        (d.invoice_number || '').toLowerCase().includes(search) ||
        (d.description || '').toLowerCase().includes(search) ||
        (d.document_type || '').toLowerCase().includes(search) ||
        (d.related_entity_id || '').toLowerCase().includes(search)
      );
    }

    documents.sort((a: any, b: any) => b.uploaded_at - a.uploaded_at);

    return NextResponse.json({ success: true, count: documents.length, documents });
  } catch (error: any) {
    console.error('Failed to fetch vault documents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
