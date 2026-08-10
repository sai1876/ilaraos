import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';

export async function GET(request: Request) {
  try {
    await requireSessionActor(['owner', 'admin', 'manager']);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const status = searchParams.get('status'); // OPEN, RESOLVED, ARCHIVED
    const controlMode = searchParams.get('controlMode'); // AI, HUMAN
    const cursor = searchParams.get('cursor');

    let query = adminDb!.collection('whatsapp_conversations')
      .orderBy('last_message_at', 'desc')
      .limit(limit);

    if (status) {
      query = query.where('status', '==', status);
    }
    if (controlMode) {
      query = query.where('control_mode', '==', controlMode);
    }

    if (cursor) {
      const snap = await adminDb!.collection('whatsapp_conversations').doc(cursor).get();
      if (snap.exists) {
        query = query.startAfter(snap);
      }
    }

    const snapshot = await query.get();
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error('Failed to fetch whatsapp conversations:', error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
