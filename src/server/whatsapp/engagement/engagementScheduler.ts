import { adminDb } from '@/lib/firebaseAdmin';
import { ConversationState } from '../chat/types';
import { getPhoneHash, updateConversationState } from '../chat/conversationMemory';
import { getEngagementTemplate } from './engagementTemplates';
import { isActiveOrderStatus } from '@/lib/orderUtils';
import { sendWhatsAppMessage } from '@/lib/voiceOrderingService';

export async function processProactiveEngagement() {
  if (!adminDb) return { success: false, reason: 'No admin DB' };

  const cooldownHours = Number(process.env.WHATSAPP_ENGAGEMENT_COOLDOWN_HOURS ?? 24);
  const clampedCooldownHours = Math.max(1, Math.min(cooldownHours, 168)); // Min 1 hr, Max 1 week
  const cooldownMs = clampedCooldownHours * 60 * 60 * 1000;
  
  const now = Date.now();

  try {
    // We fetch all active users with registered phones. 
    // In a real large-scale system, we'd chunk this or use a more specific query.
    const usersSnap = await adminDb.collection('users').where('status', '==', 'active').get();
    
    let engagedCount = 0;

    for (const doc of usersSnap.docs) {
      const userData = doc.data();
      let phoneStr = userData.phone || userData.phone_number;
      if (!phoneStr) continue;
      
      const digits = phoneStr.replace(/[^0-9]/g, '');
      if (digits.length < 10) continue;
      const normalizedPhone = '91' + digits.slice(-10); // Standardize to 91XXXXXXXXXX

      const hash = getPhoneHash(normalizedPhone);
      const stateRef = adminDb.collection('whatsapp_conversation_state').doc(hash);
      const stateSnap = await stateRef.get();
      
      if (!stateSnap.exists) continue;
      const state = stateSnap.data() as ConversationState;

      // 1. Check Opt-out
      if (state.engagement_opt_out) continue;

      // 2. Cooldown check
      const lastEngagement = state.last_engagement_at || 0;
      if (now - lastEngagement < cooldownMs) continue;

      // 3. Recent interaction check (Don't spam if they chatted recently, e.g. within last 6 hours)
      const lastUserMsg = state.last_user_message_at || 0;
      if (now - lastUserMsg < 6 * 60 * 60 * 1000) continue;

      // 4. Active Order check
      const ordersSnap = await adminDb.collection('orders')
        .where('customer_id', '==', doc.id)
        .orderBy('created_at', 'desc')
        .limit(3) // check recent orders
        .get();
        
      let hasActiveOrder = false;
      for (const orderDoc of ordersSnap.docs) {
        const orderStatus = orderDoc.data().status;
        if (isActiveOrderStatus(orderStatus)) {
          hasActiveOrder = true;
          break;
        }
      }

      if (hasActiveOrder) continue;

      // 5. Restaurant Open check
      // For now, assume it's handled by cron timing or add logic here.
      // E.g., we can skip if hours are outside 10AM - 11PM.
      const currentHour = new Date().getHours();
      if (currentHour < 10 || currentHour > 23) {
        continue; // Outside engagement window
      }

      // 6. Send Engagement
      const lang = state.preferred_language || 'en';
      const message = getEngagementTemplate(lang);

      // In production, phoneNumberId would come from config/env
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!phoneNumberId) continue;

      await sendWhatsAppMessage(phoneNumberId, normalizedPhone, message);
      
      await updateConversationState(normalizedPhone, {
        last_engagement_at: now,
        engagement_count_today: (state.engagement_count_today || 0) + 1
      });

      engagedCount++;
    }

    return { success: true, engagedCount };
  } catch (err) {
    console.error('[ENGAGEMENT SCHEDULER ERROR]', err);
    return { success: false, error: String(err) };
  }
}
