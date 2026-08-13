import { adminDb } from '@/lib/firebaseAdmin';
import crypto from 'crypto';

export type ChallengePurpose = 'passwordless_login' | 'phone_verification';
export type ChallengeStatus = 'pending' | 'verified' | 'consuming' | 'bootstrap_issued' | 'consumed' | 'failed';

export interface WhatsAppChallenge {
  challengeVersion: 2;
  purpose: ChallengePurpose;
  expectedPhoneHash: string;
  browserBindingHash: string;
  verifierHash: string;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  
  uid?: string;
  
  verifiedAt?: number;
  consumedAt?: number;
  consumedBy?: string;
  
  consumeLeaseId?: string;
  consumeLeaseExpiresAt?: number;
  consumeAttemptCount?: number;
}

const MAX_BOOTSTRAP_ATTEMPTS = 3;

/**
 * Returns canonical +91 format for India numbers.
 * Reject malformed or ambiguous values.
 */
export function canonicalizePhone(phone: string): string | null {
  if (!phone) return null;
  // Remove spaces, hyphens, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  
  if (!/^\d{10}$/.test(cleaned)) {
    return null;
  }
  
  return `+91${cleaned}`;
}

export function hashPhone(canonicalPhone: string): string {
  const secret = process.env.AUTH_HASH_SECRET;
  if (!secret) {
    throw new Error('AUTH_HASH_SECRET is not configured');
  }
  return crypto.createHmac('sha256', secret).update(canonicalPhone).digest('hex');
}

export function generateHighEntropySecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateShortVerifier(): string {
  // A shorter secure verifier for WhatsApp messages (e.g. 12 chars base62)
  const bytes = crypto.randomBytes(16);
  return bytes.toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export async function createPasswordlessChallenge(
  canonicalPhone: string,
  browserBindingHash: string,
  uid?: string
) {
  const challengeId = crypto.randomUUID();
  const verifier = generateShortVerifier();
  const expectedPhoneHash = hashPhone(canonicalPhone);
  
  const challenge: WhatsAppChallenge = {
    challengeVersion: 2,
    purpose: 'passwordless_login',
    expectedPhoneHash,
    browserBindingHash,
    verifierHash: hashSecret(verifier),
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    uid,
    consumeAttemptCount: 0
  };
  
  await adminDb!.collection('whatsapp_challenges').doc(challengeId).set(challenge);
  return { challengeId, verifier };
}

export async function createSignupChallenge(
  canonicalPhone: string,
  browserBindingHash: string
) {
  const challengeId = crypto.randomUUID();
  const verifier = generateShortVerifier();
  const expectedPhoneHash = hashPhone(canonicalPhone);
  
  const challenge: WhatsAppChallenge = {
    challengeVersion: 2,
    purpose: 'phone_verification',
    expectedPhoneHash,
    browserBindingHash,
    verifierHash: hashSecret(verifier),
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    consumeAttemptCount: 0
  };
  
  await adminDb!.collection('whatsapp_challenges').doc(challengeId).set(challenge);
  return { challengeId, verifier };
}

// ---------------------------------------------------------
// WEBHOOK INBOUND VERIFICATION
// ---------------------------------------------------------

async function _verifyChallengeBySender(
  challengeId: string, 
  verifier: string, 
  canonicalSenderPhone: string,
  purpose: ChallengePurpose
) {
  const senderHash = hashPhone(canonicalSenderPhone);
  const providedVerifierHash = hashSecret(verifier);

  return adminDb!.runTransaction(async (t) => {
    const ref = adminDb!.collection('whatsapp_challenges').doc(challengeId);
    const doc = await t.get(ref);
    if (!doc.exists) {
      return { success: false, reason: 'not_found' };
    }
    const challenge = doc.data() as WhatsAppChallenge;
    
    if (challenge.purpose !== purpose) {
      return { success: false, reason: 'wrong_purpose' };
    }
    
    if (challenge.status !== 'pending') {
      return { success: false, reason: 'not_pending' };
    }
    
    if (Date.now() > challenge.expiresAt) {
      t.update(ref, { status: 'failed' });
      return { success: false, reason: 'expired' };
    }
    
    // Constant time comparison for expected hash vs sender hash
    const expectedBuf = Buffer.from(challenge.expectedPhoneHash, 'hex');
    const senderBuf = Buffer.from(senderHash, 'hex');
    if (expectedBuf.length !== senderBuf.length || !crypto.timingSafeEqual(expectedBuf, senderBuf)) {
      return { success: false, reason: 'sender_mismatch' };
    }
    
    // Constant time comparison for verifier
    const storedVerifierBuf = Buffer.from(challenge.verifierHash, 'hex');
    const providedVerifierBuf = Buffer.from(providedVerifierHash, 'hex');
    if (storedVerifierBuf.length !== providedVerifierBuf.length || !crypto.timingSafeEqual(storedVerifierBuf, providedVerifierBuf)) {
      return { success: false, reason: 'invalid_verifier' };
    }
    
    t.update(ref, { 
      status: 'verified',
      verifiedAt: Date.now()
    });
    
    return { success: true };
  });
}

export function verifyPasswordlessChallenge(challengeId: string, verifier: string, canonicalSenderPhone: string) {
  return _verifyChallengeBySender(challengeId, verifier, canonicalSenderPhone, 'passwordless_login');
}

export function verifySignupChallenge(challengeId: string, verifier: string, canonicalSenderPhone: string) {
  return _verifyChallengeBySender(challengeId, verifier, canonicalSenderPhone, 'phone_verification');
}

// ---------------------------------------------------------
// POLLING 
// ---------------------------------------------------------

export async function getChallengePollState(challengeId: string, browserBindingHash: string) {
  const doc = await adminDb!.collection('whatsapp_challenges').doc(challengeId).get();
  if (!doc.exists) return { success: false, reason: 'not_found' };
  
  const challenge = doc.data() as WhatsAppChallenge;
  
  // Verify binding
  const storedBindingBuf = Buffer.from(challenge.browserBindingHash, 'hex');
  const providedBindingBuf = Buffer.from(browserBindingHash, 'hex');
  if (storedBindingBuf.length !== providedBindingBuf.length || !crypto.timingSafeEqual(storedBindingBuf, providedBindingBuf)) {
    return { success: false, reason: 'binding_mismatch' };
  }
  
  return { 
    success: true, 
    status: challenge.status,
    purpose: challenge.purpose
  };
}

// ---------------------------------------------------------
// PASSWORDLESS BOOTSTRAP CONSUMPTION (POLLING)
// ---------------------------------------------------------

export async function reservePasswordlessBootstrap(challengeId: string, browserBindingHash: string, leaseDurationMs = 5000) {
  return adminDb!.runTransaction(async (t) => {
    const ref = adminDb!.collection('whatsapp_challenges').doc(challengeId);
    const doc = await t.get(ref);
    if (!doc.exists) return { success: false, reason: 'not_found' };
    
    const challenge = doc.data() as WhatsAppChallenge;
    
    if (challenge.purpose !== 'passwordless_login') {
      return { success: false, reason: 'wrong_purpose' };
    }
    
    const storedBindingBuf = Buffer.from(challenge.browserBindingHash, 'hex');
    const providedBindingBuf = Buffer.from(browserBindingHash, 'hex');
    if (storedBindingBuf.length !== providedBindingBuf.length || !crypto.timingSafeEqual(storedBindingBuf, providedBindingBuf)) {
      return { success: false, reason: 'binding_mismatch' };
    }
    
    if (challenge.status === 'bootstrap_issued') {
      return { success: false, reason: 'already_issued' };
    }

    if (challenge.status !== 'verified' && challenge.status !== 'consuming') {
      return { success: false, reason: 'not_verified' };
    }
    
    const attempts = challenge.consumeAttemptCount || 0;
    if (attempts >= MAX_BOOTSTRAP_ATTEMPTS) {
      t.update(ref, { status: 'failed' });
      return { success: false, reason: 'max_attempts_reached' };
    }
    
    // Check if currently reserved and not expired
    if (challenge.status === 'consuming' && challenge.consumeLeaseExpiresAt && Date.now() < challenge.consumeLeaseExpiresAt) {
      return { success: false, reason: 'lease_active' };
    }
    
    const leaseId = crypto.randomUUID();
    
    t.update(ref, {
      status: 'consuming',
      consumeLeaseId: leaseId,
      consumeLeaseExpiresAt: Date.now() + leaseDurationMs,
      consumeAttemptCount: attempts + 1
    });
    
    return { success: true, leaseId, uid: challenge.uid };
  });
}

export async function releasePasswordlessBootstrapReservation(challengeId: string, leaseId: string) {
  return adminDb!.runTransaction(async (t) => {
    const ref = adminDb!.collection('whatsapp_challenges').doc(challengeId);
    const doc = await t.get(ref);
    if (!doc.exists) return false;
    
    const challenge = doc.data() as WhatsAppChallenge;
    
    if (challenge.status === 'consuming' && challenge.consumeLeaseId === leaseId) {
      // Release lease back to verified
      t.update(ref, {
        status: 'verified',
        consumeLeaseId: null,
        consumeLeaseExpiresAt: null
      });
      return true;
    }
    return false;
  });
}

export async function markPasswordlessBootstrapIssued(challengeId: string, leaseId: string) {
  return adminDb!.runTransaction(async (t) => {
    const ref = adminDb!.collection('whatsapp_challenges').doc(challengeId);
    const doc = await t.get(ref);
    if (!doc.exists) return false;
    
    const challenge = doc.data() as WhatsAppChallenge;
    
    if (challenge.status === 'consuming' && challenge.consumeLeaseId === leaseId) {
      t.update(ref, {
        status: 'bootstrap_issued',
        consumeLeaseId: null,
        consumeLeaseExpiresAt: null
      });
      return true;
    }
    return false;
  });
}

// ---------------------------------------------------------
// FINAL PASSWORDLESS CANONICALIZATION (CUSTOMER SESSION)
// ---------------------------------------------------------

export async function finalizePasswordlessLogin(challengeId: string, uid: string, canonicalPhone: string, browserBindingHash: string) {
  return adminDb!.runTransaction(async (t) => {
    const ref = adminDb!.collection('whatsapp_challenges').doc(challengeId);
    const doc = await t.get(ref);
    if (!doc.exists) return { success: false, reason: 'not_found' };
    
    const challenge = doc.data() as WhatsAppChallenge;
    
    if (challenge.purpose !== 'passwordless_login') return { success: false, reason: 'wrong_purpose' };
    if (challenge.status !== 'bootstrap_issued') return { success: false, reason: 'not_issued' };
    if (challenge.uid !== uid) return { success: false, reason: 'uid_mismatch' };
    if (Date.now() > challenge.expiresAt) return { success: false, reason: 'expired' };
    
    const storedBindingBuf = Buffer.from(challenge.browserBindingHash, 'hex');
    const providedBindingBuf = Buffer.from(browserBindingHash, 'hex');
    if (storedBindingBuf.length !== providedBindingBuf.length || !crypto.timingSafeEqual(storedBindingBuf, providedBindingBuf)) {
      return { success: false, reason: 'binding_mismatch' };
    }
    
    const phoneHash = hashPhone(canonicalPhone);
    const expectedBuf = Buffer.from(challenge.expectedPhoneHash, 'hex');
    const incomingBuf = Buffer.from(phoneHash, 'hex');
    if (expectedBuf.length !== incomingBuf.length || !crypto.timingSafeEqual(expectedBuf, incomingBuf)) {
      return { success: false, reason: 'identity_changed' };
    }
    
    t.update(ref, {
      status: 'consumed',
      consumedAt: Date.now(),
      consumedBy: uid
    });
    
    return { success: true };
  });
}

// ---------------------------------------------------------
// SIGNUP CHALLENGE VALIDATION & CONSUMPTION (CREATE PROFILE)
// ---------------------------------------------------------

export async function validateSignupChallenge(challengeId: string, canonicalPhone: string, browserBindingHash: string) {
  const doc = await adminDb!.collection('whatsapp_challenges').doc(challengeId).get();
  if (!doc.exists) return { success: false, reason: 'not_found' };
  
  const challenge = doc.data() as WhatsAppChallenge;
  
  if (challenge.purpose !== 'phone_verification') return { success: false, reason: 'wrong_purpose' };
  if (challenge.status !== 'verified') return { success: false, reason: 'not_verified' };
  if (Date.now() > challenge.expiresAt) return { success: false, reason: 'expired' };
  
  const storedBindingBuf = Buffer.from(challenge.browserBindingHash, 'hex');
  const providedBindingBuf = Buffer.from(browserBindingHash, 'hex');
  if (storedBindingBuf.length !== providedBindingBuf.length || !crypto.timingSafeEqual(storedBindingBuf, providedBindingBuf)) {
    return { success: false, reason: 'binding_mismatch' };
  }
  
  const phoneHash = hashPhone(canonicalPhone);
  const expectedBuf = Buffer.from(challenge.expectedPhoneHash, 'hex');
  const incomingBuf = Buffer.from(phoneHash, 'hex');
  if (expectedBuf.length !== incomingBuf.length || !crypto.timingSafeEqual(expectedBuf, incomingBuf)) {
    return { success: false, reason: 'sender_mismatch' };
  }
  
  return { success: true, challengeRef: doc.ref };
}

export function consumeSignupChallengeInTransaction(transaction: any, challengeRef: any, uid: string) {
  transaction.update(challengeRef, {
    status: 'consumed',
    consumedAt: Date.now(),
    consumedBy: uid
  });
}
