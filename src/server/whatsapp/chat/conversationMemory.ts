import { adminDb } from '@/lib/firebaseAdmin';
import { ConversationState, ConversationTurn } from './types';
import crypto from 'crypto';

export function getPhoneHash(phone: string): string {
  const secret = process.env.WHATSAPP_APP_SECRET || 'default_secret';
  return crypto.createHmac('sha256', secret).update(phone).digest('hex');
}

export async function getConversationState(phone: string): Promise<ConversationState> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');
  
  const hash = getPhoneHash(phone);
  const docRef = adminDb.collection('whatsapp_conversation_state').doc(hash);
  const snap = await docRef.get();
  
  const now = Date.now();
  if (snap.exists) {
    const data = snap.data() as ConversationState;
    if (data.expires_at > now) {
      return data;
    }
  }
  
  return {
    recent_item_ids: [],
    turns: [],
    updated_at: now,
    expires_at: now + 30 * 60 * 1000 // 30 mins expiration
  };
}

export async function updateConversationState(
  phone: string, 
  update: Partial<ConversationState>, 
  newTurn?: ConversationTurn
): Promise<void> {
  if (!adminDb) return;
  
  const hash = getPhoneHash(phone);
  const docRef = adminDb.collection('whatsapp_conversation_state').doc(hash);
  
  const current = await getConversationState(phone);
  
  const turns = current.turns || [];
  if (newTurn) {
    turns.push(newTurn);
  }
  
  // Keep only last 10 turns
  const trimmedTurns = turns.slice(-10);
  
  const now = Date.now();
  const newState: ConversationState = {
    ...current,
    ...update,
    turns: trimmedTurns,
    updated_at: now,
    expires_at: now + 30 * 60 * 1000
  };
  
  await docRef.set(newState, { merge: true });
}
