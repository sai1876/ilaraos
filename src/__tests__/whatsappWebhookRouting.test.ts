import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Mock dependencies before importing the route
const mocks = vi.hoisted(() => ({
  sendWhatsAppMessage: vi.fn(),
  updateConversationState: vi.fn(),
  findUserByPhone: vi.fn(),
  chatOrchestrator: { processMessage: vi.fn().mockResolvedValue({ reply: 'ok' }) },
}));

vi.mock('@/lib/voiceOrderingService', () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}));

vi.mock('@/server/whatsapp/chat/conversationMemory', () => ({
  updateConversationState: mocks.updateConversationState,
}));

vi.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: vi.fn(() => 'fixture-timestamp'),
    },
  },
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((colName) => ({
      doc: vi.fn(() => ({})),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(
        colName === 'users' 
          ? { empty: false, docs: [{ id: 'fixture-user', data: () => ({ account_status: 'active' }) }] }
          : { empty: true, docs: [] }
      )
    })),
    runTransaction: vi.fn(async (cb) => {
      return await cb({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn(),
        create: vi.fn(),
      });
    }),
  }
}));

vi.mock('@/server/whatsapp/chat/chatOrchestrator', () => ({
  chatOrchestrator: mocks.chatOrchestrator
}));

import { POST } from '@/app/api/webhook/whatsapp/route';

const APP_SECRET = 'fixture-meta-app-secret';
const PHONE_NUMBER_ID = 'fixture-phone-number-id';

function signedRequest(body: string): Request {
  const digest = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return new Request('http://localhost/api/webhook/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${digest}`
    },
    body,
  });
}

function buildMessagePayload(text: string) {
  return JSON.stringify({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: PHONE_NUMBER_ID },
          messages: [{
            id: 'fixture-message-id',
            from: '919876543210',
            type: 'text',
            text: { body: text }
          }]
        }
      }]
    }]
  });
}

describe('WhatsApp Webhook Routing (Auth & Language)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WHATSAPP_APP_SECRET', APP_SECRET);
    vi.stubEnv('WHATSAPP_BOT_NUMBER_ID', PHONE_NUMBER_ID);
  });

  describe('Language Preference Routing', () => {
    it('intercepts explicit language commands and updates state directly', async () => {
      const response = await POST(signedRequest(buildMessagePayload('Talk in English only')));
      const data = await response.json();
      if (response.status !== 200) console.log('DEBUG:', data);
      expect(response.status).toBe(200);

      expect(mocks.updateConversationState).toHaveBeenCalledWith('919876543210', expect.objectContaining({
        preferred_language: 'en',
        language_source: 'explicit'
      }));
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(PHONE_NUMBER_ID, '919876543210', expect.stringContaining('English'));
      expect(mocks.chatOrchestrator.processMessage).not.toHaveBeenCalled();
    });

    it('intercepts Hindi language commands', async () => {
      await POST(signedRequest(buildMessagePayload('Hindi mein bolo')));
      expect(mocks.updateConversationState).toHaveBeenCalledWith('919876543210', expect.objectContaining({
        preferred_language: 'hi'
      }));
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(PHONE_NUMBER_ID, '919876543210', expect.stringContaining('Hindi'));
    });
  });

  describe('Proactive Opt-Out Routing', () => {
    it('intercepts opt-out commands', async () => {
      await POST(signedRequest(buildMessagePayload('stop messages')));
      expect(mocks.updateConversationState).toHaveBeenCalledWith('919876543210', expect.objectContaining({
        engagement_opt_out: true
      }));
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(PHONE_NUMBER_ID, '919876543210', expect.stringContaining('Noted'));
      expect(mocks.chatOrchestrator.processMessage).not.toHaveBeenCalled();
    });
  });

  describe('Auth Routing (Strict Regex)', () => {
    it('accepts exact auth token without passing to chat', async () => {
      // It won't reach chatOrchestrator but will attempt processTextHandshakeInBackground (which we didn't mock, but it fails silently)
      const res = await POST(signedRequest(buildMessagePayload('LOGIN Ref: AAF7AF12')));
      expect(res.status).toBe(200);
      expect(mocks.chatOrchestrator.processMessage).not.toHaveBeenCalled();
    });

    it('passes normal messages to chat orchestrator instead of auth', async () => {
      // Normal message with "Ref" shouldn't trigger auth
      await POST(signedRequest(buildMessagePayload('Ref: my order 123 is late')));
      expect(mocks.chatOrchestrator.processMessage).toHaveBeenCalled();
    });
  });
});
