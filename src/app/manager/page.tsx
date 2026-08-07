import { redirect } from 'next/navigation';
import ManagerClient from './ManagerClient';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { getHomeRouteForRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function ManagerPage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    if (error instanceof SessionAuthorizationError) {
      redirect('/login?staff=true');
    }
    console.error('Manager route authorization failed:', error);
    redirect('/login?staff=true');
  }

  if (actor.role !== 'manager' && actor.role !== 'owner') {
    redirect(getHomeRouteForRole(actor.role));
  }

  return (
    <ManagerClient
      actor={{
        uid: actor.uid,
        role: actor.role,
        staffId: actor.staffId,
        outletId: actor.outletId,
      }}
    />
  );
}
