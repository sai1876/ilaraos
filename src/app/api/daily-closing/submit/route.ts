import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';
import { logBusinessEvent, type ActorType } from '@/server/events/logBusinessEvent';

const CASH_DIFFERENCE_NOTE_THRESHOLD = 100;
const exactRoles = new Set(['manager', 'admin', 'owner']);
const money = z.number().finite().nonnegative().max(10_000_000).refine(value => Math.round(value * 100) === value * 100);
const schema = z.object({
  closing_id: z.string().trim().min(1).max(180),
  counted_cash: money,
  manager_cash_note: z.string().trim().min(3).max(500).optional(),
  verified_upi: money,
  manager_payment_note: z.string().trim().min(3).max(500).optional(),
  manager_notes: z.string().trim().max(1000).optional(),
  document_ids: z.array(z.string().trim()).max(10).optional(),
}).strict();

class SubmitError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    const limit = await rateLimitDurable(`daily-closing-submit:${actor.uid}`, 20, 15 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: limit.source === 'unavailable' ? 503 : 429 });
    }
    const input = parsed.data;
    const closingRef = adminDb.collection('daily_closings').doc(input.closing_id);
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(closingRef);
      if (!snapshot.exists) throw new SubmitError(404, 'Daily closing not found');
      const closing = snapshot.data()!;
      if (actor.role === 'manager' && (!actor.outletId || actor.outletId !== closing.outlet_id)) {
        throw new SubmitError(403, 'Forbidden for this outlet');
      }
      if (!['draft', 'rejected'].includes(String(closing.status))) {
        throw new SubmitError(409, 'Only draft or rejected closings can be submitted');
      }
      if (!closing.source_hash) throw new SubmitError(409, 'Closing source snapshot is missing');
      const expectedCash = Number(closing.cash_reconciliation?.expected_cash || 0);
      const cashDifference = input.counted_cash - expectedCash;
      if (Math.abs(cashDifference) > CASH_DIFFERENCE_NOTE_THRESHOLD && !input.manager_cash_note) {
        throw new SubmitError(400, 'A manager cash note is required for this difference');
      }
      const expectedUpi = Number(closing.payment_reconciliation?.expected_upi || 0);
      const upiDifference = input.verified_upi - expectedUpi;

      const validDocRefs = [];
      let foundCashProof = false;
      let foundPaymentProof = false;

      if (input.document_ids) {
        for (const docId of input.document_ids) {
          const docRef = adminDb!.collection('documents').doc(docId);
          const docSnap = await transaction.get(docRef);
          if (!docSnap.exists) throw new SubmitError(422, `INVALID_EVIDENCE_REFERENCE: ${docId} not found`);
          
          const docData = docSnap.data()!;
          if (docData.attachment_state !== 'pending_entity') throw new SubmitError(422, `INVALID_EVIDENCE_REFERENCE: ${docId} not pending`);
          if (docData.related_entity_id !== input.closing_id) throw new SubmitError(422, `INVALID_EVIDENCE_REFERENCE: relation mismatch`);
          
          if (docData.document_type === 'cash_count_photo') foundCashProof = true;
          if (docData.document_type === 'digital_settlement_proof') foundPaymentProof = true;

          validDocRefs.push(docRef);
        }
      }

      // If they are missing required proofs, block it? The rules say "Enforce Cash Count Proof AND (UPI OR Digital Settlement)".
      if (!foundCashProof) throw new SubmitError(422, 'REQUIRED_EVIDENCE_MISSING: cash_count_photo is required');
      // Require digital settlement proof if UPI is > 0
      if (input.verified_upi > 0 && !foundPaymentProof) throw new SubmitError(422, 'REQUIRED_EVIDENCE_MISSING: digital_settlement_proof is required for digital payments');

      const now = Date.now();
      const update = {
        status: 'submitted',
        submitted_at: now,
        submitted_by: actor.uid,
        cash_reconciliation: {
          ...closing.cash_reconciliation,
          counted_cash: input.counted_cash,
          cash_difference: cashDifference,
          ...(input.manager_cash_note ? { manager_cash_note: input.manager_cash_note } : {}),
        },
        payment_reconciliation: {
          ...closing.payment_reconciliation,
          verified_upi: input.verified_upi,
          upi_difference: upiDifference,
          ...(input.manager_payment_note ? { manager_payment_note: input.manager_payment_note } : {}),
        },
        ...(input.manager_notes ? { manager_notes: input.manager_notes } : {}),
        updated_at: now,
      };
      
      transaction.update(closingRef, update);

      for (const docRef of validDocRefs) {
        transaction.update(docRef, {
          attachment_state: 'attached',
          vault_visible: true,
          pending_owner_uid: null,
          pending_expires_at: null,
        });
      }

      return { update, outletId: String(closing.outlet_id) };
    });
    await logBusinessEvent({
      event_type: 'daily_closing_submitted',
      actor_type: actor.role as ActorType,
      actor_id: actor.uid,
      target_type: 'daily_closing',
      target_id: input.closing_id,
      outlet_id: result.outletId,
      severity: 'info',
      source: 'admin_panel',
      metadata: {},
    });
    return NextResponse.json({ success: true, updated: result.update });
  } catch (error) {
    if (error instanceof SubmitError) {
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('[DAILY CLOSING SUBMIT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
