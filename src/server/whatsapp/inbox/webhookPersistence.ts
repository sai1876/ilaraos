import { adminDb } from '@/lib/firebaseAdmin';
import { WhatsAppConversation, WhatsAppMessage } from './inboxTypes';
import { getPhoneHash } from '../chat/conversationMemory';
import { maskPhone } from '@/lib/security/maskPii';


export async function persistInboundMessage(params: {
  messageId: string;
  fromPhone: string;
  normalizedPhone: string;
  customerName?: string;
  type: WhatsAppMessage['type'];
  text?: string;
  media?: WhatsAppMessage['media'];
}): Promise<{ controlMode: 'AI' | 'HUMAN', controlVersion: number }> {
  const convRef = adminDb!.collection('whatsapp_conversations').doc(params.normalizedPhone);
  const msgRef = adminDb!.collection('whatsapp_messages').doc(params.messageId);

  return await adminDb!.runTransaction(async (transaction) => {
    const snap = await transaction.get(convRef);
    let controlMode: 'AI' | 'HUMAN' = 'AI';
    let controlVersion = 1;

    let unreadCount = 1;

    const msgData: WhatsAppMessage = {
      message_id: params.messageId,
      conversation_id: params.normalizedPhone,
      outlet_id: 'main',
      wamid: params.messageId,
      direction: 'INBOUND',
      sender_type: 'CUSTOMER',
      type: params.type,
      text: params.text,
      media: params.media,
      status: 'RECEIVED',
      created_at: Date.now(),
      created_at_ms: Date.now()
    };

    if (snap.exists) {
      const data = snap.data() as WhatsAppConversation;
      controlMode = data.control_mode || 'AI';
      controlVersion = data.control_version || 1;
      unreadCount = (data.unread_count || 0) + 1;
    }

    const preview = params.type === 'TEXT' ? params.text : `[${params.type}]`;

    const convUpdate: Partial<WhatsAppConversation> = {
      conversation_id: params.normalizedPhone,
      outlet_id: 'main',
      phone_hash: getPhoneHash(params.normalizedPhone),
      phone_masked: maskPhone(params.normalizedPhone),
      status: 'OPEN',
      control_mode: controlMode,
      control_version: controlVersion,
      last_message_at: Date.now(),
      last_user_message_at: Date.now(),
      last_message_preview: preview,
      unread_count: unreadCount,
      updated_at: Date.now(),
      whatsapp_window_expires_at: Date.now() + 24 * 60 * 60 * 1000 // extend 24h
    };

    if (params.customerName && !snap.exists) {
      convUpdate.customer_display_name = params.customerName;
    }

    transaction.set(msgRef, msgData);
    transaction.set(convRef, convUpdate, { merge: true });

    return { controlMode, controlVersion };
  });
}

export async function processMessageStatuses(statuses: any[]) {
  if (!statuses || statuses.length === 0 || !adminDb) return;
  
  const batch = adminDb.batch();
  
  for (const status of statuses) {
    if (!status.id || !status.status) continue;
    
    // Statuses update based on wamid. We could query, but message_id == wamid for outbound.
    // However, if we generated our own ID for failures, it wouldn't match. But Meta only sends statuses for accepted messages, which have wamid as their ID.
    const msgRef = adminDb.collection('whatsapp_messages').doc(status.id);
    
    const updateData: any = {
      status: status.status.toUpperCase()
    };
    
    if (status.status === 'sent') updateData.sent_at = Date.now();
    if (status.status === 'delivered') updateData.delivered_at = Date.now();
    if (status.status === 'read') updateData.read_at = Date.now();
    if (status.status === 'failed') updateData.failed_at = Date.now();
    
    if (status.errors) {
      updateData.metadata = { errors: status.errors };
    }
    
    batch.set(msgRef, updateData, { merge: true });
  }
  
  await batch.commit();
}
