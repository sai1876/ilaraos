import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireSessionActor(['owner', 'admin', 'manager']);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor'); // Timestamp or doc ID

    let query = adminDb!.collection('whatsapp_messages')
      .where('conversation_id', '==', params.id)
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (cursor) {
      const snap = await adminDb!.collection('whatsapp_messages').doc(cursor).get();
      if (snap.exists) {
        query = query.startAfter(snap);
      }
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
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
