// [INTERNAL] - Authenticated, outlet-scoped workforce operations.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import {
  assertStaffInOutlet,
  OperationalAccessError,
  requireOperationalActor,
  resolveOperationalOutlet,
} from '@/server/operations/operationalAccess';

const shiftSchema = z.object({
  staff_id: z.string().trim().min(1).max(128),
  outlet_id: z.string().trim().min(1).max(128).optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  role: z.string().trim().min(1).max(80),
  hatch: z.string().trim().min(1).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof OperationalAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Shift operation failed' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireOperationalActor();
    const url = new URL(request.url);
    const date = url.searchParams.get('date')?.trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'A valid shift date is required' }, { status: 400 });
    }
    const requestedOutlet = url.searchParams.get('outlet_id')?.trim() || undefined;
    const outletId = await resolveOperationalOutlet(adminDb, actor, requestedOutlet, { allowGlobalRead: true });
    let query: FirebaseFirestore.Query = adminDb.collection('shifts').where('date', '==', date);
    if (outletId) query = query.where('outlet_id', '==', outletId);
    const snapshot = await query.limit(200).get();
    return NextResponse.json({
      shifts: snapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const parsed = shiftSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.start_time >= parsed.data.end_time) {
      return NextResponse.json({ error: 'Invalid shift record' }, { status: 400 });
    }
    const actor = await requireOperationalActor();
    const outletId = await resolveOperationalOutlet(adminDb, actor, parsed.data.outlet_id);
    if (!outletId) throw new OperationalAccessError('A valid outlet is required', 400);
    await assertStaffInOutlet(adminDb, parsed.data.staff_id, outletId);
    const shiftRef = adminDb.collection('shifts')
      .doc(`${encodeURIComponent(parsed.data.staff_id)}_${parsed.data.date}`);
    await adminDb.runTransaction(async transaction => {
      const existingShift = await transaction.get(shiftRef);
      if (existingShift.exists) {
        throw new OperationalAccessError('Staff member already has a shift on this date', 409);
      }
      const now = Date.now();
      transaction.create(shiftRef, {
        staff_id: parsed.data.staff_id,
        outlet_id: outletId,
        start_time: parsed.data.start_time,
        end_time: parsed.data.end_time,
        role: parsed.data.role,
        hatch: parsed.data.hatch,
        date: parsed.data.date,
        created_by: actor.uid,
        created_at: now,
        updated_at: now,
        schema_version: 2,
      });
    });
    return NextResponse.json({ success: true, shift_id: shiftRef.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
