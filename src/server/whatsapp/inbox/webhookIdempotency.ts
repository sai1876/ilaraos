import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

export type ClaimDisposition = 'CLAIMED' | 'COMPLETED_DUPLICATE' | 'ACTIVE_PROCESSING';

export interface WebhookClaim {
  disposition: ClaimDisposition;
  processingToken?: string;
  attemptCount?: number;
}

const WHATSAPP_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export async function claimInboundWebhookMessage(params: {
  messageId: string;
  maskedFrom: string;
}): Promise<WebhookClaim> {
  const dupRef = adminDb!.collection('processed_whatsapp_messages').doc(params.messageId);

  return await adminDb!.runTransaction(async (transaction) => {
    const snap = await transaction.get(dupRef);
    const now = Date.now();
    const newProcessingToken = randomUUID();

    if (snap.exists) {
      const data = snap.data()!;
      let status = data.status;
      
      // Normalize legacy statuses
      if (status === 'processing') status = 'PROCESSING';
      if (status === 'completed') status = 'COMPLETED';
      if (status === 'failed') status = 'FAILED';

      if (status === 'COMPLETED') {
        return { disposition: 'COMPLETED_DUPLICATE' };
      }

      if (status === 'PROCESSING') {
        // If lease_expires_at is missing, treat as expired legacy (safe to reclaim immediately)
        const leaseExpiresAt = data.lease_expires_at || 0;
        
        if (now < leaseExpiresAt) {
          // Still active
          return { disposition: 'ACTIVE_PROCESSING' };
        }
        
        // Lease expired (or legacy missing lease), safe to reclaim
      }

      // If FAILED or expired PROCESSING, reclaim it
      const attemptCount = (data.attempt_count || 1) + 1;
      
      transaction.set(dupRef, {
        status: 'PROCESSING',
        attempt_count: attemptCount,
        processing_token: newProcessingToken,
        claimed_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_expires_at: now + WHATSAPP_PROCESSING_LEASE_MS,
      }, { merge: true });

      return {
        disposition: 'CLAIMED',
        processingToken: newProcessingToken,
        attemptCount
      };
    }

    // New message
    transaction.create(dupRef, {
      message_id: params.messageId,
      from: params.maskedFrom,
      status: 'PROCESSING',
      attempt_count: 1,
      processing_token: newProcessingToken,
      claimed_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: now + WHATSAPP_PROCESSING_LEASE_MS,
    });

    return {
      disposition: 'CLAIMED',
      processingToken: newProcessingToken,
      attemptCount: 1
    };
  });
}

export async function completeInboundWebhookMessage(
  messageId: string,
  processingToken: string
): Promise<void> {
  const dupRef = adminDb!.collection('processed_whatsapp_messages').doc(messageId);

  await adminDb!.runTransaction(async (transaction) => {
    const snap = await transaction.get(dupRef);
    if (!snap.exists) return;

    const data = snap.data()!;
    let status = data.status;
    if (status === 'processing') status = 'PROCESSING';

    if (status !== 'PROCESSING') {
      return; // Not in processing state, ignore
    }

    if (data.processing_token !== processingToken) {
      // Ownership lost, do not finalize
      return;
    }

    const updates: any = {
      status: 'COMPLETED',
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: admin.firestore.FieldValue.delete()
    };
    
    if (data.last_error_code !== undefined) {
      updates.last_error_code = admin.firestore.FieldValue.delete();
    }

    transaction.update(dupRef, updates);
  });
}

export async function failInboundWebhookMessage(
  messageId: string,
  processingToken: string,
  errorCode: string
): Promise<void> {
  const dupRef = adminDb!.collection('processed_whatsapp_messages').doc(messageId);

  await adminDb!.runTransaction(async (transaction) => {
    const snap = await transaction.get(dupRef);
    if (!snap.exists) return;

    const data = snap.data()!;
    let status = data.status;
    if (status === 'processing') status = 'PROCESSING';

    if (status !== 'PROCESSING') {
      return; // Only fail if it's currently processing
    }

    if (data.processing_token !== processingToken) {
      // Ownership lost, do not overwrite state of the new owner
      return;
    }

    transaction.update(dupRef, {
      status: 'FAILED',
      failed_at: admin.firestore.FieldValue.serverTimestamp(),
      last_error_code: errorCode,
      lease_expires_at: admin.firestore.FieldValue.delete()
    });
  });
}
