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

    let query = adminDb!.collection('whatsapp_conversations')
      .orderBy('last_message_at', 'desc')
      .limit(limit);

    if (actor.role === 'manager') {
      // Current single-outlet deployment is 'main'. Manager must match.
      query = query.where('outlet_id', '==', actor.outletId || 'main');
    }

    if (status) {
      query = query.where('status', '==', status);
    }
    if (controlMode) {
      query = query.where('control_mode', '==', controlMode);
    }
    
    if (search) {
       // Exact match for urgent fix. No string `.includes()` simulation.
       query = query.where('phone_masked', '==', search);
    }

    if (cursor) {
      // Strict validation for cursor
      const snap = await adminDb!.collection('whatsapp_conversations').doc(cursor).get();
      if (snap.exists) {
        const docData = snap.data();
        if (actor.role === 'manager' && docData?.outlet_id !== (actor.outletId || 'main')) {
           throw new Error('Cursor out of bounds'); // Will be caught below
        }
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
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
