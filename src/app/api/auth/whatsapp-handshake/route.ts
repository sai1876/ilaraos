// [PUBLIC] - Initiates a rate-limited WhatsApp signup proof.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { createSignupChallenge, canonicalizePhone, generateHighEntropySecret, hashSecret } from '@/server/auth/whatsappChallenge';
import { cookies } from 'next/headers';

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

    const canonicalPhone = canonicalizePhone(parsed.data.phone);
    if (!canonicalPhone) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const phoneHash = crypto.createHash('sha256').update(canonicalPhone).digest('hex');
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

    // 2. Generate Challenge
    const browserBindingSecret = generateHighEntropySecret();
    const browserBindingHash = hashSecret(browserBindingSecret);
    
    const { challengeId, verifier } = await createSignupChallenge(canonicalPhone, browserBindingHash);
    
    // 3. Set binding cookie
    const cookieStore = cookies();
    cookieStore.set('__wa_auth_bind', browserBindingSecret, {
      maxAge: 10 * 60, // 10 mins matching challenge expiry
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    const redirectText = `Hey Ilara Cafe! Please verify my new signup session.\n\nVERIFY Ref: ${challengeId}.${verifier}`;
    const redirectUrl = `https://wa.me/${botNumber}?text=${encodeURIComponent(redirectText)}`;

    return NextResponse.json({
      token: challengeId, // returned as token for compatibility
      redirect_url: redirectUrl,
      expires_in_seconds: 600,
    });
  } catch (error) {
    console.error('Signup handshake error:', error);
    return NextResponse.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}
