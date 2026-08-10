import { adminDb } from '@/lib/firebaseAdmin';
import { getActiveWhatsAppCustomers } from '../engagement/windowService';
import { ConversationState } from '../chat/types';

export interface AudienceMember {
  customerId: string;
  phone: string;
  phoneHash: string;
  state: ConversationState;
}

/**
 * Resolves the audience of active-window customers who are eligible to receive 
 * the given offer broadcast.
 */
export async function resolveOfferAudience(): Promise<AudienceMember[]> {
  if (!adminDb) return [];
  
  const activeCustomers = await getActiveWhatsAppCustomers();
  const audience: AudienceMember[] = [];

  for (const { phoneHash, state } of activeCustomers) {
    if (!state.customer_id) continue;
    
    // Opt-out is already handled by getActiveWhatsAppCustomers, but we double-check
    if (state.engagement_opt_out) continue;

    try {
      const userDoc = await adminDb.collection('users').doc(state.customer_id).get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data()!;
      const rawPhone = (userData.phone || userData.phone_number || '').replace(/[^0-9]/g, "");
      
      if (!rawPhone) continue;

      audience.push({
        customerId: state.customer_id,
        phone: rawPhone,
        phoneHash,
        state
      });
    } catch (err) {
      console.error(`[OFFER AUDIENCE] Failed to resolve audience member ${state.customer_id}:`, err);
    }
  }

  console.log(`[WA_OFFER_AUDIENCE_RESOLVED] Found ${audience.length} eligible active-window customers.`);
  return audience;
}
