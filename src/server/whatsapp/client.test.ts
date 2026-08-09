import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMetaGraphUrl,
  sendWhatsAppMessage,
} from './client';

const originalEnv = { ...process.env };

describe('WhatsApp Meta client', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_BOT_NUMBER_ID = '123456789';
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v24.0';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('builds a configurable Graph API URL', () => {
    expect(getMetaGraphUrl('123/messages')).toBe(
      'https://graph.facebook.com/v24.0/123/messages',
    );
  });

  it('returns the outbound wamid when Meta accepts the send', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          contacts: [{ input: '919999999999', wa_id: '919999999999' }],
          messages: [{ id: 'wamid.TEST123' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await sendWhatsAppMessage(
      '123456789',
      '+91 99999 99999',
      'hello',
    );

    expect(result).toEqual({ ok: true, messageId: 'wamid.TEST123', status: 200 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v24.0/123456789/messages');
    expect(init?.method).toBe('POST');
    expect(String(init?.headers)).not.toContain('test-token');

    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919999999999',
      type: 'text',
      text: { preview_url: false, body: 'hello' },
    });
  });

  it('returns structured Meta API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Invalid OAuth access token.',
            type: 'OAuthException',
            code: 190,
            error_subcode: 463,
            fbtrace_id: 'TRACE123',
          },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await sendWhatsAppMessage('123456789', '919999999999', 'hello');

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: 190,
      subcode: 463,
      type: 'OAuthException',
      fbtraceId: 'TRACE123',
    });
  });

  it('does not report success when Meta omits the returned wamid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await sendWhatsAppMessage('123456789', '919999999999', 'hello');
    expect(result.ok).toBe(false);
  });

  it('returns a network failure instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await sendWhatsAppMessage('123456789', '919999999999', 'hello');
    expect(result).toMatchObject({ ok: false, status: 0, error: 'network down' });
  });

  it('rejects a webhook Phone Number ID that does not match configuration', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await sendWhatsAppMessage('987654321', '919999999999', 'hello');

    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails clearly when the access token is missing', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await sendWhatsAppMessage('123456789', '919999999999', 'hello');

    expect(result).toMatchObject({
      ok: false,
      status: 0,
      error: 'WHATSAPP_ACCESS_TOKEN is missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
