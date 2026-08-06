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
import { businessDate, businessDayUtcBounds, normalizeTimeZone } from '@/server/operations/businessTime';

const attendanceCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('clock_in'),
    staff_id: z.string().trim().min(1).max(128),
    outlet_id: z.string().trim().min(1).max(128).optional(),
  }),
  z.object({
    action: z.literal('clock_out'),
    attendance_id: z.string().trim().min(1).max(128),
    staff_id: z.string().trim().min(1).max(128),
  }),
]);

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof OperationalAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Attendance operation failed' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireOperationalActor();
    const url = new URL(request.url);
    const requestedOutlet = url.searchParams.get('outlet_id')?.trim() || undefined;
    const date = url.searchParams.get('date')?.trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid attendance date' }, { status: 400 });
    }
    const outletId = await resolveOperationalOutlet(adminDb, actor, requestedOutlet, { allowGlobalRead: true });
    if (date && !outletId) {
      return NextResponse.json({ error: 'An outlet is required for a dated attendance query' }, { status: 400 });
    }
    let query: FirebaseFirestore.Query = adminDb.collection('attendance');
    if (outletId) query = query.where('outlet_id', '==', outletId);
    if (date && outletId) {
      const outlet = await adminDb.collection('outlets').doc(outletId).get();
      let bounds;
      try {
        bounds = businessDayUtcBounds(date, normalizeTimeZone(outlet.data()?.timezone));
      } catch {
        return NextResponse.json({ error: 'Invalid attendance date' }, { status: 400 });
      }
      query = query.where('clock_in', '>=', bounds.start).where('clock_in', '<', bounds.end);
    }
    const snapshot = await query.orderBy('clock_in', 'desc').limit(100).get();
    return NextResponse.json({
      attendance: snapshot.docs.map(document => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const parsed = attendanceCommandSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid attendance command' }, { status: 400 });
    const actor = await requireOperationalActor();

    if (parsed.data.action === 'clock_in') {
      const outletId = await resolveOperationalOutlet(adminDb, actor, parsed.data.outlet_id);
      if (!outletId) throw new OperationalAccessError('A valid outlet is required', 400);
      await assertStaffInOutlet(adminDb, parsed.data.staff_id, outletId);
      const attendanceRef = adminDb.collection('attendance').doc();
      const activeAttendanceRef = adminDb.collection('active_attendance').doc(encodeURIComponent(parsed.data.staff_id));
      const outlet = await adminDb.collection('outlets').doc(outletId).get();
      const timeZone = normalizeTimeZone(outlet.data()?.timezone);
      await adminDb.runTransaction(async transaction => {
        const activeAttendance = await transaction.get(activeAttendanceRef);
        if (activeAttendance.exists) {
          throw new OperationalAccessError('Staff member is already clocked in', 409);
        }
        const now = Date.now();
        transaction.create(attendanceRef, {
          staff_id: parsed.data.staff_id,
          outlet_id: outletId,
          status: 'present',
          clock_in: now,
          clock_out: null,
          business_date: businessDate(now, timeZone),
          timezone: timeZone,
          created_by: actor.uid,
          created_at: now,
          updated_at: now,
          schema_version: 2,
        });
        transaction.create(activeAttendanceRef, {
          attendance_id: attendanceRef.id,
          staff_id: parsed.data.staff_id,
          outlet_id: outletId,
          clock_in: now,
        });
      });
      return NextResponse.json({ success: true, attendance_id: attendanceRef.id }, { status: 201 });
    }

    const attendanceRef = adminDb.collection('attendance').doc(parsed.data.attendance_id);
    const currentAttendance = await attendanceRef.get();
    if (!currentAttendance.exists) throw new OperationalAccessError('Attendance record not found', 404);
    const currentData = currentAttendance.data()!;
    if (currentData.staff_id !== parsed.data.staff_id) {
      throw new OperationalAccessError('Attendance record does not match staff member', 400);
    }
    const authorizedOutletId = await resolveOperationalOutlet(
      adminDb,
      actor,
      String(currentData.outlet_id || ''),
    );
    await adminDb.runTransaction(async transaction => {
      const activeAttendanceRef = adminDb!.collection('active_attendance').doc(encodeURIComponent(parsed.data.staff_id));
      const [snapshot, activeAttendance] = await Promise.all([
        transaction.get(attendanceRef),
        transaction.get(activeAttendanceRef),
      ]);
      if (!snapshot.exists) throw new OperationalAccessError('Attendance record not found', 404);
      const data = snapshot.data()!;
      if (data.outlet_id !== authorizedOutletId || data.staff_id !== parsed.data.staff_id) {
        throw new OperationalAccessError('Attendance scope changed', 409);
      }
      if (data.clock_out !== null && data.clock_out !== undefined) {
        throw new OperationalAccessError('Staff member is already clocked out', 409);
      }
      const now = Date.now();
      transaction.update(attendanceRef, {
        status: 'completed',
        clock_out: now,
        clocked_out_by: actor.uid,
        updated_at: now,
      });
      if (activeAttendance.exists && activeAttendance.data()?.attendance_id === attendanceRef.id) {
        transaction.delete(activeAttendanceRef);
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
