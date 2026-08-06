// [INTERNAL] - Session repair API
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

export async function POST(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['admin', 'owner']);

    const now = Date.now();
    const STALE_THRESHOLD_MS = 16 * 60 * 60 * 1000; // 16 hours

    // 1. Repair Stale Attendance
    const staleAttendanceSnap = await adminDb.collection('active_attendance')
      .where('clock_in', '<=', now - STALE_THRESHOLD_MS)
      .limit(100)
      .get();

    let attendanceRepairedCount = 0;
    for (const doc of staleAttendanceSnap.docs) {
      const activeData = doc.data();
      const attendanceId = activeData.attendance_id;

      if (attendanceId) {
        const attendanceRef = adminDb.collection('attendance').doc(attendanceId);
        await adminDb.runTransaction(async transaction => {
          const attendanceSnap = await transaction.get(attendanceRef);
          if (attendanceSnap.exists) {
            const data = attendanceSnap.data()!;
            if (data.clock_out === null || data.clock_out === undefined) {
              const defaultClockOut = (data.clock_in || now) + 8 * 60 * 60 * 1000; // default to 8 hour shift
              transaction.update(attendanceRef, {
                status: 'completed',
                clock_out: defaultClockOut,
                clocked_out_by: 'system_repair',
                updated_at: now
              });
            }
          }
          transaction.delete(doc.ref);
        });
        attendanceRepairedCount++;
      } else {
        await doc.ref.delete();
      }
    }

    // 2. Repair Stale Cash Sessions
    const staleCashSessionsSnap = await adminDb.collection('active_cash_sessions')
      .where('opened_at', '<=', now - STALE_THRESHOLD_MS)
      .limit(100)
      .get();

    let cashRepairedCount = 0;
    for (const doc of staleCashSessionsSnap.docs) {
      const activeData = doc.data();
      const sessionId = activeData.session_id;
      const outletId = activeData.outlet_id;

      if (sessionId && outletId) {
        const sessionRef = adminDb.collection('cash_sessions').doc(sessionId);
        await adminDb.runTransaction(async transaction => {
          const sessionSnap = await transaction.get(sessionRef);
          if (sessionSnap.exists) {
            const data = sessionSnap.data()!;
            if (data.closing_cash === null || data.closing_cash === undefined) {
              const openedAt = Number(data.opened_at || data.created_at || 0);

              const [payments, refunds, expenses] = await Promise.all([
                adminDb!.collection('payment_ledger')
                  .where('outlet_id', '==', outletId)
                  .where('captured_at', '>=', openedAt)
                  .get(),
                adminDb!.collectionGroup('refunds')
                  .where('outlet_id', '==', outletId)
                  .where('paid_at', '>=', openedAt)
                  .get(),
                adminDb!.collection('expenses')
                  .where('outlet_id', '==', outletId)
                  .where('timestamp', '>=', openedAt)
                  .get(),
              ]);

              const cashReceiptsPaise = payments.docs.reduce((total, pDoc) => {
                const payment = pDoc.data();
                return payment.payment_method === 'cash' && payment.status === 'captured'
                  ? total + Number(payment.amount_paise || 0)
                  : total;
              }, 0);

              const cashRefundsPaise = refunds.docs.reduce((total, rDoc) => {
                const refund = rDoc.data();
                return refund.refund_method === 'cash' && refund.payment_status === 'paid'
                  ? total + Number(refund.refund_amount_paise || 0)
                  : total;
              }, 0);

              const cashExpensesPaise = expenses.docs.reduce((total, eDoc) => {
                const expense = eDoc.data();
                return expense.payment_method === 'cash'
                  ? total + Number(expense.amount_paise || 0)
                  : total;
              }, 0);

              const expectedCashPaise = Number(data.opening_cash_paise || 0)
                + cashReceiptsPaise - cashRefundsPaise - cashExpensesPaise;

              const finalExpected = expectedCashPaise >= 0 ? expectedCashPaise : 0;

              transaction.update(sessionRef, {
                closing_cash: finalExpected / 100,
                closing_cash_paise: finalExpected,
                expected_cash: finalExpected / 100,
                expected_cash_paise: finalExpected,
                cash_difference: 0,
                cash_difference_paise: 0,
                reconciliation_sources: {
                  cash_receipts_paise: cashReceiptsPaise,
                  cash_refunds_paise: cashRefundsPaise,
                  cash_expenses_paise: cashExpensesPaise,
                  payment_count: payments.size,
                  refund_count: refunds.size,
                  expense_count: expenses.size,
                },
                cash_note: 'Auto-closed by repair utility',
                closed_by: 'system_repair',
                closed_at: openedAt + 8 * 60 * 60 * 1000,
                updated_at: now
              });
            }
          }
          transaction.delete(doc.ref);
        });
        cashRepairedCount++;
      } else {
        await doc.ref.delete();
      }
    }

    if (attendanceRepairedCount > 0 || cashRepairedCount > 0) {
      await logBusinessEvent({
        event_type: 'workforce_sessions_repaired',
        actor_type: 'staff',
        actor_id: actor.uid,
        target_type: 'system',
        target_id: 'repair_utility',
        severity: 'warning',
        source: 'api',
        metadata: { attendanceRepairedCount, cashRepairedCount }
      });
    }

    return NextResponse.json({
      success: true,
      repaired: {
        attendance: attendanceRepairedCount,
        cash_sessions: cashRepairedCount
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
