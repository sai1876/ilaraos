// [PUBLIC] - Initiates a rate-limited WhatsApp signup proof.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';

const MAX_BODY_BYTES = 4 * 1024;
const handshakeSchema = z.object({
  phone: z.string().min(10).max(24),
}).strict();

export async function POST(req: Request) {
  try {
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    const parsed = handshakeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    const normalizedPhone = parsed.data.phone.replace(/\D/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const phoneHash = crypto.createHash('sha256').update(normalizedPhone).digest('hex');
    const [ipLimit, phoneLimit] = await Promise.all([
      rateLimitDurable(`signup-handshake-ip:${ip}`, 10, 15 * 60 * 1000),
      rateLimitDurable(`signup-handshake-phone:${phoneHash}`, 3, 15 * 60 * 1000),
    ]);
    if (!ipLimit.success || !phoneLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || phoneLimit.source === 'unavailable';
      const retryAfterMs = Math.max(ipLimit.retryAfterMs, phoneLimit.retryAfterMs);
      return NextResponse.json(
        { detail: unavailable ? 'Authentication temporarily unavailable' : 'Too many requests' },
        {
          status: unavailable ? 503 : 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
        },
      );
    }

    if (!adminDb) {
      return NextResponse.json({ detail: 'Authentication temporarily unavailable' }, { status: 503 });
    }

    const botNumber = (process.env.WHATSAPP_BOT_NUMBER || process.env.WHATSAPP_BUSINESS_NUMBER || '')
      .replace(/\D/g, '');
    if (botNumber.length < 10 || botNumber.length > 15) {
      return NextResponse.json({ detail: 'Authentication temporarily unavailable' }, { status: 503 });
    }

    const token = crypto.randomBytes(16).toString('hex').toUpperCase();
    await adminDb.collection('auth_handshakes').doc(token).create({
      phone: normalizedPhone,
      purpose: 'phone_verification',
      expires_at: Date.now() + 10 * 60 * 1000,
      is_verified: false,
      consumed: false,
      consume_state: 'pending',
      created_at: Date.now(),
    });

    const redirectText = `Hey Ilara Cafe! Please verify my new signup session.\n\nRef: ${token}`;
    const redirectUrl = `https://wa.me/${botNumber}?text=${encodeURIComponent(redirectText)}`;

    return NextResponse.json({
      token,
      redirect_url: redirectUrl,
      expires_in_seconds: 600,
    });
  } catch (error) {
    console.error('Signup handshake error:', error);
    return NextResponse.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}
