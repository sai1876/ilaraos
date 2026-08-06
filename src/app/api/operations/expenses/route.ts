// [INTERNAL] - Authenticated, outlet-scoped financial operations.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import {
  assertStaffInOutlet,
  moneyToPaise,
  OperationalAccessError,
  requireOperationalActor,
  resolveOperationalOutlet,
} from '@/server/operations/operationalAccess';

const expenseSchema = z.object({
  idempotency_key: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
  outlet_id: z.string().trim().min(1).max(128).optional(),
  category: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive().max(10_000_000),
  description: z.string().trim().min(1).max(500),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank_transfer']),
  staff_id: z.string().trim().min(1).max(128),
});

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof OperationalAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Expense operation failed' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireOperationalActor();
    const requestedOutlet = new URL(request.url).searchParams.get('outlet_id')?.trim() || undefined;
    const outletId = await resolveOperationalOutlet(adminDb, actor, requestedOutlet, { allowGlobalRead: true });
    let query: FirebaseFirestore.Query = adminDb.collection('expenses');
    if (outletId) query = query.where('outlet_id', '==', outletId);
    const snapshot = await query.orderBy('timestamp', 'desc').limit(100).get();
    return NextResponse.json({
      expenses: snapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const parsed = expenseSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid expense record' }, { status: 400 });
    const actor = await requireOperationalActor();
    const outletId = await resolveOperationalOutlet(adminDb, actor, parsed.data.outlet_id);
    if (!outletId) throw new OperationalAccessError('A valid outlet is required', 400);
    await assertStaffInOutlet(adminDb, parsed.data.staff_id, outletId);
    const amountPaise = moneyToPaise(parsed.data.amount);
    const expenseId = `expense_${createHash('sha256')
      .update(`${actor.uid}:${parsed.data.idempotency_key}`)
      .digest('hex')}`;
    const expenseRef = adminDb.collection('expenses').doc(expenseId);
    const created = await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(expenseRef);
      if (existing.exists) return false;
      const now = Date.now();
      transaction.create(expenseRef, {
        outlet_id: outletId,
        category: parsed.data.category,
        amount: parsed.data.amount,
        amount_paise: amountPaise,
        description: parsed.data.description,
        payment_method: parsed.data.payment_method,
        staff_id: parsed.data.staff_id,
        created_by: actor.uid,
        idempotency_key: parsed.data.idempotency_key,
        timestamp: now,
        created_at: now,
        schema_version: 2,
      });
      return true;
    });
    return NextResponse.json(
      { success: true, expense_id: expenseRef.id, idempotent_replay: !created },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
