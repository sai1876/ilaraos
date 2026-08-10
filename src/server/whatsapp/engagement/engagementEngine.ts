import { adminDb } from '@/lib/firebaseAdmin';
import { getActiveWhatsAppCustomers } from './windowService';
import { EngagementGenerationContext } from './engagementTypes';
import { MenuItem } from '@/lib/types';
import { checkEngagementPolicy } from './engagementPolicy';
import { scoreEngagementContext } from './engagementScorer';
import { generateEngagementMessage } from './engagementGenerator';
import { recordEngagementEvent } from './engagementStore';
import { sendWhatsAppMessage } from '@/lib/voiceOrderingService';
import { updateConversationState } from '../chat/conversationMemory';
import { isActiveOrderStatus } from '@/lib/orderUtils';
import { maskPhone } from '@/lib/security/maskPii';

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_BOT_NUMBER_ID || '';

export async function runEngagementEngine() {
  console.log('[WA_ENGAGEMENT_RUN_STARTED]');
  if (!adminDb) {
    console.warn('[ENGAGEMENT ENGINE] Firebase Admin DB not initialized.');
    return;
  }

  const activeCustomers = await getActiveWhatsAppCustomers();
  console.log(`[WA_ENGAGEMENT_ACTIVE_WINDOWS] Found ${activeCustomers.length} active window(s).`);

  // --- GLOBAL CONTEXT FOR THE RUN ---
  
  // 1. Outlet Settings
  let outletLat = 17.4482;
  let outletLng = 78.3489;
  let outletIsOpen = true;
  let outletOpensAt = '08:00';
  let outletClosesAt = '23:30';
  
  try {
    const outletsSnap = await adminDb.collection('outlets').where('status', '==', 'active').limit(1).get();
    if (!outletsSnap.empty) {
      const outlet = outletsSnap.docs[0].data();
      if (typeof outlet.latitude === 'number') outletLat = outlet.latitude;
      if (typeof outlet.longitude === 'number') outletLng = outlet.longitude;
      if (typeof outlet.is_open === 'boolean') outletIsOpen = outlet.is_open;
      if (outlet.opens_at) outletOpensAt = outlet.opens_at;
      if (outlet.closes_at) outletClosesAt = outlet.closes_at;
    }
  } catch(e) {
    console.error('[WA_ENGAGEMENT] Failed to fetch outlet settings', e);
  }

  // 2. Weather
  let weatherCondition = 'unknown';
  let weatherTempC: number | undefined = undefined;
  let weatherRainProb: number | undefined = undefined;
  
  try {
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${outletLat}&longitude=${outletLng}&current=temperature_2m,weathercode,precipitation_probability,apparent_temperature&timezone=auto`
    );
    if (wRes.ok) {
      const wData = await wRes.json();
      weatherTempC = Math.round(wData.current.temperature_2m);
      weatherRainProb = wData.current.precipitation_probability || 0;
      const code = wData.current.weathercode;
      if (code === 0) weatherCondition = 'sunny and clear';
      else if (code <= 3) weatherCondition = 'partly cloudy';
      else if (code <= 48) weatherCondition = 'foggy';
      else if (code <= 67) weatherCondition = 'rainy';
      else if (code <= 77) weatherCondition = 'snowy';
      else if (code <= 99) weatherCondition = 'thunderstormy';
      else weatherCondition = 'clear';
    }
  } catch (err) {
    console.warn('[WA_ENGAGEMENT] Failed to fetch weather:', err);
  }

  // 3. Workstation Load
  const workload: Record<string, number> = {};
  try {
    const activeOrdersSnap = await adminDb.collection('orders')
      .where('status', 'in', ['pending', 'preparing'])
      .get();
    activeOrdersSnap.docs.forEach(doc => {
      const o = doc.data();
      (o.items || []).forEach((item: any) => {
        const st = item.station || 'UNKNOWN';
        workload[st] = (workload[st] || 0) + (item.quantity || 1);
      });
    });
  } catch(e) {
    console.error('[WA_ENGAGEMENT] Failed to compute workload', e);
  }

  // 4. Menu & Offers (Global)
  let availableMenuItems: MenuItem[] = [];
  try {
    const menuSnap = await adminDb.collection('menu').where('is_available', '==', true).get();
    availableMenuItems = menuSnap.docs.map(d => d.data() as MenuItem);
  } catch(e) {}
  
  let activeOffers: any[] = [];
  try {
    const offersSnap = await adminDb.collection('offers').where('status', '==', 'ACTIVE').get();
    activeOffers = offersSnap.docs.map(d => d.data());
  } catch(e) {}

  // Current Time Math
  const now = new Date();
  const localHour = now.getHours(); // simplified for now, openmeteo uses local? we use server time or passed timezone. Assuming server is local.
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOfWeek = days[now.getDay()];
  let dayPart: 'early_morning'|'breakfast'|'late_morning'|'lunch'|'afternoon'|'evening'|'dinner'|'late_night' = 'afternoon';
  if (localHour >= 5 && localHour < 8) dayPart = 'early_morning';
  else if (localHour >= 8 && localHour < 11) dayPart = 'breakfast';
  else if (localHour >= 11 && localHour < 12) dayPart = 'late_morning';
  else if (localHour >= 12 && localHour < 15) dayPart = 'lunch';
  else if (localHour >= 15 && localHour < 18) dayPart = 'afternoon';
  else if (localHour >= 18 && localHour < 20) dayPart = 'evening';
  else if (localHour >= 20 && localHour < 23) dayPart = 'dinner';
  else dayPart = 'late_night';

  const BATCH_SIZE = 5;
  for (let i = 0; i < activeCustomers.length; i += BATCH_SIZE) {
    const batch = activeCustomers.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async ({ phoneHash, state }) => {
      try {
        if (!state.customer_id) {
          console.log(`[WA_ENGAGEMENT_SKIPPED] Skipped ${phoneHash}: No customer_id linked to state.`);
          return;
        }

        // Retrieve user to get raw phone number
        const userDoc = await adminDb!.collection('users').doc(state.customer_id).get();
        if (!userDoc.exists) {
          console.log(`[WA_ENGAGEMENT_SKIPPED] Skipped ${phoneHash}: User ${state.customer_id} not found.`);
          return;
        }

        const userData = userDoc.data()!;
        const rawPhone = (userData.phone || userData.phone_number || '').replace(/[^0-9]/g, "");
        if (!rawPhone) {
          console.log(`[WA_ENGAGEMENT_SKIPPED] Skipped ${phoneHash}: User ${state.customer_id} has no valid phone number.`);
          return;
        }

        // Fetch user's orders to determine if they have an active order
        // and fetch recent orders to determine cart / frequent items.
        const ordersSnap = await adminDb!.collection('orders')
          .where('user_id', '==', state.customer_id)
          .orderBy('created_at', 'desc')
          .limit(10)
          .get();

        const orders = ordersSnap.docs.map(d => d.data());
        // We already fetched availableMenuItems globally
        const hasActiveOrder = orders.some(o => isActiveOrderStatus(o.status));

        const context: EngagementGenerationContext = {
          currentTime: new Date().toISOString(),
          localHour: localHour,
          dayOfWeek: dayOfWeek,
          dayPart: dayPart,
          weather: {
            condition: weatherCondition,
            temperatureC: weatherTempC,
            rainProbability: weatherRainProb
          },
          restaurant: {
            isOpen: outletIsOpen,
            opensAt: outletOpensAt,
            closesAt: outletClosesAt
          },
          workload: workload,
          customer: {
            preferredLanguage: (state.preferred_language as any) || 'en',
            favoriteCategories: [], // Need logic if available
            recentOrderItemIds: state.recent_item_ids || [],
          },
          cart: undefined, // Add proper cart logic if cart exists in user doc
          availableMenuItems: availableMenuItems,
          activeOffers: activeOffers,
          recentEngagements: state.recent_engagements || []
        };

        const oldContext = {
          customerId: state.customer_id,
          phone: rawPhone,
          phoneHash,
          preferredLanguage: (state.preferred_language as any) || 'en',
          lastUserMessageAt: state.last_user_message_at || 0,
          windowExpiresAt: state.whatsapp_window_expires_at || 0,
          lastEngagementAt: state.last_engagement_at,
          lastOfferBroadcastAt: state.last_offer_broadcast_at,
          engagementCountToday: state.engagement_count_today || 0,
          activeOrder: hasActiveOrder,
          recentItemIds: state.recent_item_ids || [],
          currentAvailableMenuItems: availableMenuItems,
          currentHour: localHour,
          optedOut: !!state.engagement_opt_out
        };

        // 1. Hard Policy Check
        const policy = checkEngagementPolicy(oldContext as any);
        if (!policy.eligible) {
          console.log(`[WA_ENGAGEMENT_SKIPPED] Skipped ${state.customer_id} (${maskPhone(rawPhone)}): ${policy.skipReason}`);
          return;
        }

        // 2. Scoring
        const scoreResult = scoreEngagementContext(context);
        if (scoreResult.reason === 'NONE') {
          console.log(`[WA_ENGAGEMENT_SKIPPED] Skipped ${state.customer_id} (${maskPhone(rawPhone)}): Score too low (${scoreResult.score})`);
          return;
        }

        console.log(`[WA_ENGAGEMENT_ELIGIBLE] Customer ${state.customer_id} (${maskPhone(rawPhone)}) eligible for ${scoreResult.reason} (Score: ${scoreResult.score})`);

        // 3. Generate Message
        const generatedMemory = await generateEngagementMessage(context, scoreResult.reason);
        if (!generatedMemory) {
          console.log(`[WA_ENGAGEMENT_FAILED] Failed to generate message for ${state.customer_id}`);
          await recordEngagementEvent({
            customer_id: state.customer_id,
            reason: scoreResult.reason,
            score: scoreResult.score,
            status: 'failed',
            skip_reason: 'ai_generation_failed',
            window_expires_at_at_send: oldContext.windowExpiresAt
          });
          return;
        }

        // 4. Send Message
        const result = await sendWhatsAppMessage(WHATSAPP_PHONE_NUMBER_ID, rawPhone, generatedMemory.message);
        const success = result.ok;
        
        if (success) {
          console.log(`[WA_ENGAGEMENT_SENT] Sent engagement to ${state.customer_id} (${maskPhone(rawPhone)})`);
          
          const newRecent = [generatedMemory, ...(state.recent_engagements || [])].slice(0, 10);
          
          await updateConversationState(rawPhone, {
            last_engagement_at: Date.now(),
            last_engagement_reason: scoreResult.reason,
            engagement_count_today: oldContext.engagementCountToday + 1,
            recent_engagements: newRecent
          });

          await recordEngagementEvent({
            customer_id: state.customer_id,
            reason: scoreResult.reason,
            score: scoreResult.score,
            status: 'sent',
            message_variant: generatedMemory.message,
            sent_at: Date.now(),
            window_expires_at_at_send: oldContext.windowExpiresAt
          });
        } else {
          console.log(`[WA_ENGAGEMENT_FAILED] WhatsApp delivery failed for ${state.customer_id}`);
          await recordEngagementEvent({
            customer_id: state.customer_id,
            reason: scoreResult.reason,
            score: scoreResult.score,
            status: 'failed',
            skip_reason: 'whatsapp_api_failure',
            window_expires_at_at_send: oldContext.windowExpiresAt
          });
        }

      } catch (err) {
        console.error(`[WA_ENGAGEMENT_FAILED] Exception processing customer state ${phoneHash}:`, err);
      }
    }));
  }
}
