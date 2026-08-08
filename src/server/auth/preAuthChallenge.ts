import { createHmac, timingSafeEqual } from 'crypto';

export interface PreAuthPayload {
  uid: string;
  staffId: string;
  role: string;
  outletId: string;
  tokenVersion: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

const PREAUTH_COOKIE_NAME = '__staff_pre_auth';
const PREAUTH_TTL_MS = 2 * 60 * 1000; // 2 minutes max

function getHmacKey(): string {
  return process.env.STAFF_PREAUTH_HMAC_KEY || process.env.SESSION_SECRET || 'ilara_preauth_fallback_secret_key_2026';
}

/**
 * Creates a signed pre-auth challenge string for the staff TOTP verification stage.
 */
export function createPreAuthChallenge(data: {
  uid: string;
  staffId: string;
  role: string;
  outletId: string;
  tokenVersion?: number;
}): { cookieName: string; token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + PREAUTH_TTL_MS;
  const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const payload: PreAuthPayload = {
    uid: data.uid,
    staffId: data.staffId,
    role: data.role,
    outletId: data.outletId,
    tokenVersion: data.tokenVersion || 1,
    issuedAt: now,
    expiresAt,
    nonce,
  };

  const jsonStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(jsonStr).toString('base64url');
  
  const hmac = createHmac('sha256', getHmacKey());
  hmac.update(base64Payload);
  const signature = hmac.digest('base64url');

  const token = `${base64Payload}.${signature}`;

  return {
    cookieName: PREAUTH_COOKIE_NAME,
    token,
    expiresAt,
  };
}

/**
 * Verifies and parses a signed pre-auth challenge token.
 * Returns payload if valid & unexpired, otherwise null.
 */
export function verifyPreAuthChallenge(rawToken: string | undefined): PreAuthPayload | null {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const parts = rawToken.split('.');
  if (parts.length !== 2) return null;

  const [base64Payload, signature] = parts;

  // Re-compute signature
  const hmac = createHmac('sha256', getHmacKey());
  hmac.update(base64Payload);
  const expectedSignature = hmac.digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null; // Signature mismatch
  }

  try {
    const jsonStr = Buffer.from(base64Payload, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as PreAuthPayload;

    if (!payload || typeof payload.expiresAt !== 'number') return null;

    if (Date.now() > payload.expiresAt) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

export { PREAUTH_COOKIE_NAME, PREAUTH_TTL_MS };
