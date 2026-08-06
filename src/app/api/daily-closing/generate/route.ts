import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { getBusinessWindow } from '@/lib/businessDate';
import { rateLimitDurable } from '@/lib/rateLimit';
import type { DailyClosingDocument } from '@/lib/types';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

const exactRoles = new Set(['manager', 'admin', 'owner']);
const schema = z.object({
  outlet_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  owner_override: z.boolean().optional().default(false),
}).strict();

class ClosingError extends Error {
  constructor(public status: number, public publicMessage: string, public requiresOverride = false) {
    super(publicMessage);
  }
}

const storedPaise = (source: Record<string, unknown>, rupeeField: string, paiseField: string): number => {
  try {
    return readCanonicalMoneyPaise(source, rupeeField, paiseField) || 0;
  } catch {
    throw new ClosingError(409, 'Financial data requires reconciliation before closing');
  }
};
const rupees = (value: number): number => value / 100;
const sourceHash = (sources: Record<string, unknown>): string => createHash('sha256')
  .update(JSON.stringify(sources))
  .digest('hex');

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    if (parsed.data.owner_override && actor.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only owner can override the prior-day lock' }, { status: 403 });
    }
    const outletId = actor.role === 'manager' ? actor.outletId : parsed.data.outlet_id;
    if (!outletId) {
      return NextResponse.json({ success: false, error: 'Outlet assignment required — ask admin to set outlet_id on your staff record' }, { status: 400 });
    }
    if (actor.role === 'manager' && parsed.data.outlet_id && parsed.data.outlet_id !== actor.outletId) {
      return NextResponse.json({ success: false, error: 'Forbidden for this outlet' }, { status: 403 });
    }
    const limit = await rateLimitDurable(`daily-closing-generate:${actor.uid}:${outletId}`, 10, 15 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }

    const { business_date: businessDate, owner_override: ownerOverride } = parsed.data;
    const window = getBusinessWindow(businessDate);
    if (!Number.isFinite(window.start_at) || !Number.isFinite(window.end_at)) {
      return NextResponse.json({ success: false, error: 'Invalid business date' }, { status: 400 });
    }
    const db = adminDb;
    const closingId = `daily_closing_${outletId}_${businessDate}`;
    const closingRef = db.collection('daily_closings').doc(closingId);
    const outletRef = db.collection('outlets').doc(outletId);
    const previousQuery = db.collection('daily_closings')
      .where('outlet_id', '==', outletId);
    const ordersQuery = db.collection('orders')
      .where('created_at', '>=', window.start_at)
      .where('created_at', '<', window.end_at);
    const paymentsQuery = db.collection('payment_ledger')
      .where('captured_at', '>=', window.start_at)
      .where('captured_at', '<', window.end_at);
    const ordersUpdatedQuery = db.collection('orders')
      .where('updated_at', '>=', window.start_at)
      .where('updated_at', '<', window.end_at);
    const refundRequestsQuery = db.collection('refund_requests')
      .where('created_at', '>=', window.start_at)
      .where('created_at', '<', window.end_at);
    const wastageQuery = db.collection('wastage_events')
      .where('created_at', '>=', window.start_at)
      .where('created_at', '<', window.end_at);
    const movementsQuery = db.collection('stock_movements')
      .where('created_at', '>=', window.start_at)
      .where('created_at', '<', window.end_at);

    // 1. Fetch range-only queries outside the transaction to avoid composite index requirements
    const [
      ordersSnapshot, paymentsSnapshot, ordersUpdatedSnapshot,
      refundRequestsSnapshot, wastageSnapshot, movementsSnapshot,
    ] = await Promise.all([
      ordersQuery.get(),
      paymentsQuery.get(),
      ordersUpdatedQuery.get(),
      refundRequestsQuery.get(),
      wastageQuery.get(),
      movementsQuery.get(),
    ]);

    // 2. Fetch refund subcollections for updated orders
    const refundsPromises = ordersUpdatedSnapshot.docs.map(doc => doc.ref.collection('refunds').get());
    const refundsSnapshots = await Promise.all(refundsPromises);
    const allRefundDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    refundsSnapshots.forEach(snap => {
      snap.docs.forEach(doc => allRefundDocs.push(doc));
    });

    // 3. Filter arrays in memory by outletId
    const filteredOrders = ordersSnapshot.docs.filter(d => d.data().outlet_id === outletId);
    const filteredPayments = paymentsSnapshot.docs.filter(d => d.data().outlet_id === outletId);
    const filteredRefundPayments = allRefundDocs.filter(
      d => d.data().outlet_id === outletId && d.data().paid_at >= window.start_at && d.data().paid_at < window.end_at
    );
    const filteredRefundRequests = refundRequestsSnapshot.docs.filter(d => d.data().outlet_id === outletId);
    const filteredWastage = wastageSnapshot.docs.filter(d => d.data().outlet_id === outletId);
    const filteredMovements = movementsSnapshot.docs.filter(d => d.data().outlet_id === outletId);

    // 4. Wrap in mock objects matching QuerySnapshot shape for the transaction body
    const ordersMock = { docs: filteredOrders, size: filteredOrders.length };
    const paymentsMock = { docs: filteredPayments, size: filteredPayments.length };
    const refundPaymentsMock = { docs: filteredRefundPayments, size: filteredRefundPayments.length };
    const refundRequestsMock = { docs: filteredRefundRequests, size: filteredRefundRequests.length };
    const wastageMock = { docs: filteredWastage, size: filteredWastage.length };
    const movementsMock = { docs: filteredMovements, size: filteredMovements.length };

    const result = await db.runTransaction(async transaction => {
      const [
        outletSnapshot, closingSnapshot, previousSnapshot,
      ] = await Promise.all([
        transaction.get(outletRef),
        transaction.get(closingRef),
        transaction.get(previousQuery),
      ]);
      if (!outletSnapshot.exists || outletSnapshot.data()?.status !== 'active') {
        throw new ClosingError(409, 'Outlet is unavailable');
      }

      // Filter previous closings in-memory
      const previousDocsFiltered = previousSnapshot.docs
        .filter(d => d.data().business_date < businessDate)
        .sort((a, b) => b.data().business_date.localeCompare(a.data().business_date));
      const previousFiltered = {
        docs: previousDocsFiltered,
        empty: previousDocsFiltered.length === 0,
      };

      if (!previousFiltered.empty && previousFiltered.docs[0].data().status === 'submitted' && !ownerOverride) {
        throw new ClosingError(403, 'Previous day is submitted but not locked', true);
      }
      const existing = closingSnapshot.exists ? closingSnapshot.data()! : null;
      if (existing && !['draft', 'rejected'].includes(String(existing.status))) {
        throw new ClosingError(409, 'Submitted or locked closings cannot be regenerated');
      }

      let grossPaise = 0;
      let netPaise = 0;
      let discountPaise = 0;
      let unpaidPaise = 0;
      let completedCount = 0;
      let cancelledCount = 0;
      ordersMock.docs.forEach(document => {
        const order = document.data();
        if (['completed', 'delivered'].includes(String(order.status))) {
          completedCount += 1;
          const orderNet = storedPaise(order, 'gross_amount', 'gross_amount_paise');
          const orderDiscount = storedPaise(order, 'promo_discount', 'promo_discount_paise')
            + Math.max(0, Number(order.points_redeemed || 0)) * 100;
          netPaise += orderNet;
          discountPaise += orderDiscount;
          grossPaise += orderNet + orderDiscount;
          if (!(order.is_paid === true || order.payment_status === 'paid')) unpaidPaise += orderNet;
        } else if (['cancelled', 'rejected'].includes(String(order.status))) {
          cancelledCount += 1;
        }
      });

      const tenderPaise = { cash: 0, upi: 0, card: 0, wallet: 0 };
      paymentsMock.docs.forEach(document => {
        const payment = document.data();
        if (payment.status !== 'captured') return;
        const method = String(payment.payment_method) as keyof typeof tenderPaise;
        if (method in tenderPaise) tenderPaise[method] += storedPaise(payment, 'amount', 'amount_paise');
      });

      let refundPaidPaise = 0;
      refundPaymentsMock.docs.forEach(document => {
        const refund = document.data();
        if (refund.payment_status === 'paid') {
          refundPaidPaise += storedPaise(refund, 'refund_amount', 'refund_amount_paise');
        }
      });
      let approvedRefunds = 0;
      let pendingRefunds = 0;
      refundRequestsMock.docs.forEach(document => {
        const refund = document.data();
        if (refund.status === 'approved') approvedRefunds += 1;
        if (refund.status === 'approved' && refund.payment_status !== 'paid') pendingRefunds += 1;
      });

      let approvedWastage = 0;
      let remakeCount = 0;
      let wastageCostPaise = 0;
      wastageMock.docs.forEach(document => {
        const wastage = document.data();
        if (wastage.status === 'approved') approvedWastage += 1;
        if (wastage.event_type === 'remake') remakeCount += 1;
        if (Array.isArray(wastage.items)) {
          wastage.items.forEach((item: Record<string, unknown>) => {
            wastageCostPaise += Math.round(
              storedPaise(item, 'unit_cost_estimate', 'unit_cost_estimate_paise')
              * Number(item.quantity || 0),
            );
          });
        }
      });
      let manualAdjustments = 0;
      movementsMock.docs.forEach(document => {
        const movement = document.data();
        if (movement.movement_type === 'manual_adjustment') manualAdjustments += 1;
      });

      const sources = {
        orders: ordersMock.docs.map(document => [document.id, document.data().updated_at || document.data().created_at]),
        payments: paymentsMock.docs.map(document => [document.id, document.data().captured_at]),
        refund_payments: refundPaymentsMock.docs.map(document => [document.ref.path, document.data().paid_at]),
        refund_requests: refundRequestsMock.docs.map(document => [document.id, document.data().updated_at]),
        wastage: wastageMock.docs.map(document => [document.id, document.data().updated_at]),
        movements: movementsMock.docs.map(document => [document.id, document.data().created_at]),
      };
      const now = Date.now();
      const expectedCash = rupees(tenderPaise.cash);
      const expectedUpi = rupees(tenderPaise.upi);
      const openingCashPaise = existing
        ? storedPaise({
            opening_cash: existing.cash_reconciliation?.opening_cash,
            opening_cash_paise: existing.money_paise?.opening_cash,
          }, 'opening_cash', 'opening_cash_paise')
        : 0;
      const countedCashPaise = existing
        ? storedPaise({
            counted_cash: existing.cash_reconciliation?.counted_cash,
            counted_cash_paise: existing.money_paise?.counted_cash,
          }, 'counted_cash', 'counted_cash_paise')
        : 0;
      const verifiedUpiPaise = existing
        ? storedPaise({
            verified_upi: existing.payment_reconciliation?.verified_upi,
            verified_upi_paise: existing.money_paise?.verified_upi,
          }, 'verified_upi', 'verified_upi_paise')
        : 0;
      const countedCash = rupees(countedCashPaise);
      const verifiedUpi = rupees(verifiedUpiPaise);
      const closing: DailyClosingDocument = {
        closing_id: closingId,
        outlet_id: outletId,
        business_date: businessDate,
        business_window: window,
        status: existing?.status === 'rejected' ? 'rejected' : 'draft',
        sales_summary: {
          gross_sales: rupees(grossPaise),
          net_sales: rupees(netPaise),
          order_count: ordersMock.size,
          completed_order_count: completedCount,
          cancelled_order_count: cancelledCount,
          refunded_amount: rupees(refundPaidPaise),
          discount_amount: rupees(discountPaise),
          cash_sales: expectedCash,
          upi_sales: expectedUpi,
          wallet_sales: rupees(tenderPaise.wallet),
          card_sales: rupees(tenderPaise.card),
          unpaid_amount: rupees(unpaidPaise),
        },
        cash_reconciliation: {
          opening_cash: rupees(openingCashPaise),
          expected_cash: expectedCash,
          counted_cash: countedCash,
          cash_difference: countedCash - expectedCash,
          ...(existing?.cash_reconciliation?.manager_cash_note
            ? { manager_cash_note: existing.cash_reconciliation.manager_cash_note }
            : {}),
          cash_proof_photo_urls: existing?.cash_reconciliation?.cash_proof_photo_urls || [],
        },
        payment_reconciliation: {
          expected_upi: expectedUpi,
          verified_upi: verifiedUpi,
          upi_difference: verifiedUpi - expectedUpi,
          payment_proof_refs: existing?.payment_reconciliation?.payment_proof_refs || [],
          ...(existing?.payment_reconciliation?.manager_payment_note
            ? { manager_payment_note: existing.payment_reconciliation.manager_payment_note }
            : {}),
        },
        refund_summary: {
          refund_requests_count: refundRequestsMock.size,
          approved_refunds_count: approvedRefunds,
          paid_refunds_count: refundPaymentsMock.size,
          pending_refund_payments: pendingRefunds,
          refund_amount_paid_today: rupees(refundPaidPaise),
        },
        wastage_summary: {
          wastage_events_count: wastageMock.size,
          approved_wastage_count: approvedWastage,
          estimated_wastage_cost: rupees(wastageCostPaise),
          remake_count: remakeCount,
          stock_movements_count: movementsMock.size,
        },
        inventory_summary: {
          stock_movements_today: movementsMock.size,
          negative_stock_alerts: 0,
          low_stock_alerts: 0,
          manual_adjustments_count: manualAdjustments,
        },
        money_paise: {
          gross_sales: grossPaise,
          net_sales: netPaise,
          discount_amount: discountPaise,
          unpaid_amount: unpaidPaise,
          cash_captured: tenderPaise.cash,
          upi_captured: tenderPaise.upi,
          card_captured: tenderPaise.card,
          wallet_captured: tenderPaise.wallet,
          refunds_paid: refundPaidPaise,
          estimated_wastage_cost: wastageCostPaise,
          opening_cash: openingCashPaise,
          expected_cash: tenderPaise.cash,
          counted_cash: countedCashPaise,
          cash_difference: countedCashPaise - tenderPaise.cash,
          expected_upi: tenderPaise.upi,
          verified_upi: verifiedUpiPaise,
          upi_difference: verifiedUpiPaise - tenderPaise.upi,
        },
        source_hash: sourceHash(sources),
        source_counts: {
          orders: ordersMock.size,
          payments: paymentsMock.size,
          refund_payments: refundPaymentsMock.size,
          refund_requests: refundRequestsMock.size,
          wastage: wastageMock.size,
          movements: movementsMock.size,
        },
        opened_at: existing?.opened_at || now,
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      transaction.set(closingRef, closing, { merge: false });
      return { closing, created: !closingSnapshot.exists };
    });

    await logBusinessEvent({
      event_type: 'daily_closing_generated',
      actor_type: actor.role as ActorType,
      actor_id: actor.uid,
      target_type: 'daily_closing',
      target_id: closingId,
      outlet_id: outletId,
      severity: ownerOverride ? 'warning' : 'info',
      source: 'admin_panel',
      metadata: { business_date: businessDate, owner_override: ownerOverride, source_hash: result.closing.source_hash },
    });
    return NextResponse.json({ success: true, closing: result.closing }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof ClosingError) {
      return NextResponse.json(
        { success: false, error: error.publicMessage, ...(error.requiresOverride ? { requires_override: true } : {}) },
        { status: error.status },
      );
    }
    console.error('[DAILY CLOSING GENERATE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
