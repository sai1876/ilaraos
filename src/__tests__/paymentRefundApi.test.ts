import { describe, expect, it, vi } from 'vitest';
import {
  processRefundTransaction,
  RefundCommandError,
  type ProcessRefundParams,
} from '@/server/refunds/processRefund';

function harness(order: Record<string, unknown>, existingRefund?: Record<string, unknown>) {
  const refundRef = { id: 'refund', kind: 'refund' };
  const orderRef = {
    id: 'order-1',
    kind: 'order',
    collection: () => ({ doc: () => refundRef }),
  } as any;
  const created: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const transaction = {
    get: vi.fn(async (ref: any) => ref.kind === 'order'
      ? { exists: true, data: () => order }
      : { exists: Boolean(existingRefund), data: () => existingRefund }),
    create: vi.fn((_ref: unknown, data: Record<string, unknown>) => created.push(data)),
    update: vi.fn((_ref: unknown, data: Record<string, unknown>) => updates.push(data)),
  } as any;
  return { orderRef, transaction, created, updates };
}

const baseOrder = {
  gross_amount: 100,
  is_paid: true,
  refunded_amount: 0,
  refund_status: 'none',
  outlet_id: 'outlet-a',
  items: [
    { item_id: 'i1', menu_item_id: 'm1', unit_price: 60, quantity: 1 },
    { item_id: 'i2', menu_item_id: 'm2', unit_price: 20, quantity: 2 },
  ],
};

const command = (overrides: Partial<ProcessRefundParams> = {}): ProcessRefundParams => ({
  refund_scope: 'full_order',
  refund_amount: 100,
  reason: 'Customer complaint',
  method: 'manual',
  uid: 'manager-1',
  idempotencyKey: '9e8f3154-b241-4ee3-b040-8932daf3c759',
  actorRole: 'manager',
  actorOutletId: 'outlet-a',
  ...overrides,
});

describe('canonical refund transaction', () => {
  it('derives a full refund and item allocations from the stored order', async () => {
    const test = harness(baseOrder);
    const result = await processRefundTransaction(test.transaction, test.orderRef, command());

    expect(result.canonicalRefundAmount).toBe(100);
    expect(result.nextRefundStatus).toBe('full');
    expect(test.created[0]).toMatchObject({
      refund_amount: 100,
      payment_status: 'pending',
      items_refunded: [
        expect.objectContaining({ item_id: 'i1', refund_amount: 60 }),
        expect.objectContaining({ item_id: 'i2', refund_amount: 40 }),
      ],
    });
    expect(test.updates[0]).toMatchObject({ refunded_amount: 100, refund_status: 'full' });
  });

  it('rejects a small parent amount for a full-order refund', async () => {
    const test = harness(baseOrder);
    await expect(processRefundTransaction(
      test.transaction,
      test.orderRef,
      command({ refund_amount: 10 }),
    )).rejects.toMatchObject({
      status: 400,
      publicMessage: 'Refund amount does not match the canonical server amount',
    });
    expect(test.created).toHaveLength(0);
  });

  it('rejects a manipulated item amount', async () => {
    const test = harness(baseOrder);
    await expect(processRefundTransaction(test.transaction, test.orderRef, command({
      refund_scope: 'items',
      refund_amount: 1,
      requestItems: [{ item_id: 'i1', quantity_refunded: 1, refund_amount: 1 }],
    }))).rejects.toBeInstanceOf(RefundCommandError);
    expect(test.created).toHaveLength(0);
  });

  it('enforces the manager outlet boundary', async () => {
    const test = harness(baseOrder);
    await expect(processRefundTransaction(
      test.transaction,
      test.orderRef,
      command({ actorOutletId: 'outlet-b' }),
    )).rejects.toMatchObject({ status: 403 });
  });

  it('returns a replay for the same deterministic command without writing again', async () => {
    const first = harness(baseOrder);
    const firstResult = await processRefundTransaction(first.transaction, first.orderRef, command());
    const second = harness(baseOrder, first.created[0]);
    const replay = await processRefundTransaction(second.transaction, second.orderRef, command());

    expect(replay.refundId).toBe(firstResult.refundId);
    expect(replay.replayed).toBe(true);
    expect(second.created).toHaveLength(0);
    expect(second.updates).toHaveLength(0);
  });
});
