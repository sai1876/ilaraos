import { redirect } from 'next/navigation';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import EvidenceClient from './EvidenceClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Evidence / ProofOps | IlaraOS',
};

export const dynamic = 'force-dynamic';

export default async function EvidencePage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    if (error instanceof SessionAuthorizationError) {
      redirect('/login?staff=true');
    }
    console.error('Evidence route authorization failed:', error);
    redirect('/login?staff=true');
  }

  // Everyone authorized as staff (and optionally checking explicitly for owner/admin/manager) can view Evidence
  // If specific role constraints apply, they can be placed here.
  
  return <EvidenceClient actor={{
    uid: actor.uid,
    role: actor.role,
    staffId: actor.staffId,
    outletId: actor.outletId,
  }} />;
}
