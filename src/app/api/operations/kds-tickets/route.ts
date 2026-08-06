// [INTERNAL] - Least-data KDS ticket feed for authorized kitchen roles.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { canAccessKdsStation, isKdsRole } from '@/server/operations/kdsAccess';

export async function GET() {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireSessionActor(['staff']);
    if (!isKdsRole(actor.role)) {
      return NextResponse.json({ error: 'Kitchen access required' }, { status: 403 });
    }
    const globalActor = actor.role === 'owner' || actor.role === 'admin';
    if (!globalActor && !actor.outletId) {
      return NextResponse.json({ error: 'Staff outlet is not configured' }, { status: 403 });
    }
    const timeLimit = Date.now() - 12 * 60 * 60 * 1000;
    let query: FirebaseFirestore.Query = adminDb.collection('orders')
      .where('status', 'in', ['confirmed', 'preparing'])
      .where('created_at', '>=', timeLimit);
    if (!globalActor) query = query.where('outlet_id', '==', actor.outletId);
    const snapshot = await query.orderBy('created_at', 'asc').limit(200).get();
    const tickets = snapshot.docs.flatMap(document => {
      const order = document.data();
      const items = Array.isArray(order.items)
        ? order.items
            .filter((item: Record<string, unknown>) => canAccessKdsStation(actor.role, item.station))
            .map((item: Record<string, unknown>) => ({
              item_id: item.item_id,
              menu_item_id: item.menu_item_id,
              name: item.name,
              quantity: item.quantity,
              station: item.station,
              item_status: item.item_status,
              modifiers: item.modifiers,
            }))
        : [];
      if (items.length === 0) return [];
      return [{
        order_id: document.id,
        display_order_code: order.display_order_code,
        token_number: order.token_number,
        outlet_id: order.outlet_id,
        order_type: order.order_type,
        status: order.status,
        rush_held: order.rush_held === true,
        estimated_time_mins: order.estimated_time_mins,
        created_at: order.created_at,
        items,
      }];
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    const status = error instanceof SessionAuthorizationError ? error.status : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Kitchen feed unavailable' : error instanceof Error ? error.message : 'Unauthorized' },
      { status },
    );
  }
}
