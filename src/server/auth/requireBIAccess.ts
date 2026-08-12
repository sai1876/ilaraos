import { NextResponse } from 'next/server';
import { requireSessionActorApi } from '@/server/auth/requireSessionActor';
import { type ActorContext } from '@/server/auth/resolveActor';

export async function requireBIAccess(): Promise<(ActorContext & { outletId: 'main' }) | NextResponse> {
  const result = await requireSessionActorApi(['owner', 'manager', 'admin']);
  if (result instanceof NextResponse) {
    return result;
  }
  return {
    ...result,
    outletId: 'main'
  };
}
