// [INTERNAL]
import { NextResponse } from 'next/server';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { adminDb } from '@/lib/firebaseAdmin';
import { dispatchWhatsAppMessage } from '@/server/whatsapp/inbox/messagingService';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireSessionActor(['owner', 'admin', 'manager']);
    
    const body = await request.json();
    const { text } = body;
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const convRef = adminDb!.collection('whatsapp_conversations').doc(params.id);
    const convSnap = await convRef.get();
    
    if (!convSnap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const data = convSnap.data()!;
    if (actor.role === 'manager' && data.outlet_id !== (actor.outletId || 'main')) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Check 24 hour window
    const windowExpiresAt = data.whatsapp_window_expires_at || 0;
    if (Date.now() > windowExpiresAt) {
      return NextResponse.json({ error: 'Cannot send message: WhatsApp 24-hour window has expired.' }, { status: 403 });
    }

    // Force mode to HUMAN if an operator replies manually
    if (data.control_mode !== 'HUMAN') {
      await convRef.update({
        control_mode: 'HUMAN',
        control_version: (data.control_version || 1) + 1,
        updated_at: Date.now()
      });
    }

    const result = await dispatchWhatsAppMessage(
      process.env.WHATSAPP_BOT_NUMBER_ID, // Ensure we use the configured bot number ID
      params.id,
      text,
      {
        sender_type: 'HUMAN',
        sender_user_id: actor.uid
      }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('Failed to send manual reply:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: error.status || 500 });
  }
}
