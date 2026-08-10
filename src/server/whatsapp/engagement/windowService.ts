import { adminDb } from '@/lib/firebaseAdmin';
import { ConversationState } from '../chat/types';
import { updateConversationState } from '../chat/conversationMemory';
import { maskPhone } from '@/lib/security/maskPii';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministically checks if a customer's WhatsApp window is currently active.
 * Only genuine inbound user messages extend this window.
 */
export function isWhatsAppWindowActive(state: ConversationState): boolean {
  if (!state.whatsapp_window_expires_at) return false;
  return Date.now() < state.whatsapp_window_expires_at;
}

/**
 * Calculates the exact expiry timestamp based on the user's message time.
 */
export function getWhatsAppWindowExpiry(lastUserMessageAt: number): number {
  return lastUserMessageAt + TWENTY_FOUR_HOURS_MS;
}

/**
 * Extends the WhatsApp 24-hour window when a genuine customer inbound message arrives.
 * 
 * NOTE: This is called ONLY by inbound Webhooks (text, voice, location).
 * Do NOT call this for outbound bot messages or status/read receipts.
 */
export async function extendWhatsAppWindow(phone: string, customerId?: string): Promise<void> {
  const now = Date.now();
  const expiresAt = getWhatsAppWindowExpiry(now);

  const updates: Partial<ConversationState> = {
    last_user_message_at: now,
    whatsapp_window_expires_at: expiresAt,
  };

  if (customerId) {
    updates.customer_id = customerId;
  }

  await updateConversationState(phone, updates);
  console.log(`[WHATSAPP WINDOW] Extended window for ${maskPhone(phone)} until ${new Date(expiresAt).toISOString()}`);
}

/**
 * Deterministically retrieves only customers who have an ACTIVE WhatsApp window
 * and have not opted out of engagement.
 */
export async function getActiveWhatsAppCustomers(): Promise<{ phoneHash: string; state: ConversationState }[]> {
  if (!adminDb) return [];
  
  const now = Date.now();
  
  // Note: This query requires a composite index in Firestore on:
  // whatsapp_window_expires_at (ASC) + engagement_opt_out (ASC)
  const snapshot = await adminDb.collection('whatsapp_conversation_state')
    .where('whatsapp_window_expires_at', '>', now)
    .where('engagement_opt_out', '!=', true)
    .get();

  const activeCustomers: { phoneHash: string; state: ConversationState }[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data() as ConversationState;
    // Extra safety check in memory in case the query matched a falsy undefined 
    // or if the opt_out check missed something
    if (data.engagement_opt_out) return;
    if (!isWhatsAppWindowActive(data)) return;
    
    activeCustomers.push({ phoneHash: doc.id, state: data });
  });

  return activeCustomers;
}
