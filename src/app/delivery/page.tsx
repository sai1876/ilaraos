import { redirect } from 'next/navigation';
import DeliveryClient from './DeliveryClient';
import { requireSessionActor } from '@/server/auth/requireSessionActor';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  let actor;
  try {
    actor = await requireSessionActor(['staff']);
  } catch (error) {
    console.error('Delivery authorization failed', error);
    redirect('/login');
  }

  if (actor.role !== 'rider' || !actor.staffId || !actor.outletId) redirect('/login');

  return <DeliveryClient />;
}
