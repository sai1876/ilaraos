import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyMetaWebhookSignature } from '@/server/whatsapp/verifyWebhookSignature';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  runTransaction: vi.fn(),
  downloadMetaMedia: vi.fn(),
  transcribeAudio: vi.fn(),
  matchVoiceOrderToMenu: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  logBusinessEvent: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: mocks.collection,
    runTransaction: mocks.runTransaction,
  },
}));

vi.mock('@/lib/voiceOrderingService', () => ({
  downloadMetaMedia: mocks.downloadMetaMedia,
  transcribeAudio: mocks.transcribeAudio,
  matchVoiceOrderToMenu: mocks.matchVoiceOrderToMenu,
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}));

vi.mock('@/server/events/logBusinessEvent', () => ({
  logBusinessEvent: mocks.logBusinessEvent,
}));

vi.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: vi.fn(() => 'fixture-timestamp'),
    },
  },
}));

import { POST } from '@/app/api/webhook/whatsapp/route';

const APP_SECRET = 'fixture-meta-app-secret';
const PHONE_NUMBER_ID = 'fixture-phone-number-id';

function signedRequest(body: string, signature?: string): Request {
  const digest = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return new Request('http://localhost/api/webhook/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === undefined
        ? { 'x-hub-signature-256': `sha256=${digest}` }
        : signature
          ? { 'x-hub-signature-256': signature }
          : {}),
    },
    body,
  });
}

describe('Meta webhook signature verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WHATSAPP_APP_SECRET', APP_SECRET);
    vi.stubEnv('WHATSAPP_BOT_NUMBER_ID', PHONE_NUMBER_ID);
  });

  it('accepts a valid HMAC over the exact raw bytes', () => {
    const rawBody = Buffer.from('{"fixture":"byte-exact"}');
    const digest = crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

    expect(
      verifyMetaWebhookSignature(rawBody, `sha256=${digest}`, APP_SECRET),
    ).toEqual({ ok: true });
  });

  it.each([
    [null, 'missing'],
    ['sha256=not-hex', 'malformed'],
    [`sha256=${'0'.repeat(64)}`, 'mismatch'],
  ])('rejects invalid signature %s', (signature, reason) => {
    const result = verifyMetaWebhookSignature(
      Buffer.from('{"fixture":true}'),
      signature,
      APP_SECRET,
    );

    expect(result).toEqual({ ok: false, reason });
  });

  it('fails closed when the app secret is not configured', () => {
    expect(
      verifyMetaWebhookSignature(Buffer.from('{}'), null, undefined),
    ).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('rejects a missing signature before any database or outbound call', async () => {
    const response = await POST(signedRequest('{"entry":[]}', ''));

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mocks.logBusinessEvent).not.toHaveBeenCalled();
  });

  it('rejects a signature for different bytes before side effects', async () => {
    const wrongDigest = crypto.createHmac('sha256', APP_SECRET).update('different').digest('hex');
    const response = await POST(signedRequest('{"entry":[]}', `sha256=${wrongDigest}`));

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('rejects a signed payload for a different WhatsApp number before DB work', async () => {
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'wrong-number' } } }] }],
    });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(403);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('accepts a signed status notification for the configured number without DB work', async () => {
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_NUMBER_ID } } }] }],
    });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
