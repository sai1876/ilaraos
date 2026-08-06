import { describe, expect, it, vi } from 'vitest';
import { awardFulfillmentRewards } from '@/server/orders/awardFulfillmentRewards';

describe('fulfillment rewards', () => {
  it('awards deterministic first-tier points only at fulfillment', async () => {
    const userRef = { kind: 'user', id: 'customer-1' };
    const db = {
      collection: vi.fn((name: string) => ({
        doc: (id: string) => name === 'users' ? userRef : { kind: name, id },
        where: () => ({ limit: () => ({ kind: 'referrer-query' }) }),
      })),
    } as any;
    const creates: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const transaction = {
      get: vi.fn(async (ref: any) => ref.kind === 'user'
        ? { exists: true, data: () => ({ total_completed_orders: 0, points: 5 }) }
        : { docs: [] }),
      update: vi.fn((_ref: unknown, data: Record<string, unknown>) => updates.push(data)),
      create: vi.fn((_ref: unknown, data: Record<string, unknown>) => creates.push(data)),
    } as any;

    const result = await awardFulfillmentRewards(transaction, db, 'order-1', {
      user_id: 'customer-1', gross_amount: 100, points_awarded: false,
    });

    expect(result.pointsEarned).toBe(15);
    expect(result.orderUpdates).toMatchObject({ points_awarded: true, points_earned: 15 });
    expect(updates[0]).toMatchObject({ total_completed_orders: 1, points: 20 });
    expect(creates[0]).toMatchObject({
      order_id: 'order-1', amount: 15, source: 'order_completion',
    });
  });

  it('is a no-op after the order reward flag is committed', async () => {
    const transaction = { get: vi.fn(), update: vi.fn(), create: vi.fn() } as any;
    const result = await awardFulfillmentRewards(transaction, {} as any, 'order-1', {
      points_awarded: true, points_earned: 15,
    });
    expect(result.pointsEarned).toBe(15);
    expect(transaction.get).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });
});
