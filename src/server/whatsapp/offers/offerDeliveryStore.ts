import { adminDb } from '@/lib/firebaseAdmin';
import { OfferDelivery } from './offerBroadcastTypes';
import crypto from 'crypto';
import * as admin from 'firebase-admin';

export const WHATSAPP_OFFER_DELIVERIES_COL = 'whatsapp_offer_deliveries';

/**
 * Generates a deterministic idempotency key for an offer delivery attempt.
 */
export function getDeliveryId(offerId: string, offerVersion: number, customerId: string): string {
  return crypto.createHash('sha256').update(`${offerId}_v${offerVersion}_${customerId}`).digest('hex');
}

/**
 * Records the offer delivery intent. If this exact delivery (offer + version + customer)
 * was already attempted, it fails to create a new one, ensuring idempotency.
 */
export async function createDeliveryRecord(
  offerId: string,
  offerVersion: number,
  customerId: string
): Promise<OfferDelivery | null> {
  if (!adminDb) return null;

  const deliveryId = getDeliveryId(offerId, offerVersion, customerId);
  const docRef = adminDb.collection(WHATSAPP_OFFER_DELIVERIES_COL).doc(deliveryId);

  try {
    const payload: Omit<OfferDelivery, 'created_at'> & { created_at: any } = {
      delivery_id: deliveryId,
      offer_id: offerId,
      offer_version: offerVersion,
      customer_id: customerId,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Use a transaction to ensure we only create it if it doesn't exist
    await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (doc.exists) {
        throw new Error('ALREADY_EXISTS');
      }
      transaction.set(docRef, payload);
    });

    return { ...payload, created_at: Date.now() } as OfferDelivery;
  } catch (err: any) {
    if (err.message === 'ALREADY_EXISTS') {
      return null; // Idempotency protected
    }
    console.error(`[OFFER STORE] Failed to create delivery record ${deliveryId}:`, err);
    throw err;
  }
}

/**
 * Updates the delivery status after a send attempt.
 */
export async function updateDeliveryRecord(
  deliveryId: string,
  update: Partial<OfferDelivery>
): Promise<void> {
  if (!adminDb) return;
  
  try {
    const docRef = adminDb.collection(WHATSAPP_OFFER_DELIVERIES_COL).doc(deliveryId);
    await docRef.set(update, { merge: true });
  } catch (err) {
    console.error(`[OFFER STORE] Failed to update delivery record ${deliveryId}:`, err);
  }
}
