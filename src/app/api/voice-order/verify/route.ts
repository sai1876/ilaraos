// [INTERNAL] - Legacy voice-order maintenance endpoint.
// Checkout and identity verification now use the single-use magic-link flow.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';

const schema = z.object({
  session: z.string().uuid(),
  action: z.enum(['verify_password', 'complete_payment', 'soft_delete']),
}).strict();

const secureEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export async function POST(request: Request) {
  try {
    const secret = process.env.API_SECRET_KEY;
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!secret || secret.length < 32 || !secureEqual(bearer, secret)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Service unavailable' }, { status: 503 });
    }

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }
    const sessionHash = crypto.createHash('sha256').update(parsed.data.session).digest('hex');
    const limit = await rateLimitDurable(`voice-order-maintenance:${sessionHash}`, 5, 15 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: limit.source === 'unavailable' ? 'Service unavailable' : 'Too many requests' },
        { status: limit.source === 'unavailable' ? 503 : 429 },
      );
    }

    if (parsed.data.action !== 'soft_delete') {
      return NextResponse.json(
        { success: false, error: 'Legacy voice checkout is retired; use the single-use checkout link' },
        { status: 410 },
      );
    }

    const voiceOrderRef = adminDb.collection('voice_orders').doc(parsed.data.session);
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(voiceOrderRef);
      if (!snapshot.exists) return { exists: false, alreadyDeleted: false };
      const order = snapshot.data()!;
      if (order.status === 'SOFT_DELETED') return { exists: true, alreadyDeleted: true };
      if (!['staged', 'PENDING'].includes(String(order.status))) {
        return { exists: true, alreadyDeleted: false, immutable: true };
      }
      transaction.update(voiceOrderRef, {
        status: 'SOFT_DELETED',
        soft_deleted_at: Date.now(),
        updated_at: Date.now(),
      });
      return { exists: true, alreadyDeleted: false };
    });
    if (!result.exists) {
      return NextResponse.json({ success: false, error: 'Voice order not found' }, { status: 404 });
    }
    if (result.immutable) {
      return NextResponse.json({ success: false, error: 'Voice order state cannot be changed' }, { status: 409 });
    }
    return NextResponse.json({ success: true, status: 'SOFT_DELETED', replayed: result.alreadyDeleted });
  } catch (error) {
    console.error('[VOICE ORDER MAINTENANCE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
