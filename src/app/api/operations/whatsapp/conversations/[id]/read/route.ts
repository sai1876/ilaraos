// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    
    const convRef = adminDb!.collection('whatsapp_conversations').doc(params.id);
    const snap = await convRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (actor.role === 'manager' && snap.data()!.outlet_id !== (actor.outletId || 'main')) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    await convRef.update({
      unread_count: 0,
      needs_attention: false,
      updated_at: Date.now()
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to mark as read:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: error.status || 500 });
  }
}
