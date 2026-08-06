// [INTERNAL] - Safe staff directory projection for authorized operations staff.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import {
  OperationalAccessError,
  requireOperationalActor,
  resolveOperationalOutlet,
} from '@/server/operations/operationalAccess';

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof OperationalAccessError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Staff directory unavailable' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireOperationalActor();
    const requestedOutlet = new URL(request.url).searchParams.get('outlet_id')?.trim() || undefined;
    const outletId = await resolveOperationalOutlet(adminDb, actor, requestedOutlet, { allowGlobalRead: true });
    let query: FirebaseFirestore.Query = adminDb.collection('staff_directory');
    if (outletId) query = query.where('outlet_id', '==', outletId);
    const snapshot = await query.limit(200).get();
    const staff = snapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        employee_id: data.employee_id,
        name: data.name,
        role: data.role,
        status: data.status,
        outlet_id: data.outlet_id,
        outlet: data.outlet_id,
        assigned_hatch: data.assigned_hatch,
      };
    });
    return NextResponse.json({ staff });
  } catch (error) {
    return errorResponse(error);
  }
}
