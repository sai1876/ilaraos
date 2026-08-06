import { redirect } from 'next/navigation';
import KDSClient from './KDSClient';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { isKdsRole } from '@/server/operations/kdsAccess';

export const dynamic = 'force-dynamic';

export default async function KDSPage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    console.error('KDS authorization failed', error);
    redirect('/login');
  }

  if (!isKdsRole(actor.role)) redirect('/login');

  const staffSnapshot = adminDb && actor.staffId
    ? await adminDb.collection('staff_directory').doc(actor.staffId).get()
    : null;
  const staffDetails = staffSnapshot?.exists
    ? { id: staffSnapshot.id, outletId: actor.outletId || 'main', ...staffSnapshot.data() }
    : { id: actor.staffId || actor.uid, name: 'Staff member', role: actor.role, outletId: actor.outletId || 'main' };

  return <KDSClient role={actor.role} staffDetails={staffDetails} />;
}
