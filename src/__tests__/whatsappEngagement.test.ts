import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processProactiveEngagement } from '@/server/whatsapp/engagement/engagementScheduler';

const mocks = vi.hoisted(() => ({
  sendWhatsAppMessage: vi.fn(),
  updateConversationState: vi.fn(),
  usersGet: vi.fn(),
  stateGet: vi.fn(),
  ordersGet: vi.fn(),
}));

vi.mock('@/lib/voiceOrderingService', () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}));

vi.mock('@/server/whatsapp/chat/conversationMemory', () => ({
  updateConversationState: mocks.updateConversationState,
  getPhoneHash: vi.fn((p) => `hash-${p}`),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((col) => {
      if (col === 'users') {
        return {
          where: vi.fn().mockReturnThis(),
          get: mocks.usersGet
        };
      }
      if (col === 'whatsapp_conversation_state') {
        return {
          doc: vi.fn(() => ({
            get: mocks.stateGet
          }))
        };
      }
      if (col === 'orders') {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mocks.ordersGet
        };
      }
    })
  }
}));

describe('WhatsApp Proactive Engagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone-id');
    // Force current hour to 12 PM to bypass time check
    vi.useFakeTimers();
    const date = new Date();
    date.setHours(12);
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends engagement message to eligible users and updates state', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [{ id: 'user1', data: () => ({ phone: '919876543210' }) }]
    });
    
    // State: eligible
    mocks.stateGet.mockResolvedValue({
      exists: true,
      data: () => ({
        preferred_language: 'en',
        last_engagement_at: Date.now() - 48 * 60 * 60 * 1000, // 48 hrs ago
        last_user_message_at: Date.now() - 10 * 60 * 60 * 1000 // 10 hrs ago
      })
    });
    
    // Orders: completed only
    mocks.ordersGet.mockResolvedValue({
      docs: [{ data: () => ({ status: 'completed' }) }]
    });

    const res = await processProactiveEngagement();
    expect(res.success).toBe(true);
    expect(res.engagedCount).toBe(1);
    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith('test-phone-id', '919876543210', expect.stringContaining('suggest'));
    expect(mocks.updateConversationState).toHaveBeenCalled();
  });

  it('skips users who opted out', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [{ id: 'user1', data: () => ({ phone: '919876543210' }) }]
    });
    
    mocks.stateGet.mockResolvedValue({
      exists: true,
      data: () => ({
        engagement_opt_out: true,
        last_engagement_at: 0
      })
    });

    const res = await processProactiveEngagement();
    expect(res.engagedCount).toBe(0);
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('skips users with active orders', async () => {
    mocks.usersGet.mockResolvedValue({
      docs: [{ id: 'user1', data: () => ({ phone: '919876543210' }) }]
    });
    
    mocks.stateGet.mockResolvedValue({
      exists: true,
      data: () => ({ last_engagement_at: 0 })
    });
    
    mocks.ordersGet.mockResolvedValue({
      docs: [{ data: () => ({ status: 'preparing' }) }] // active
    });

    const res = await processProactiveEngagement();
    expect(res.engagedCount).toBe(0);
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
