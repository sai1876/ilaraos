import { sendWhatsAppMessage, WhatsAppSendResult } from '../client';
import { WhatsAppConversation, WhatsAppMessage } from './inboxTypes';
import { maskPhone } from '@/lib/security/maskPii';
import { getPhoneHash } from '../chat/conversationMemory';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      const { data: allowed, error } = await supabase.rpc('check_and_increment_control_version', {
        p_conversation_id: normalizedPhone,
        p_expected_version: options.expected_control_version
      });
      
      if (error) {
        console.error('[MESSAGING SERVICE] Transaction failed:', error);
        return { ok: false, status: 500, error: 'Internal transaction error' };
      }

      if (!allowed) {
        console.log(`[MESSAGING SERVICE] Blocked AI message to ${maskPhone(toPhone)} due to HUMAN takeover or version mismatch.`);
        return { ok: false, status: 409, error: 'Conversation controlled by human or stale generation' };
      }
    } catch (e) {
      console.error('[MESSAGING SERVICE] RPC call failed:', e);
      return { ok: false, status: 500, error: 'Internal RPC error' };
    }
  }

  // 2. Send via Canonical Meta Client
  const result = await sendWhatsAppMessage(phoneNumberId, toPhone, messageText);

  // 3. Persist the outbound message
  try {
    const messageId = result.ok ? result.messageId : `failed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    let type: WhatsAppMessage['type'] = 'TEXT';
    if (options.sender_type === 'ENGAGEMENT') type = 'ENGAGEMENT';
    if (options.sender_type === 'OFFER') type = 'OFFER';
    if (options.sender_type === 'SYSTEM') type = 'SYSTEM_EVENT';

    const nowIso = new Date().toISOString();

    await supabase.from('whatsapp_messages').insert({
      id: messageId,
      conversation_id: normalizedPhone,
      wamid: result.ok ? result.messageId : null,
      direction: 'OUTBOUND',
      sender_type: options.sender_type === 'ENGAGEMENT' || options.sender_type === 'OFFER' ? 'SYSTEM' : options.sender_type as any,
      sender_user_id: options.sender_user_id,
      type: type,
      text: messageText,
      status: result.ok ? 'SENT' : 'FAILED',
      created_at: nowIso,
      sent_at: result.ok ? nowIso : null,
      failed_at: !result.ok ? nowIso : null
    });

    // Update conversation
    const convUpdate: any = {
      last_message_at: nowIso,
      last_message_preview: type === 'TEXT' ? messageText : `[${type}]`,
      updated_at: nowIso
    };
    
    if (options.sender_type === 'AI') {
      convUpdate.last_bot_message_at = nowIso;
    }
    
    // We only update, assuming inbound message or explicit human takeover already created the row.
    // However, we should probably do a raw upsert if it doesn't exist, but since OUTBOUND implies we received a message or manually created one, it should exist.
    await supabase.from('whatsapp_conversations').update(convUpdate).eq('id', normalizedPhone);

  } catch (err) {
    console.error(`[MESSAGING SERVICE] Failed to persist outbound message:`, err);
    // Don't fail the request since Meta accepted it, but log heavily.
  }

  return result;
}
