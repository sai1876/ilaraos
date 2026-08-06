import { beforeEach, describe, expect, it } from 'vitest';
import {
  rateLimitDurable,
  resetRateLimitStateForTests,
} from '@/lib/rateLimit';

describe('durable rate limiter safety behavior', () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
  });

  it('allows requests within the window limit', async () => {
    const first = await rateLimitDurable('fixture-account', 2, 60_000);
    const second = await rateLimitDurable('fixture-account', 2, 60_000);
    const third = await rateLimitDurable('fixture-account', 2, 60_000);

    expect(first).toMatchObject({ success: true, remaining: 1, source: 'memory' });
    expect(second).toMatchObject({ success: true, remaining: 0, source: 'memory' });
    expect(third).toMatchObject({ success: false, remaining: 0, source: 'memory' });
  });

  it('resets the window for a different identifier', async () => {
    const r1 = await rateLimitDurable('account-A', 1, 60_000);
    const r2 = await rateLimitDurable('account-B', 1, 60_000);

    expect(r1).toMatchObject({ success: true, source: 'memory' });
    expect(r2).toMatchObject({ success: true, source: 'memory' });
  });

  it('returns retryAfterMs > 0 when limit exceeded', async () => {
    await rateLimitDurable('account-C', 1, 60_000);
    const blocked = await rateLimitDurable('account-C', 1, 60_000);

    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
