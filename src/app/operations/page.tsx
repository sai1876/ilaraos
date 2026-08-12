import { redirect } from 'next/navigation';
import OperationsClient from './OperationsClient';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { getHomeRouteForRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    if (error instanceof SessionAuthorizationError) {
      redirect('/login?staff=true');
    }
    console.error('Operations route authorization failed:', error);
    redirect('/login?staff=true');
  }

  if (actor.role !== 'owner' && actor.role !== 'admin') {
    redirect(getHomeRouteForRole(actor.role));
  }

  return <OperationsClient actor={{
    uid: actor.uid,
    role: actor.role,
    staffId: actor.staffId,
    tenantId: actor.tenantId,
    outletId: actor.outletId,
    allowedOutletIds: actor.allowedOutletIds,
    permissions: actor.permissions,
  }} />;
}
