import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';

export async function GET(request: Request) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);

    const { searchParams } = new URL(request.url);
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(parsedLimit, 1), 100);
    
    const status = searchParams.get('status');
    const controlMode = searchParams.get('controlMode');
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search');

    if (search) {
      // Search branch (in-memory filtering to avoid speculative composite indexes)
      const snap = await adminDb!.collection('whatsapp_conversations')
        .where('phone_masked', '==', search)
        .limit(limit)
        .get();
        
      let conversations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      if (actor.role === 'manager') {
        conversations = conversations.filter(c => c.outlet_id === (actor.outletId || 'main'));
      }
      if (status) conversations = conversations.filter(c => c.status === status);
      if (controlMode) conversations = conversations.filter(c => c.control_mode === controlMode);
      
      conversations.sort((a, b) => (b.last_message_at || 0) - (a.last_message_at || 0));
      
      return NextResponse.json({ conversations });
    }

    let query: FirebaseFirestore.Query = adminDb!.collection('whatsapp_conversations');

    if (actor.role === 'manager') {
      query = query.where('outlet_id', '==', actor.outletId || 'main');
    }

    if (status) query = query.where('status', '==', status);
    if (controlMode) query = query.where('control_mode', '==', controlMode);
    
    query = query.orderBy('last_message_at', 'desc').limit(limit);

    if (cursor) {
      const snap = await adminDb!.collection('whatsapp_conversations').doc(cursor).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
      }
      const docData = snap.data();
      if (actor.role === 'manager' && docData?.outlet_id !== (actor.outletId || 'main')) {
        return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
      }
      if (status && docData?.status !== status) {
        return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
      }
      query = query.startAfter(snap);
    }

    const snapshot = await query.get();
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error('Failed to fetch whatsapp conversations:', error);
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
