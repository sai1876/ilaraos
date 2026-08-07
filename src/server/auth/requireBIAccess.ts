import { NextResponse } from 'next/server';
import { requireRole, type AuthContext } from '@/server/auth/requireRole';

export async function requireBIAccess(req: Request): Promise<(AuthContext & { outletId: 'main' }) | NextResponse> {
  const result = await requireRole(req, ['owner', 'manager', 'admin']);
  if (result instanceof NextResponse) {
    return result;
  }
  return {
    ...result,
    outletId: 'main'
  };
}
