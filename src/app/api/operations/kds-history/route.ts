// [INTERNAL] - Scoped KDS history lookup API
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { canAccessKdsStation, isKdsRole } from '@/server/operations/kdsAccess';

export async function GET(req: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const actor = await requireSessionActor(['staff']);
    if (!isKdsRole(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const globalActor = actor.role === 'owner' || actor.role === 'admin';
    if (!globalActor && !actor.outletId) {
      return NextResponse.json({ error: 'Staff outlet is not configured' }, { status: 403 });
    }

    const url = new URL(req.url);
    const period = url.searchParams.get('period') || 'today';
    const now = Date.now();
    let timeLimit = now - 24 * 60 * 60 * 1000;
    if (period === 'week') {
      timeLimit = now - 7 * 24 * 60 * 60 * 1000;
    } else if (period === 'month') {
      timeLimit = now - 30 * 24 * 60 * 60 * 1000;
    } else if (period === 'all') {
      timeLimit = now - 90 * 24 * 60 * 60 * 1000; // limit 'all' to last 90 days for safety
    }

    let query: FirebaseFirestore.Query = adminDb.collection('orders')
      .where('created_at', '>=', timeLimit);

    if (!globalActor) {
      query = query.where('outlet_id', '==', actor.outletId);
    }

    const snap = await query.orderBy('created_at', 'desc').limit(200).get();
    const history = snap.docs.flatMap(doc => {
      const order = doc.data();
      const items = Array.isArray(order.items)
        ? order.items.filter((item: any) => canAccessKdsStation(actor.role, item.station))
        : [];

      if (items.length === 0) return [];
      
      // Check if any matching items are marked ready
      const hasCompletedItems = items.some((item: any) => item.item_status === 'ready');
      if (!hasCompletedItems) return [];

      return [{
        order_id: doc.id,
        display_order_code: order.display_order_code,
        token_number: order.token_number,
        outlet_id: order.outlet_id,
        created_at: order.created_at,
        status: order.status,
        items
      }];
    });

    return NextResponse.json({ history });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
