// [PUBLIC] - Single-use bearer exchange delivered through the verified WhatsApp channel
import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { z } from 'zod';
import crypto from 'node:crypto';

const requestSchema = z.object({
  session: z.string().uuid(),
}).strict();

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let reservedRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request.' },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request.' },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication unavailable.' },
        { status: 503, headers: noStoreHeaders() },
      );
    }

    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
    const sessionHash = crypto.createHash('sha256').update(parsed.data.session).digest('hex');
    const [sessionLimit, ipLimit] = await Promise.all([
      rateLimitDurable(`magic-link:${sessionHash}`, 3, 15 * 60 * 1000),
      rateLimitDurable(`magic-link-ip:${clientIp}`, 20, 15 * 60 * 1000),
    ]);
    if (!sessionLimit.success || !ipLimit.success) {
      const unavailable = sessionLimit.source === 'unavailable' || ipLimit.source === 'unavailable';
      return NextResponse.json(
        { success: false, error: unavailable ? 'Authentication unavailable.' : 'Too many attempts.' },
        {
          status: unavailable ? 503 : 429,
          headers: {
            ...noStoreHeaders(),
            'Retry-After': String(Math.ceil(Math.max(sessionLimit.retryAfterMs, ipLimit.retryAfterMs) / 1000)),
          },
        },
      );
    }

    const orderRef = adminDb.collection('voice_orders').doc(parsed.data.session);
    reservedRef = orderRef;
    const reservation = await adminDb.runTransaction(async transaction => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) return { ok: false as const, status: 404, error: 'Invalid or expired link.' };

      const orderData = orderSnap.data()!;
      if (orderData.status !== 'staged' && orderData.status !== 'PENDING') {
        return { ok: false as const, status: 410, error: 'Invalid or expired link.' };
      }

      const expiresAt = orderData.expires_at?.toMillis
        ? orderData.expires_at.toMillis()
        : orderData.expires_at;
      if (typeof expiresAt !== 'number' || Date.now() > expiresAt) {
        return { ok: false as const, status: 410, error: 'Invalid or expired link.' };
      }

      if (!orderData.user_id || ['consuming', 'consumed'].includes(orderData.magic_link_state)) {
        return { ok: false as const, status: 410, error: 'Invalid or expired link.' };
      }

      transaction.update(orderRef, {
        magic_link_state: 'consuming',
        magic_link_reserved_at: Date.now(),
      });
      return { ok: true as const, orderData };
    });

    if (!reservation.ok) {
      return NextResponse.json(
        { success: false, error: reservation.error },
        { status: reservation.status, headers: noStoreHeaders() },
      );
    }

    const menuSnap = await adminDb.collection('menu').limit(500).get();
    const menuItems = menuSnap.docs.map(doc => doc.data());
    const orderItems: Array<Record<string, unknown>> = Array.isArray(reservation.orderData.items)
      ? reservation.orderData.items.filter(isRecord)
      : [];

    const cartItems = orderItems.slice(0, 100).map(item => {
      const menuMatch = menuItems.find(menuItem => menuItem.name === item.name);
      return {
        id: crypto.randomUUID(),
        menuItemId: menuMatch?.item_id || 'unknown',
        name: String(item.name || '').slice(0, 120),
        price: Number(item.unit_price) || 0,
        quantity: Math.max(1, Math.min(100, Number(item.qty) || 1)),
        station: menuMatch?.station || 'Beverage Station',
        modifiers: [],
      };
    });

    const customToken = await adminAuth.createCustomToken(reservation.orderData.user_id);
    await orderRef.update({
      magic_link_state: 'consumed',
      magic_link_consumed_at: Date.now(),
    });

    return NextResponse.json(
      { success: true, token: customToken, items: cartItems },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    console.error('[MAGIC LINK ERROR]', error);
    if (reservedRef) {
      await reservedRef.update({
        magic_link_state: 'consume_failed',
        magic_link_failed_at: Date.now(),
      }).catch(() => undefined);
    }
    return NextResponse.json(
      { success: false, error: 'Failed to process magic link.' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
