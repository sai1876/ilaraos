import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);

    // 1. Verify outlet authorization by checking the conversation first
    const convSnap = await adminDb!.collection('whatsapp_conversations').doc(params.id).get();
    if (!convSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const convData = convSnap.data()!;
    if (actor.role === 'manager' && convData.outlet_id !== (actor.outletId || 'main')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(parsedLimit, 1), 100);
    const cursor = searchParams.get('cursor'); // Timestamp or doc ID

    let query = adminDb!.collection('whatsapp_messages')
      .where('conversation_id', '==', params.id)
      .orderBy('created_at_ms', 'desc')
      .limit(limit);

    if (cursor) {
      const snap = await adminDb!.collection('whatsapp_messages').doc(cursor).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
      }
      if (snap.data()!.conversation_id !== params.id) {
        return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
      }
      query = query.startAfter(snap);
    }

    const snapshot = await query.get();
    
    // Reverse so frontend gets chronological order, though typically infinite scroll handles this
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).reverse();

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('Failed to fetch whatsapp messages:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
