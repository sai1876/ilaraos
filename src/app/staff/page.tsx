import { redirect } from 'next/navigation';
import StaffWorkspaceClient from './StaffWorkspaceClient';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { getHomeRouteForRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function StaffWorkspacePage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    if (error instanceof SessionAuthorizationError) {
      redirect('/login?staff=true');
    }
    console.error('Staff workspace authorization failed:', error);
    redirect('/login?staff=true');
  }

  if (actor.role !== 'staff') {
    redirect(getHomeRouteForRole(actor.role));
  }

  return (
    <StaffWorkspaceClient
      actor={{
        uid: actor.uid,
        role: actor.role,
        staffId: actor.staffId,
        outletId: actor.outletId,
      }}
    />
  );
}
