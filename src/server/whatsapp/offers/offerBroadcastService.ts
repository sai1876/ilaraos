import { Offer } from './offerBroadcastTypes';
import { resolveOfferAudience } from './offerAudienceResolver';
import { buildOfferMessage } from './offerMessageBuilder';
import { createDeliveryRecord, updateDeliveryRecord } from './offerDeliveryStore';
import { sendWhatsAppMessage } from '@/lib/voiceOrderingService';
import { updateConversationState } from '../chat/conversationMemory';
import { maskPhone } from '@/lib/security/maskPii';

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_BOT_NUMBER_ID || '';

/**
 * Consumes a published offer and asynchronously broadcasts it to the active WhatsApp audience.
 * DO NOT await this inside a database transaction.
 */
export async function processOfferPublished(offer: Offer): Promise<void> {
  console.log(`[WA_OFFER_BROADCAST] Starting broadcast for offer ${offer.offer_id} v${offer.version}`);

  if (offer.status !== 'ACTIVE') {
    console.warn(`[WA_OFFER_BROADCAST] Offer ${offer.offer_id} is not ACTIVE (status: ${offer.status}). Aborting broadcast.`);
    return;
  }

  const audience = await resolveOfferAudience();
  
  if (audience.length === 0) {
    console.log(`[WA_OFFER_BROADCAST] No active eligible audience found for offer ${offer.offer_id}`);
    return;
  }

  // Process in small batches to respect rate limits and memory
  const BATCH_SIZE = 5;
  for (let i = 0; i < audience.length; i += BATCH_SIZE) {
    const batch = audience.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (member) => {
      try {
        // 1. Idempotency Check
        const delivery = await createDeliveryRecord(offer.offer_id, offer.version, member.customerId);
        if (!delivery) {
          console.log(`[WA_OFFER_BROADCAST] Skipped ${maskPhone(member.phone)}: Already processed this offer version.`);
          return;
        }

        // 2. Build standard deterministic message
        const messageText = buildOfferMessage(offer, member.state.preferred_language || 'en');

        // 3. Send Message
        let success = false;
        try {
           const result = await sendWhatsAppMessage(WHATSAPP_PHONE_NUMBER_ID, member.phone, messageText);
           success = result.ok;
        } catch(e) {
           success = false;
        }

        // 4. Handle Result
        if (success) {
          console.log(`[WA_OFFER_BROADCAST] Sent offer ${offer.offer_id} to ${maskPhone(member.phone)}`);
          
          await updateDeliveryRecord(delivery.delivery_id, {
            status: 'sent',
            sent_at: Date.now(),
            window_expires_at_at_send: member.state.whatsapp_window_expires_at
          });

          // Update conversation state so engagement engine knows we just bothered them
          await updateConversationState(member.phone, {
            last_offer_broadcast_at: Date.now()
          });
        } else {
          console.error(`[WA_OFFER_BROADCAST] Failed to send offer ${offer.offer_id} to ${maskPhone(member.phone)}`);
          await updateDeliveryRecord(delivery.delivery_id, {
            status: 'failed',
            failed_at: Date.now(),
            skip_reason: 'whatsapp_api_failure',
            window_expires_at_at_send: member.state.whatsapp_window_expires_at
          });
        }
      } catch (err) {
        console.error(`[WA_OFFER_BROADCAST] Unhandled error for customer ${member.customerId}:`, err);
      }
    }));
  }

  console.log(`[WA_OFFER_BROADCAST] Completed broadcast run for offer ${offer.offer_id}`);
}
