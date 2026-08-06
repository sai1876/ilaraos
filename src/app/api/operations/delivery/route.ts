// [INTERNAL] - Rider-assignment-scoped delivery operations.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { rateLimitDurable } from '@/lib/rateLimit';
import { Timestamp } from 'firebase-admin/firestore';

const deliveryCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start_route'),
    order_ids: z.array(z.string().trim().min(1).max(128)).min(1).max(20),
  }),
  z.object({
    action: z.literal('location'),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().positive().max(1000),
  }),
  z.object({
    action: z.literal('availability'),
    status: z.enum(['active', 'offline']),
  }),
]);

type RiderActor = {
  uid: string;
  role: 'rider';
  staffId: string;
  outletId: string;
};

class DeliveryCommandError extends Error {
  constructor(public readonly status: 400 | 403 | 409, message: string) {
    super(message);
  }
}

async function requireRider(): Promise<RiderActor> {
  const actor = await requireSessionActor(['staff']);
  if (actor.role !== 'rider' || !actor.staffId || !actor.outletId) {
    throw new SessionAuthorizationError('Assigned rider access required', 403);
  }
  return { uid: actor.uid, role: 'rider', staffId: actor.staffId, outletId: actor.outletId };
}

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof SessionAuthorizationError || error instanceof DeliveryCommandError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: status === 500 ? 'Delivery operation failed' : error instanceof Error ? error.message : 'Request failed' },
    { status },
  );
}

export async function GET() {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const actor = await requireRider();
    const baseQuery = adminDb.collection('orders')
      .where('outlet_id', '==', actor.outletId)
      .where('rider_id', '==', actor.staffId);
    const [activeSnapshot, historySnapshot] = await Promise.all([
      baseQuery.where('status', 'in', ['dispatched', 'out_for_delivery']).limit(20).get(),
      baseQuery.where('status', '==', 'delivered').orderBy('created_at', 'desc').limit(50).get(),
    ]);
    const active = activeSnapshot.docs;
    const userIds = [...new Set(active.map(document => String(document.data().user_id || '')).filter(Boolean))];
    const userSnapshots = await Promise.all(userIds.map(uid => adminDb!.collection('users').doc(uid).get()));
    const phones = new Map(userSnapshots.map(document => [document.id, document.data()?.phone]));

    const projectActiveOrder = (document: FirebaseFirestore.QueryDocumentSnapshot) => {
      const order = document.data();
      return {
        order_id: document.id,
        display_order_code: order.display_order_code,
        token_number: order.token_number,
        status: order.status,
        fulfillment_status: order.fulfillment_status,
        order_type: order.order_type,
        delivery_address: order.delivery_address,
        delivery_coordinates: order.delivery_coordinates,
        gross_amount: order.gross_amount,
        gross_amount_paise: order.gross_amount_paise,
        is_paid: order.is_paid === true,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        items: Array.isArray(order.items)
          ? order.items.map((item: Record<string, unknown>) => ({
              item_id: item.item_id,
              name: item.name,
              quantity: item.quantity,
            }))
          : [],
        created_at: order.created_at,
        customer_phone: phones.get(String(order.user_id || '')) || null,
      };
    };

    const projectHistoryOrder = (document: FirebaseFirestore.QueryDocumentSnapshot) => {
      const order = document.data();
      return {
        order_id: document.id,
        display_order_code: order.display_order_code,
        token_number: order.token_number,
        completed_at: order.completed_at,
        created_at: order.created_at,
        item_count: Array.isArray(order.items) ? order.items.length : 0,
      };
    };

    const riderSnapshot = await adminDb.collection('staff_directory').doc(actor.staffId).get();
    const riderData = riderSnapshot.data();
    const rider = {
      id: actor.staffId,
      employee_id: riderData?.employee_id || actor.staffId,
      name: riderData?.name || 'Rider',
      role: 'rider',
      outlet_id: actor.outletId,
      status: riderData?.status === 'active' ? 'active' : 'offline',
    };
    return NextResponse.json({
      rider,
      assignments: active.map(projectActiveOrder),
      history: historySnapshot.docs.map(projectHistoryOrder),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const parsed = deliveryCommandSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid delivery command' }, { status: 400 });
    const actor = await requireRider();
    const command = parsed.data;

    if (command.action !== 'location') {
      const commandLimit = await rateLimitDurable(`delivery-command:${actor.uid}`, 60, 15 * 60 * 1000);
      if (!commandLimit.success) {
        return NextResponse.json(
          { error: commandLimit.source === 'unavailable' ? 'Delivery service unavailable' : 'Too many delivery commands' },
          { status: commandLimit.source === 'unavailable' ? 503 : 429 },
        );
      }
    }

    if (command.action === 'start_route') {
      const ids = [...new Set(command.order_ids)];
      if (ids.length !== command.order_ids.length) {
        return NextResponse.json({ error: 'Duplicate order IDs are not allowed' }, { status: 400 });
      }
      const orderRefs = ids.map(id => adminDb!.collection('orders').doc(id));
      await adminDb.runTransaction(async transaction => {
        const snapshots = await Promise.all(orderRefs.map(ref => transaction.get(ref)));
        snapshots.forEach(snapshot => {
          const order = snapshot.data();
          if (!snapshot.exists || order?.status !== 'dispatched'
              || order.rider_id !== actor.staffId || order.outlet_id !== actor.outletId) {
            throw new SessionAuthorizationError('One or more orders are not assigned to this rider', 403);
          }
        });
        const now = Date.now();
        orderRefs.forEach(ref => transaction.update(ref, {
          status: 'out_for_delivery',
          fulfillment_status: 'out_for_delivery',
          route_started_at: now,
          updated_at: now,
        }));
      });
      return NextResponse.json({ success: true });
    }

    if (command.action === 'location') {
      const limit = await rateLimitDurable(`delivery-location:${actor.uid}`, 120, 5 * 60 * 1000);
      if (!limit.success) {
        return NextResponse.json(
          { error: limit.source === 'unavailable' ? 'Location service unavailable' : 'Location updates are too frequent' },
          { status: limit.source === 'unavailable' ? 503 : 429 },
        );
      }
      const active = await adminDb.collection('orders')
        .where('outlet_id', '==', actor.outletId)
        .where('rider_id', '==', actor.staffId)
        .where('status', '==', 'out_for_delivery')
        .limit(1)
        .get();
      if (active.empty) return NextResponse.json({ error: 'No active delivery assignment' }, { status: 409 });
      const now = Date.now();
      await adminDb.collection('delivery_locations').doc(actor.staffId).set({
        rider_id: actor.staffId,
        outlet_id: actor.outletId,
        location: {
          lat: command.lat,
          lng: command.lng,
          accuracy: command.accuracy,
          updated_at: now,
        },
        expires_at: Timestamp.fromMillis(now + 10 * 60 * 1000),
        updated_at: now,
      }, { merge: false });
      return NextResponse.json({ success: true });
    }

    const activeQuery = adminDb.collection('orders')
        .where('outlet_id', '==', actor.outletId)
        .where('rider_id', '==', actor.staffId)
        .where('status', 'in', ['dispatched', 'out_for_delivery'])
        .limit(1);
    const now = Date.now();
    await adminDb.runTransaction(async transaction => {
      const active = await transaction.get(activeQuery);
      if (command.status === 'offline' && !active.empty) {
        throw new DeliveryCommandError(409, 'Complete assigned deliveries before going offline');
      }
      transaction.set(adminDb!.collection('staff_directory').doc(actor.staffId), { status: command.status, updated_at: now }, { merge: true });
      transaction.set(adminDb!.collection('staff_access').doc(actor.uid), { status: command.status, updated_at: now }, { merge: true });
      transaction.set(adminDb!.collection('staff').doc(actor.staffId), { status: command.status, updated_at: now }, { merge: true });
      if (command.status === 'offline') {
        transaction.delete(adminDb!.collection('delivery_locations').doc(actor.staffId));
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
