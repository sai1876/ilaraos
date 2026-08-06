// [PUBLIC] - Authenticated customers may read only their abstract queue position.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { requireRole } from '@/server/auth/requireRole';

export const dynamic = 'force-dynamic';
const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function timestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return 0;
}

export async function GET(request: Request) {
  try {
    const actor = await requireRole(request, ['customer']);
    if (actor instanceof NextResponse) return actor;
    if (!adminDb) {
      return NextResponse.json({ error: 'Tracking unavailable' }, { status: 503, headers: noStoreHeaders });
    }

    const orderId = new URL(request.url).searchParams.get('order_id');
    if (!orderId || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStoreHeaders });
    }

    const limit = await rateLimitDurable(`customer-route:${actor.uid}`, 60, 10 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: limit.source === 'unavailable' ? 'Tracking unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429, headers: noStoreHeaders },
      );
    }

    const orderDocument = await adminDb.collection('orders').doc(orderId).get();
    if (!orderDocument.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers: noStoreHeaders });
    }
    const order = orderDocument.data()!;
    if (order.user_id !== actor.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreHeaders });
    }
    if (order.status !== 'out_for_delivery' || typeof order.rider_id !== 'string') {
      return NextResponse.json({ orders_ahead: 0, queue_position: null }, { headers: noStoreHeaders });
    }

    const activeSnapshot = await adminDb.collection('orders')
      .where('rider_id', '==', order.rider_id)
      .where('status', '==', 'out_for_delivery')
      .limit(100)
      .get();
    const orderedIds = activeSnapshot.docs
      .map(document => ({ id: document.id, createdAt: timestamp(document.data().created_at) }))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(item => item.id);
    const currentIndex = orderedIds.indexOf(orderId);
    const ordersAhead = currentIndex < 0 ? 0 : currentIndex;
    const locationDocument = await adminDb.collection('delivery_locations').doc(order.rider_id).get();
    const locationData = locationDocument.data();
    const location = locationData?.location;
    const locationIsCurrent = locationDocument.exists
      && locationData?.outlet_id === order.outlet_id
      && locationData?.rider_id === order.rider_id
      && timestamp(locationData?.expires_at) > Date.now()
      && typeof location?.lat === 'number'
      && typeof location?.lng === 'number';

    return NextResponse.json({
      orders_ahead: ordersAhead,
      queue_position: currentIndex < 0 ? null : currentIndex + 1,
      rider_location: locationIsCurrent
        ? { lat: location.lat, lng: location.lng, updated_at: timestamp(location.updated_at) }
        : null,
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Active route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: noStoreHeaders });
  }
}
