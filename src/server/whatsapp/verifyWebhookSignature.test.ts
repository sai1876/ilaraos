import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaWebhookSignature } from './verifyWebhookSignature';

describe('verifyMetaWebhookSignature', () => {
  const secret = 'test-app-secret';
  const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');

  it('accepts a valid X-Hub-Signature-256', () => {
    const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyMetaWebhookSignature(body, `sha256=${digest}`, secret)).toEqual({ ok: true });
  });

  it('rejects a missing signature', () => {
    expect(verifyMetaWebhookSignature(body, null, secret)).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects a malformed signature', () => {
    expect(verifyMetaWebhookSignature(body, 'sha1=abc', secret)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a mismatched signature', () => {
    expect(
      verifyMetaWebhookSignature(body, `sha256=${'0'.repeat(64)}`, secret),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('fails closed when the app secret is not configured', () => {
    expect(verifyMetaWebhookSignature(body, null, undefined)).toEqual({
      ok: false,
      reason: 'not_configured',
    });
  });
});
