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
    let staffRef: FirebaseFirestore.Query = adminDb.collection('staff');
    if (outletId) {
      staffRef = staffRef.where('outlet_id', '==', outletId);
    }
    let snapshot = await staffRef.limit(200).get();

    if (snapshot.empty && outletId) {
      const fallbackSnap = await adminDb.collection('staff').where('outlet', '==', outletId).limit(200).get();
      if (!fallbackSnap.empty) snapshot = fallbackSnap;
    }

    if (snapshot.empty) {
      let dirRef: FirebaseFirestore.Query = adminDb.collection('staff_directory');
      if (outletId) dirRef = dirRef.where('outlet_id', '==', outletId);
      snapshot = await dirRef.limit(200).get();
    }

    const staff = snapshot.docs.map(document => {
      const data = document.data();
      const id = document.id;
      const outletVal = String(data.outlet_id || data.outlet || 'main');
      return {
        id,
        employee_id: data.employee_id || id,
        name: data.name || 'Unnamed Staff',
        email: data.email || '',
        phone: data.phone || '',
        role: data.role || 'deep_fryer',
        status: data.status || data.account_status || 'active',
        outlet_id: outletVal,
        outlet: outletVal,
        assigned_hatch: data.assigned_hatch || 'OASIS',
        hourly_rate: data.hourly_rate ?? 0,
        salary: data.salary ?? 0,
        created_at: data.created_at || Date.now(),
        shift_start: data.shift_start || '08:00',
        shift_end: data.shift_end || '17:00',
      };
    });
    return NextResponse.json({ staff });
  } catch (error) {
    return errorResponse(error);
  }
}
