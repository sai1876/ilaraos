import { adminDb } from '@/lib/firebaseAdmin';
import { sendWhatsAppMessage, WhatsAppSendResult } from '../client';
import { WhatsAppConversation, WhatsAppMessage } from './inboxTypes';
import { maskPhone } from '@/lib/security/maskPii';
import { getPhoneHash } from '../chat/conversationMemory';
import { stripUndefinedDeep } from '../../firestore/stripUndefinedDeep';

export interface SendMessageOptions {
  sender_type: 'AI' | 'HUMAN' | 'SYSTEM' | 'ENGAGEMENT' | 'OFFER';
  sender_user_id?: string;
  expected_control_version?: number;
}

export async function dispatchWhatsAppMessage(
  phoneNumberId: string | undefined,
  toPhone: string,
  messageText: string,
  options: SendMessageOptions
): Promise<WhatsAppSendResult> {
  const normalizedPhone = toPhone.replace(/[^0-9]/g, '');
  const convRef = adminDb!.collection('whatsapp_conversations').doc(normalizedPhone);

  // 1. Transactional check for control_version if AI
  if (options.sender_type === 'AI') {
    if (options.expected_control_version === undefined) {
      console.warn(`[MESSAGING SERVICE] AI send attempt missing expected_control_version for ${maskPhone(toPhone)}`);
      return { ok: false, status: 409, error: 'Missing expected_control_version' };
    }

    try {
      const allowed = await adminDb!.runTransaction(async (transaction) => {
        const snap = await transaction.get(convRef);
        if (!snap.exists) return true; // If no conversation yet, AI is allowed by default
        
        const data = snap.data() as WhatsAppConversation;
        if (data.control_mode === 'HUMAN') return false;
        if (data.control_version !== options.expected_control_version) return false;
        
        return true;
      });

      if (!allowed) {
        console.log(`[MESSAGING SERVICE] Blocked AI message to ${maskPhone(toPhone)} due to HUMAN takeover or version mismatch.`);
        return { ok: false, status: 409, error: 'Conversation controlled by human or stale generation' };
      }
    } catch (e) {
      console.error('[MESSAGING SERVICE] Transaction failed:', e);
      return { ok: false, status: 500, error: 'Internal transaction error' };
    }
  }

  // 2. Send via Canonical Meta Client
  const result = await sendWhatsAppMessage(phoneNumberId, toPhone, messageText);

  // 3. Persist the outbound message
  try {
    const now = Date.now();
    const messageId = result.ok ? result.messageId : `failed_${now}_${Math.random().toString(36).substr(2, 5)}`;
    const msgRef = adminDb!.collection('whatsapp_messages').doc(messageId);
    
    let type: WhatsAppMessage['type'] = 'TEXT';
    if (options.sender_type === 'ENGAGEMENT') type = 'ENGAGEMENT';
    if (options.sender_type === 'OFFER') type = 'OFFER';
    if (options.sender_type === 'SYSTEM') type = 'SYSTEM_EVENT';

    const msgData: WhatsAppMessage = {
      message_id: messageId,
      conversation_id: normalizedPhone,
      outlet_id: 'main',
      wamid: result.ok ? result.messageId : undefined,
      direction: 'OUTBOUND',
      sender_type: options.sender_type === 'ENGAGEMENT' || options.sender_type === 'OFFER' ? 'SYSTEM' : options.sender_type as any,
      sender_user_id: options.sender_user_id,
      type: type,
      text: messageText,
      status: result.ok ? 'SENT' : 'FAILED',
      created_at: now,
      created_at_ms: now,
      sent_at: result.ok ? now : undefined,
      failed_at: !result.ok ? now : undefined
    };

    const batch = adminDb!.batch();
    batch.set(msgRef, stripUndefinedDeep(msgData));

    // Update conversation
    const convUpdate: Partial<WhatsAppConversation> = {
      conversation_id: normalizedPhone,
      outlet_id: 'main',
      phone_hash: getPhoneHash(normalizedPhone),
      phone_masked: maskPhone(normalizedPhone),
      last_message_at: now,
      last_message_preview: type === 'TEXT' ? messageText : `[${type}]`,
      updated_at: now
    };
    
    if (options.sender_type === 'AI') {
      convUpdate.last_bot_message_at = now;
    }
    // Only AI and HUMAN default conversation creation/update (System/Engagement don't necessarily init)
    
    batch.set(convRef, stripUndefinedDeep(convUpdate), { merge: true });
    await batch.commit();

  } catch (err) {
    console.error(`[MESSAGING SERVICE] Failed to persist outbound message:`, err);
    // Don't fail the request since Meta accepted it, but log heavily.
  }

  return result;
}
