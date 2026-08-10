import { adminDb } from '@/lib/firebaseAdmin';
import { EngagementEvent } from './engagementTypes';
import crypto from 'crypto';
import * as admin from 'firebase-admin';

export const WHATSAPP_ENGAGEMENT_EVENTS_COL = 'whatsapp_engagement_events';

export async function recordEngagementEvent(event: Omit<EngagementEvent, 'engagement_id' | 'created_at'>): Promise<void> {
  if (!adminDb) return;
  
  try {
    const engagementId = crypto.randomUUID();
    const payload = {
      ...event,
      engagement_id: engagementId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await adminDb.collection(WHATSAPP_ENGAGEMENT_EVENTS_COL).doc(engagementId).set(payload);
  } catch (err) {
    console.error(`[ENGAGEMENT STORE] Failed to record engagement event for ${event.customer_id}:`, err);
  }
}
