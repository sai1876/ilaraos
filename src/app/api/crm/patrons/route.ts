import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/server/auth/requireRole';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const actor = await requireRole(req, ['manager', 'admin', 'owner']);
    if (actor instanceof NextResponse) return actor;

    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }

    const snap = await adminDb
      .collection('users')
      .orderBy('points', 'desc')
      .limit(30)
      .get();

    const patrons = snap.docs.map(doc => {
      const u = doc.data();
      const completedOrders = u.total_completed_orders || 0;
      const status =
        completedOrders >= 8 ? 'loyal' :
        completedOrders >= 2 ? 'slipping' :
        'churned';

      return {
        id: u.user_id || doc.id,
        name: u.name || u.phone || 'Unknown',
        phone: u.phone || '',
        visits: completedOrders,
        spending: (u.points || 0) * 2,
        lastVisitDaysAgo: u.created_at
          ? Math.floor((Date.now() - u.created_at) / 86400000)
          : 0,
        status,
        preferredItem: '-',
      };
    });

    return NextResponse.json({ success: true, patrons });
  } catch (error) {
    console.error('[CRM PATRONS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
