import { adminDb } from '@/lib/firebaseAdmin';
import { ConversationAlias } from './types';
import { ulid } from 'ulid';
import { FieldValue } from 'firebase-admin/firestore';

export const ALIAS_COL = 'archive_conversation_aliases';

/**
 * Returns the privacy-safe Drive folder alias for a given phone number.
 * Ensures the alias is permanent and reused across jobs for the same phone.
 */
export async function getOrCreateConversationAlias(conversationId: string): Promise<string> {
  const docRef = adminDb!.collection(ALIAS_COL).doc(conversationId);
  
  return await adminDb!.runTransaction(async (t) => {
    const doc = await t.get(docRef);
    if (doc.exists) {
      const data = doc.data() as ConversationAlias;
      return data.archive_conversation_key;
    }

    const newKey = `CHAT-${ulid()}`;
    const aliasData: ConversationAlias = {
      conversation_id: conversationId,
      archive_conversation_key: newKey,
      created_at: FieldValue.serverTimestamp() as any
    };

    t.set(docRef, aliasData);
    return newKey;
  });
}
