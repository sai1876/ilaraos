import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireSessionActorApi } from '@/server/auth/requireSessionActor';

export const dynamic = 'force-dynamic';
const exactRoles = new Set(['manager', 'admin', 'owner']);
const querySchema = z.object({
  outlet_id: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['reported', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export async function GET(req: Request) {
  try {
    const actor = await requireSessionActorApi(['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 400 });
    }
    const limit = await rateLimitDurable(`wastage-list:${actor.uid}`, 60, 5 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }

    const requestedOutlet = parsed.data.outlet_id;
    const outletId = ['admin', 'owner'].includes(actor.role) ? requestedOutlet : actor.outletId;
    if (!['admin', 'owner'].includes(actor.role) && requestedOutlet && requestedOutlet !== actor.outletId) {
      return NextResponse.json({ success: false, error: 'Forbidden for this outlet' }, { status: 403 });
    }
    if (!outletId && !['admin', 'owner'].includes(actor.role)) {
      return NextResponse.json({ success: false, error: 'Outlet assignment required' }, { status: 403 });
    }

    let query: FirebaseFirestore.Query = adminDb.collection('wastage_events').where('tenantId', '==', actor.tenantId);
    if (outletId) query = query.where('outlet_id', '==', outletId);
    if (parsed.data.status) query = query.where('status', '==', parsed.data.status);
    const snapshot = await query.orderBy('created_at', 'desc').limit(parsed.data.limit).get();
    return NextResponse.json(
      { success: true, events: snapshot.docs.map(document => document.data()) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[WASTAGE LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
