import { WhatsAppConversation, WhatsAppMessage } from './inboxTypes';
import { getPhoneHash } from '../chat/conversationMemory';
import { maskPhone } from '@/lib/security/maskPii';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function persistInboundMessage(params: {
  messageId: string;
  fromPhone: string;
  normalizedPhone: string;
  customerName?: string;
  type: WhatsAppMessage['type'];
  text?: string;
  media?: WhatsAppMessage['media'];
  outletId?: string;
}): Promise<{ controlMode: 'AI' | 'HUMAN', controlVersion: number }> {
  const phoneHash = getPhoneHash(params.normalizedPhone);
  const phoneMasked = maskPhone(params.normalizedPhone);
  
  const { data, error } = await supabase.rpc('persist_inbound_whatsapp_message', {
    p_message_id: params.messageId,
    p_conversation_id: params.normalizedPhone,
    p_outlet_id: params.outletId || 'main',
    p_phone_hash: phoneHash,
    p_phone_masked: phoneMasked,
    p_customer_name: params.customerName || null,
    p_type: params.type,
    p_text: params.text || null,
    p_media: params.media || null
  });

  if (error) {
    console.error('[WEBHOOK PERSISTENCE] Failed to persist canonical message:', error);
    return { controlMode: 'AI', controlVersion: 1 };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    controlMode: (result as any)?.out_control_mode || 'AI',
    controlVersion: (result as any)?.out_control_version || 1
  };
}

export async function processMessageStatuses(statuses: any[]) {
  if (!statuses || statuses.length === 0) return;
  
  for (const status of statuses) {
    if (!status.id || !status.status) continue;
    
    const updateData: any = {
      status: status.status.toUpperCase()
    };
    
    const nowIso = new Date().toISOString();
    if (status.status === 'sent') updateData.sent_at = nowIso;
    if (status.status === 'delivered') updateData.delivered_at = nowIso;
    if (status.status === 'read') updateData.read_at = nowIso;
    if (status.status === 'failed') updateData.failed_at = nowIso;
    
    if (status.errors) {
      updateData.metadata = { errors: status.errors };
    }
    
    await supabase
      .from('whatsapp_messages')
      .update(updateData)
      .eq('wamid', status.id);
  }
}
