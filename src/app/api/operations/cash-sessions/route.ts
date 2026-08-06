// [INTERNAL] - Authenticated, outlet-scoped financial operations.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import {
  assertStaffInOutlet,
  moneyToPaise,
  OperationalAccessError,
  requireOperationalActor,
  resolveOperationalOutlet,
} from '@/server/operations/operationalAccess';

const cashCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open'),
    outlet_id: z.string().trim().min(1).max(128).optional(),
    opening_cash: z.number().finite().min(0).max(10_000_000),
    shift: z.enum(['morning', 'evening']),
    staff_id: z.string().trim().min(1).max(128),
  }),
  z.object({
    action: z.literal('close'),
    session_id: z.string().trim().min(1).max(128),
    closing_cash: z.number().finite().min(0).max(10_000_000),
    cash_note: z.string().trim().max(500).default(''),
  }),
]);

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof OperationalAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Cash operation failed' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireOperationalActor();
    const requestedOutlet = new URL(request.url).searchParams.get('outlet_id')?.trim() || undefined;
    const outletId = await resolveOperationalOutlet(adminDb, actor, requestedOutlet, { allowGlobalRead: true });
    let query: FirebaseFirestore.Query = adminDb.collection('cash_sessions');
    if (outletId) query = query.where('outlet_id', '==', outletId);
    const snapshot = await query.orderBy('opened_at', 'desc').limit(100).get();
    return NextResponse.json({
      sessions: snapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const parsed = cashCommandSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid cash-session command' }, { status: 400 });
    const actor = await requireOperationalActor();

    if (parsed.data.action === 'open') {
      const command = parsed.data;
      const outletId = await resolveOperationalOutlet(adminDb, actor, command.outlet_id);
      if (!outletId) throw new OperationalAccessError('A valid outlet is required', 400);
      await assertStaffInOutlet(adminDb, command.staff_id, outletId);
      const openingCashPaise = moneyToPaise(command.opening_cash);
      const sessionRef = adminDb.collection('cash_sessions').doc();
      const activeTillRef = adminDb.collection('active_cash_sessions').doc(`${outletId}_${command.shift}`);
      await adminDb.runTransaction(async transaction => {
        const [activeTill, legacyOpen] = await Promise.all([
          transaction.get(activeTillRef),
          transaction.get(adminDb!.collection('cash_sessions')
            .where('outlet_id', '==', outletId)
            .where('shift', '==', command.shift)
            .where('closing_cash', '==', null)
            .limit(1)),
        ]);
        if (activeTill.exists || !legacyOpen.empty) {
          throw new OperationalAccessError('This till shift is already open', 409);
        }
        const now = Date.now();
        transaction.create(sessionRef, {
          outlet_id: outletId,
          shift: command.shift,
          opening_cash: command.opening_cash,
          opening_cash_paise: openingCashPaise,
          staff_id: command.staff_id,
          opened_by: actor.uid,
          opened_at: now,
          closing_cash: null,
          closing_cash_paise: null,
          schema_version: 2,
          updated_at: now,
        });
        transaction.create(activeTillRef, {
          session_id: sessionRef.id,
          outlet_id: outletId,
          shift: command.shift,
          opened_at: now,
        });
      });
      return NextResponse.json({ success: true, session_id: sessionRef.id }, { status: 201 });
    }

    const command = parsed.data;
    const closingCashPaise = moneyToPaise(command.closing_cash);
    const sessionRef = adminDb.collection('cash_sessions').doc(command.session_id);
    const currentSession = await sessionRef.get();
    if (!currentSession.exists) throw new OperationalAccessError('Cash session not found', 404);
    const authorizedOutletId = await resolveOperationalOutlet(
      adminDb,
      actor,
      String(currentSession.data()?.outlet_id || ''),
    );
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(sessionRef);
      if (!snapshot.exists) throw new OperationalAccessError('Cash session not found', 404);
      const data = snapshot.data()!;
      if (!authorizedOutletId || data.outlet_id !== authorizedOutletId) {
        throw new OperationalAccessError('Outlet scope mismatch', 403);
      }
      if (data.closing_cash !== null && data.closing_cash !== undefined) {
        throw new OperationalAccessError('Cash session is already closed', 409);
      }
      const openedAt = Number(data.opened_at || data.created_at || 0);
      if (!Number.isFinite(openedAt) || openedAt <= 0) {
        throw new OperationalAccessError('Cash session requires reconciliation', 409);
      }
      const [payments, refunds, expenses] = await Promise.all([
        transaction.get(adminDb!.collection('payment_ledger')
          .where('outlet_id', '==', authorizedOutletId)
          .where('captured_at', '>=', openedAt)),
        transaction.get(adminDb!.collectionGroup('refunds')
          .where('outlet_id', '==', authorizedOutletId)
          .where('paid_at', '>=', openedAt)),
        transaction.get(adminDb!.collection('expenses')
          .where('outlet_id', '==', authorizedOutletId)
          .where('timestamp', '>=', openedAt)),
      ]);
      const cashReceiptsPaise = payments.docs.reduce((total, document) => {
        const payment = document.data();
        return payment.payment_method === 'cash' && payment.status === 'captured'
          ? total + Number(payment.amount_paise || 0)
          : total;
      }, 0);
      const cashRefundsPaise = refunds.docs.reduce((total, document) => {
        const refund = document.data();
        return refund.refund_method === 'cash' && refund.payment_status === 'paid'
          ? total + Number(refund.refund_amount_paise || 0)
          : total;
      }, 0);
      const cashExpensesPaise = expenses.docs.reduce((total, document) => {
        const expense = document.data();
        return expense.payment_method === 'cash'
          ? total + Number(expense.amount_paise || 0)
          : total;
      }, 0);
      const expectedCashPaise = Number(data.opening_cash_paise || 0)
        + cashReceiptsPaise - cashRefundsPaise - cashExpensesPaise;
      if (!Number.isSafeInteger(expectedCashPaise) || expectedCashPaise < 0) {
        throw new OperationalAccessError('Cash ledger requires reconciliation', 409);
      }
      const activeTillRef = adminDb!.collection('active_cash_sessions').doc(`${authorizedOutletId}_${data.shift}`);
      const activeTill = await transaction.get(activeTillRef);
      const now = Date.now();
      transaction.update(sessionRef, {
        closing_cash: command.closing_cash,
        closing_cash_paise: closingCashPaise,
        expected_cash: expectedCashPaise / 100,
        expected_cash_paise: expectedCashPaise,
        cash_difference: (closingCashPaise - expectedCashPaise) / 100,
        cash_difference_paise: closingCashPaise - expectedCashPaise,
        reconciliation_sources: {
          cash_receipts_paise: cashReceiptsPaise,
          cash_refunds_paise: cashRefundsPaise,
          cash_expenses_paise: cashExpensesPaise,
          payment_count: payments.size,
          refund_count: refunds.size,
          expense_count: expenses.size,
        },
        cash_note: command.cash_note,
        closed_by: actor.uid,
        closed_at: now,
        updated_at: now,
      });
      if (activeTill.exists && activeTill.data()?.session_id === sessionRef.id) {
        transaction.delete(activeTillRef);
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
