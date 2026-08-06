import { createHash } from 'node:crypto';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

type RefundScope = 'full_order' | 'items' | 'custom_amount';

export interface ProcessRefundParams {
  refund_scope: RefundScope;
  refund_amount?: number;
  reason: string;
  method: string;
  requestItems?: {
    item_id: string;
    quantity_refunded: number;
    refund_amount?: number;
  }[];
  uid: string;
  idempotencyKey: string;
  actorRole: string;
  actorOutletId?: string;
}

export interface RefundResultPayload {
  refundId: string;
  canonicalRefundAmount: number;
  nextRefundStatus: 'partial' | 'full';
  newRefundedAmount: number;
  itemCount: number;
  outlet_id: string;
  replayed: boolean;
}

export class RefundCommandError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

const toPaise = (value: unknown, field: string): number => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RefundCommandError(400, `${field} is invalid`);
  }
  return Math.round(amount * 100);
};

const toRupees = (paise: number): number => paise / 100;

const storedPaise = (
  source: Record<string, unknown>,
  rupeeField: string,
  paiseField: string,
  label: string,
): number | null => {
  try {
    return readCanonicalMoneyPaise(source, rupeeField, paiseField);
  } catch {
    throw new RefundCommandError(409, `${label} requires reconciliation`);
  }
};

const stableHash = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const allocatePaise = (totalPaise: number, weights: number[]): number[] => {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return totalPaise - allocated;
    const share = Math.floor((totalPaise * Math.max(0, weight)) / totalWeight);
    allocated += share;
    return share;
  });
};

const orderItemId = (item: Record<string, unknown>): string => String(item.item_id || item.id || '');

export const processRefundTransaction = async (
  transaction: FirebaseFirestore.Transaction,
  orderRef: FirebaseFirestore.DocumentReference,
  params: ProcessRefundParams,
): Promise<RefundResultPayload> => {
  const actualMethod = params.method || 'manual';
  const normalizedItems = [...(params.requestItems || [])]
    .map(item => ({
      item_id: item.item_id,
      quantity_refunded: item.quantity_refunded,
      ...(item.refund_amount !== undefined ? { refund_amount: item.refund_amount } : {}),
    }))
    .sort((left, right) => left.item_id.localeCompare(right.item_id));
  const commandFingerprint = stableHash({
    refund_scope: params.refund_scope,
    refund_amount: params.refund_amount,
    reason: params.reason.trim(),
    method: actualMethod,
    requestItems: normalizedItems,
    uid: params.uid,
  });
  const refundId = stableHash(`${orderRef.id}:${params.idempotencyKey}`).slice(0, 40);
  const refundLedgerRef = orderRef.collection('refunds').doc(refundId);

  const [orderSnap, existingRefundSnap] = await Promise.all([
    transaction.get(orderRef),
    transaction.get(refundLedgerRef),
  ]);
  if (!orderSnap.exists) throw new RefundCommandError(404, 'Order not found');

  if (existingRefundSnap.exists) {
    const existing = existingRefundSnap.data()!;
    if (existing.command_fingerprint !== commandFingerprint) {
      throw new RefundCommandError(409, 'Idempotency key was already used for another refund');
    }
    const existingRefundPaise = storedPaise(existing, 'refund_amount', 'refund_amount_paise', 'Refund amount') || 0;
    const existingOrderRefundedPaise = storedPaise(
      existing,
      'order_refunded_amount',
      'order_refunded_amount_paise',
      'Order refund amount',
    ) || 0;
    return {
      refundId,
      canonicalRefundAmount: toRupees(existingRefundPaise),
      nextRefundStatus: existing.order_refund_status === 'full' ? 'full' : 'partial',
      newRefundedAmount: toRupees(existingOrderRefundedPaise),
      itemCount: Array.isArray(existing.items_refunded) ? existing.items_refunded.length : 0,
      outlet_id: String(existing.outlet_id || ''),
      replayed: true,
    };
  }

  const orderData = orderSnap.data()!;
  const outletId = String(orderData.outlet_id || orderData.outlet || '');
  if (!['admin', 'owner'].includes(params.actorRole)
      && (!params.actorOutletId || params.actorOutletId !== outletId)) {
    throw new RefundCommandError(403, 'Forbidden for this outlet');
  }

  const storedOrderTotalPaise = storedPaise(orderData, 'gross_amount', 'gross_amount_paise', 'Order total');
  const orderTotalPaise = storedOrderTotalPaise ?? toPaise(
    orderData.total_amount_after_points ?? orderData.total_amount ?? 0,
    'Order total',
  );
  if (orderTotalPaise <= 0) {
    throw new RefundCommandError(400, 'Refundable amount unavailable for this order');
  }
  const isPaid = orderData.is_paid === true
    || orderData.payment_status === 'paid'
    || toPaise(orderData.cash_paid || 0, 'Cash paid') > 0;
  if (!isPaid) throw new RefundCommandError(400, 'Cannot refund an unpaid order');

  const currentRefundedPaise = storedPaise(
    orderData,
    'refunded_amount',
    'refunded_amount_paise',
    'Refunded amount',
  ) || 0;
  const remainingOrderPaise = orderTotalPaise - currentRefundedPaise;
  if (remainingOrderPaise <= 0 || orderData.refund_status === 'full') {
    throw new RefundCommandError(409, 'Order is already fully refunded');
  }

  const orderItems: Record<string, unknown>[] = Array.isArray(orderData.items)
    ? orderData.items.map((item: Record<string, unknown>) => ({ ...item }))
    : [];
  const updatedItems = orderItems.map(item => ({ ...item }));
  const itemsForLedger: Record<string, unknown>[] = [];
  let canonicalRefundPaise = 0;

  if (params.refund_scope === 'items') {
    if (normalizedItems.length === 0) {
      throw new RefundCommandError(400, 'At least one item is required');
    }
    if (new Set(normalizedItems.map(item => item.item_id)).size !== normalizedItems.length) {
      throw new RefundCommandError(400, 'Duplicate item IDs are not allowed');
    }

    for (const requestItem of normalizedItems) {
      if (!Number.isSafeInteger(requestItem.quantity_refunded) || requestItem.quantity_refunded <= 0) {
        throw new RefundCommandError(400, 'Refund quantity must be a positive integer');
      }
      const itemIndex = updatedItems.findIndex(item => orderItemId(item) === requestItem.item_id);
      if (itemIndex < 0) throw new RefundCommandError(400, `Item ${requestItem.item_id} was not found in the order`);
      const storedItem = updatedItems[itemIndex];
      const quantity = Number(storedItem.quantity || 0);
      const refundedQuantity = Number(storedItem.refunded_quantity || 0);
      const remainingQuantity = quantity - refundedQuantity;
      if (requestItem.quantity_refunded > remainingQuantity) {
        throw new RefundCommandError(400, `Refund quantity for item ${requestItem.item_id} exceeds the remaining quantity`);
      }
      const unitPricePaise = storedPaise(storedItem, 'unit_price', 'unit_price_paise', 'Item price') || 0;
      if (unitPricePaise <= 0) throw new RefundCommandError(400, 'Order item price is invalid');
      const itemRefundPaise = unitPricePaise * requestItem.quantity_refunded;
      if (requestItem.refund_amount !== undefined
          && toPaise(requestItem.refund_amount, 'Item refund amount') !== itemRefundPaise) {
        throw new RefundCommandError(400, 'Item refund amount does not match the stored order price');
      }
      canonicalRefundPaise += itemRefundPaise;
      const previousItemRefundPaise = storedPaise(
        storedItem,
        'refunded_amount',
        'refunded_amount_paise',
        'Item refunded amount',
      ) || 0;
      updatedItems[itemIndex] = {
        ...storedItem,
        refunded_quantity: refundedQuantity + requestItem.quantity_refunded,
        refunded_amount: toRupees(previousItemRefundPaise + itemRefundPaise),
        refunded_amount_paise: previousItemRefundPaise + itemRefundPaise,
      };
      itemsForLedger.push({
        item_id: orderItemId(storedItem),
        ...(storedItem.menu_item_id ? { menu_item_id: storedItem.menu_item_id } : {}),
        quantity_refunded: requestItem.quantity_refunded,
        refund_amount: toRupees(itemRefundPaise),
        refund_amount_paise: itemRefundPaise,
      });
    }
  } else if (params.refund_scope === 'full_order') {
    canonicalRefundPaise = remainingOrderPaise;
    const refundableItems = updatedItems
      .map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const refundedQuantity = Number(item.refunded_quantity || 0);
        const remainingQuantity = Math.max(0, quantity - refundedQuantity);
        const linePaise = (storedPaise(item, 'unit_price', 'unit_price_paise', 'Item price') || 0)
          * remainingQuantity;
        return { item, index, quantity, remainingQuantity, linePaise };
      })
      .filter(item => item.remainingQuantity > 0);
    const allocations = allocatePaise(canonicalRefundPaise, refundableItems.map(item => item.linePaise));
    refundableItems.forEach((entry, allocationIndex) => {
      const previousItemRefundPaise = storedPaise(
        entry.item,
        'refunded_amount',
        'refunded_amount_paise',
        'Item refunded amount',
      ) || 0;
      updatedItems[entry.index] = {
        ...entry.item,
        refunded_quantity: entry.quantity,
        refunded_amount: toRupees(previousItemRefundPaise + allocations[allocationIndex]),
        refunded_amount_paise: previousItemRefundPaise + allocations[allocationIndex],
      };
      itemsForLedger.push({
        item_id: orderItemId(entry.item),
        ...(entry.item.menu_item_id ? { menu_item_id: entry.item.menu_item_id } : {}),
        quantity_refunded: entry.remainingQuantity,
        refund_amount: toRupees(allocations[allocationIndex]),
        refund_amount_paise: allocations[allocationIndex],
      });
    });
  } else {
    if (params.refund_amount === undefined) {
      throw new RefundCommandError(400, 'Refund amount is required');
    }
    canonicalRefundPaise = toPaise(params.refund_amount, 'Refund amount');
  }

  if (canonicalRefundPaise <= 0) throw new RefundCommandError(400, 'Refund amount must be positive');
  if (canonicalRefundPaise > remainingOrderPaise) {
    throw new RefundCommandError(400, 'Refund amount exceeds the remaining order total');
  }
  if (params.refund_scope !== 'custom_amount' && params.refund_amount !== undefined
      && toPaise(params.refund_amount, 'Refund amount') !== canonicalRefundPaise) {
    throw new RefundCommandError(400, 'Refund amount does not match the canonical server amount');
  }

  const newRefundedPaise = currentRefundedPaise + canonicalRefundPaise;
  const nextRefundStatus: 'partial' | 'full' = newRefundedPaise === orderTotalPaise ? 'full' : 'partial';
  const paidRefundPaise = storedPaise(
    orderData,
    'refund_paid_amount',
    'refund_paid_amount_paise',
    'Paid refund amount',
  ) || 0;
  const now = Date.now();
  const canonicalRefundAmount = toRupees(canonicalRefundPaise);
  const newRefundedAmount = toRupees(newRefundedPaise);

  transaction.create(refundLedgerRef, {
    refund_id: refundId,
    outlet_id: outletId,
    refund_scope: params.refund_scope,
    refund_amount: canonicalRefundAmount,
    refund_amount_paise: canonicalRefundPaise,
    refund_method: actualMethod,
    reason: params.reason.trim(),
    refunded_by: params.uid,
    refunded_at: now,
    refund_status: 'payment_pending',
    payment_status: 'pending',
    command_fingerprint: commandFingerprint,
    order_refund_status: nextRefundStatus,
    order_refunded_amount: newRefundedAmount,
    order_refunded_amount_paise: newRefundedPaise,
    ...(itemsForLedger.length > 0 ? { items_refunded: itemsForLedger } : {}),
  });
  transaction.update(orderRef, {
    refund_status: nextRefundStatus,
    refund_payment_status: paidRefundPaise > 0 ? 'partial_pending' : 'pending',
    refund_approved_amount: newRefundedAmount,
    refund_approved_amount_paise: newRefundedPaise,
    refunded_amount: newRefundedAmount,
    refunded_amount_paise: newRefundedPaise,
    refunded_at: now,
    refunded_by: params.uid,
    refund_reason: params.reason.trim(),
    refund_method: actualMethod,
    items: updatedItems,
    updated_at: now,
  });

  return {
    refundId,
    canonicalRefundAmount,
    nextRefundStatus,
    newRefundedAmount,
    itemCount: itemsForLedger.length,
    outlet_id: outletId,
    replayed: false,
  };
};
