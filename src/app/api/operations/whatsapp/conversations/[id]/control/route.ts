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
    
    const body = await request.json();
    const { action } = body; // 'TAKE_OVER' | 'RETURN_TO_AI'
    
    if (action !== 'TAKE_OVER' && action !== 'RETURN_TO_AI') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const convRef = adminDb!.collection('whatsapp_conversations').doc(params.id);
    
    const result = await adminDb!.runTransaction(async (t) => {
      const snap = await t.get(convRef);
      if (!snap.exists) {
        throw new Error('Conversation not found');
      }
      
      const data = snap.data()!;
      if (actor.role === 'manager' && data.outlet_id !== (actor.outletId || 'main')) {
        throw new Error('Conversation not found');
      }
      
      const newMode = action === 'TAKE_OVER' ? 'HUMAN' : 'AI';
      
      if (data.control_mode === newMode) {
        return { success: true, alreadyInMode: true };
      }
      
      const newVersion = (data.control_version || 1) + 1;
      
      t.update(convRef, {
        control_mode: newMode,
        control_version: newVersion,
        updated_at: Date.now()
      });
      
      return { success: true, newMode, newVersion };
    });

    if (result.success && !result.alreadyInMode) {
      // Optional: Add a SYSTEM_EVENT message to the timeline to reflect this
      const sysMsgRef = adminDb!.collection('whatsapp_messages').doc(`sys_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
      await sysMsgRef.set({
        message_id: sysMsgRef.id,
        conversation_id: params.id,
        direction: 'OUTBOUND',
        sender_type: 'SYSTEM',
        type: 'SYSTEM_EVENT',
        text: action === 'TAKE_OVER' ? `Operator took control (${actor.uid})` : `Control returned to AI (${actor.uid})`,
        status: 'SENT',
        created_at: Date.now(),
        sent_at: Date.now()
      });
    }

    return NextResponse.json({ success: true, control_mode: result.newMode });
  } catch (error: any) {
    console.error('Failed to change control mode:', error);
    if (error.message === 'Conversation not found') {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: error.status || 500 });
  }
}
