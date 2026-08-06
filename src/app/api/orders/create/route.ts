import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminAuth } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import {
  createOrderServer,
  OrderCreationError,
} from '@/server/orders/createOrderServer';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { verifyTableToken } from '@/server/crypto/tableToken';

const MAX_BODY_BYTES = 64 * 1024;
const orderItemSchema = z.object({
  menuItemId: z.string().trim().min(1).max(128),
  quantity: z.number().int().min(1).max(50),
  modifiers: z.array(z.string().trim().min(1).max(80)).max(12).optional().default([]),
  // Accepted temporarily for client compatibility but never trusted or persisted.
  name: z.string().max(160).optional(),
  price: z.number().finite().nonnegative().optional(),
  station: z.string().max(80).optional(),
}).strict();

const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

const createOrderSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  clientExpectedTotal: z.number().finite().nonnegative().max(1_000_000).optional(),
  promoCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,40}$/).optional(),
  pointsRedeemed: z.number().int().min(0).max(1_000_000).default(0),
  orderType: z.enum(['dine-in', 'pickup', 'delivery']),
  items: z.array(orderItemSchema).min(1).max(50),
  hatch: z.string().trim().min(1).max(80).optional(),
  tableNo: z.string().trim().min(1).max(40).optional(),
  tableToken: z.string().trim().optional(),
  outlet: z.string().trim().min(1).max(120),
  deliveryAddress: z.string().trim().min(5).max(500).optional(),
  deliveryCoordinates: coordinatesSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.orderType === 'delivery' && (!value.deliveryAddress || !value.deliveryCoordinates)) {
    context.addIssue({ code: 'custom', message: 'Delivery details are required' });
  }
  // A hatch is optional because some outlets support pickup without individual
  // pickup points. When hatches are configured, createOrderServer validates
  // the supplied selection against that outlet's list.
  if (value.orderType === 'dine-in') {
    if (!value.tableNo) {
      context.addIssue({ code: 'custom', message: 'Table number is required' });
    }
    if (process.env.NODE_ENV === 'production' && !value.tableToken) {
      context.addIssue({ code: 'custom', message: 'Table token is required for dine-in checkout' });
    }
  }
});

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[orders/create] Missing bearer authorization header');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!adminAuth) {
      console.error('[orders/create] Firebase Admin Auth is not initialized');
      return NextResponse.json({ success: false, error: 'Ordering temporarily unavailable' }, { status: 503 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7), true);
    } catch (error) {
      console.error('[orders/create] Firebase ID token verification failed:', error);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const [actorLimit, ipLimit] = await Promise.all([
      rateLimitDurable(`order-create-uid:${decodedToken.uid}`, 10, 5 * 60 * 1000),
      rateLimitDurable(`order-create-ip:${ip}`, 30, 5 * 60 * 1000),
    ]);
    if (!actorLimit.success || !ipLimit.success) {
      const unavailable = actorLimit.source === 'unavailable' || ipLimit.source === 'unavailable';
      const retryAfter = Math.max(actorLimit.retryAfterMs, ipLimit.retryAfterMs);
      console.error('[orders/create] Rate limit rejected order attempt:', {
        uid: decodedToken.uid,
        actorSource: actorLimit.source,
        ipSource: ipLimit.source,
        retryAfter,
      });
      return NextResponse.json(
        { success: false, error: unavailable ? 'Ordering temporarily unavailable' : 'Too many attempts' },
        {
          status: unavailable ? 503 : 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter / 1000))) },
        },
      );
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      console.error('[orders/create] Request body exceeded declared size limit:', { uid: decodedToken.uid, declaredLength });
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      console.error('[orders/create] Request body exceeded measured size limit:', { uid: decodedToken.uid });
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      console.error('[orders/create] Request body was not valid JSON:', { uid: decodedToken.uid, error });
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[orders/create] Order validation failed:', {
        uid: decodedToken.uid,
        issues: parsed.error.issues,
      });
      return NextResponse.json({ success: false, error: 'Invalid input data' }, { status: 400 });
    }

    const input = parsed.data;

    if (input.orderType === 'dine-in') {
      const payload = input.tableToken ? verifyTableToken(input.tableToken) : null;
      if (!payload) {
        console.error('[orders/create] Dine-in table token was missing or invalid:', {
          uid: decodedToken.uid,
          tableNo: input.tableNo,
          outlet: input.outlet,
        });
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ success: false, error: 'Invalid or expired table token' }, { status: 400 });
        }
      } else {
        if (payload.tableNo !== input.tableNo) {
          console.error('[orders/create] Table token number mismatch:', { uid: decodedToken.uid, tableNo: input.tableNo });
          return NextResponse.json({ success: false, error: 'Table number mismatch' }, { status: 400 });
        }
        if (payload.outletId !== input.outlet) {
          console.error('[orders/create] Table token outlet mismatch:', { uid: decodedToken.uid, outlet: input.outlet });
          return NextResponse.json({ success: false, error: 'Outlet mismatch for this table' }, { status: 400 });
        }
      }
    }

    const order = await createOrderServer({
      userId: decodedToken.uid,
      idempotencyKey: input.idempotencyKey || randomUUID(),
      clientExpectedTotal: input.clientExpectedTotal,
      promoCode: input.promoCode,
      pointsRedeemed: input.pointsRedeemed,
      orderType: input.orderType,
      items: input.items.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        modifiers: item.modifiers,
      })),
      hatch: input.hatch,
      tableNo: input.tableNo,
      outlet: input.outlet,
      deliveryAddress: input.deliveryAddress,
      deliveryCoordinates: input.deliveryCoordinates,
    });

    const orderId = String(order.order_id || 'unknown');
    if (!order.replayed) {
      await logBusinessEvent({
        event_type: 'order_created',
        actor_type: 'customer',
        actor_id: decodedToken.uid,
        target_type: 'order',
        target_id: orderId,
        outlet_id: String(order.outlet_id || 'unknown'),
        order_id: orderId,
        severity: 'info',
        source: 'checkout',
        metadata: { orderType: input.orderType, itemsCount: input.items.length },
      });
    }

    return NextResponse.json(
      { success: true, order },
      { status: order.replayed ? 200 : 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    if (error instanceof OrderCreationError) {
      console.error('[orders/create] Order creation rejected:', {
        status: error.status,
        message: error.message,
        publicMessage: error.publicMessage,
      });
      return NextResponse.json({ success: false, error: error.publicMessage }, { status: error.status });
    }
    console.error('Order API failed:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
