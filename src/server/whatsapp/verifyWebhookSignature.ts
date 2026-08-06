import crypto from 'node:crypto';

export type WebhookSignatureResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'missing' | 'malformed' | 'mismatch' };

const META_SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

/** Verify Meta's signature against the exact request bytes before JSON parsing. */
export function verifyMetaWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string | undefined,
): WebhookSignatureResult {
  if (!appSecret) return { ok: false, reason: 'not_configured' };
  if (!signatureHeader) return { ok: false, reason: 'missing' };

  const match = META_SIGNATURE_PATTERN.exec(signatureHeader.trim());
  if (!match) return { ok: false, reason: 'malformed' };

  const suppliedDigest = Buffer.from(match[1], 'hex');
  const expectedDigest = crypto.createHmac('sha256', appSecret).update(rawBody).digest();

  if (
    suppliedDigest.length !== expectedDigest.length ||
    !crypto.timingSafeEqual(suppliedDigest, expectedDigest)
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true };
}
