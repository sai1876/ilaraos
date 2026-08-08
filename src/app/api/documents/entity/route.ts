// [PUBLIC] Entity documents fetch endpoint
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { resolveActorContext } from '@/server/auth/resolveActor';

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
    if (!actorRes.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('type');
    const entityId = searchParams.get('id');

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'type and id search parameters required' }, { status: 400 });
    }

    // Query documents collection for matching entity
    const snap = await adminDb
      .collection('documents')
      .where('related_entity_type', '==', entityType)
      .where('related_entity_id', '==', entityId)
      .get();

    const documents = snap.docs
      .map((doc) => doc.data())
      .filter((d: any) => {
        if (d.status === 'deleted') return false;
        if (d.attachment_state === 'pending_entity') {
          const isOwner = d.pending_owner_uid === actorRes.actor.uid;
          const isAdmin = ['owner', 'admin'].includes(actorRes.actor.role);
          if (!isOwner && !isAdmin) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => b.uploaded_at - a.uploaded_at);

    return NextResponse.json({ success: true, documents });
  } catch (error: any) {
    console.error('Failed to fetch entity documents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
