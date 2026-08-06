import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';

export const dynamic = 'force-dynamic';
const exactRoles = new Set(['manager', 'admin', 'owner']);
const schema = z.object({
  outlet_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['draft', 'submitted', 'locked', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;
    if (!exactRoles.has(actor.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }
    const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success || (parsed.data.start_date && parsed.data.end_date && parsed.data.start_date > parsed.data.end_date)) {
      return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 400 });
    }
    // Enforce outlet scoping BEFORE hitting Firestore
    const outletId = actor.role === 'manager' ? actor.outletId : parsed.data.outlet_id;
    if (actor.role === 'manager' && parsed.data.outlet_id && parsed.data.outlet_id !== actor.outletId) {
      return NextResponse.json({ success: false, error: 'Forbidden for this outlet' }, { status: 403 });
    }
    if (actor.role === 'manager' && !outletId) {
      return NextResponse.json({ success: false, error: 'Outlet assignment required — ask admin to set outlet_id on your staff record' }, { status: 403 });
    }

    const rateLimit = await rateLimitDurable(`daily-closing-list:${actor.uid}`, 60, 5 * 60 * 1000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: rateLimit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: rateLimit.source === 'unavailable' ? 503 : 429 },
      );
    }

    let q: FirebaseFirestore.Query = adminDb.collection('daily_closings');
    if (outletId) q = q.where('outlet_id', '==', outletId);

    const snapshot = await q.get();
    
    // In-memory filter, sort, and limit
    let closings = snapshot.docs.map(document => document.data());
    
    if (parsed.data.status) {
      closings = closings.filter(c => c.status === parsed.data.status);
    }
    if (parsed.data.start_date) {
      closings = closings.filter(c => c.business_date >= parsed.data.start_date!);
    }
    if (parsed.data.end_date) {
      closings = closings.filter(c => c.business_date <= parsed.data.end_date!);
    }
    
    closings.sort((a, b) => {
      const aDate = String(a.business_date || '');
      const bDate = String(b.business_date || '');
      return bDate.localeCompare(aDate);
    });
    
    closings = closings.slice(0, parsed.data.limit);

    return NextResponse.json(
      { success: true, closings },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[DAILY CLOSING LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
