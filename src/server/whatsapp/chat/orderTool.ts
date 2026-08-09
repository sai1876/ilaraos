import { adminDb } from '@/lib/firebaseAdmin';
import { MenuItem } from '@/lib/types';
import crypto from 'crypto';
import * as admin from 'firebase-admin';

export async function stageOrderInDatabase(
  phone: string,
  userId: string,
  items: { item: MenuItem, quantity: number }[]
): Promise<string> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');
  if (items.length === 0) return '';

  let estimatedTotal = 0;
  const matchedItemsWithDetails = [];

  for (const match of items) {
    const itemTotal = match.item.price * match.quantity;
    estimatedTotal += itemTotal;
    matchedItemsWithDetails.push({ 
      name: match.item.name, 
      qty: match.quantity, 
      unit_price: match.item.price 
    });
  }

  const voiceOrderId = crypto.randomUUID();
  await adminDb.collection('voice_orders').doc(voiceOrderId).set({
    user_phone: phone,
    user_id: userId,
    items: matchedItemsWithDetails,
    estimated_total: estimatedTotal,
    status: 'staged',
    created_at: admin.firestore.Timestamp.now(),
    expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
  });

  return voiceOrderId;
}
