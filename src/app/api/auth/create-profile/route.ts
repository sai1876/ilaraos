import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { USERS_COL } from '@/lib/firebase/collections';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const MAX_BODY_BYTES = 12 * 1024;
const profileSchema = z.object({
  phone: z.string().min(10).max(24),
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  referredBy: z.string().trim().max(64).optional().default(''),
  handshakeToken: z.string().regex(/^[A-Fa-f0-9]{32}$/),
}).strict();

class ProfileCreationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }
    if (!adminDb || !adminAuth) {
      return NextResponse.json({ detail: 'Authentication temporarily unavailable' }, { status: 503 });
    }

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
    const parsed = profileSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ detail: 'Invalid request' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7), true);
    } catch {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const [ipLimit, actorLimit] = await Promise.all([
      rateLimitDurable(`create-profile-ip:${ip}`, 10, 15 * 60 * 1000),
      rateLimitDurable(`create-profile-uid:${decodedToken.uid}`, 3, 15 * 60 * 1000),
    ]);
    if (!ipLimit.success || !actorLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || actorLimit.source === 'unavailable';
      return NextResponse.json(
        { detail: unavailable ? 'Authentication temporarily unavailable' : 'Too many requests' },
        { status: unavailable ? 503 : 429 },
      );
    }

    const decodedEmail = decodedToken.email?.toLowerCase().trim();
    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const normalizedPhone = parsed.data.phone.replace(/\D/g, '');
    if (!decodedEmail || normalizedEmail !== decodedEmail || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return NextResponse.json({ detail: 'Profile verification failed' }, { status: 403 });
    }

    const userId = decodedToken.uid;
    const db = adminDb;
    const userRef = db.collection(USERS_COL).doc(userId);
    const handshakeToken = parsed.data.handshakeToken.toUpperCase();
    const handshakeRef = db.collection('auth_handshakes').doc(handshakeToken);
    const phoneQuery = db.collection(USERS_COL).where('phone_normalized', '==', normalizedPhone).limit(1);
    const legacyPhoneQuery = db.collection(USERS_COL)
      .where('phone', 'in', [normalizedPhone, `+${normalizedPhone}`])
      .limit(1);
    const referralCode = `ILARA_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const newProfile = {
      user_id: userId,
      phone: normalizedPhone,
      phone_normalized: normalizedPhone,
      name: parsed.data.name,
      student_email: normalizedEmail,
      email: normalizedEmail,
      email_verified: false,
      points: 100,
      referral_code: referralCode,
      referred_by: parsed.data.referredBy,
      account_status: 'inactive',
      status: 'inactive',
      is_active: false,
      is_email_verified: false,
      created_at: Date.now(),
    };

    await db.runTransaction(async transaction => {
      const [handshakeDoc, existingUser, phoneMatches, legacyPhoneMatches] = await Promise.all([
        transaction.get(handshakeRef),
        transaction.get(userRef),
        transaction.get(phoneQuery),
        transaction.get(legacyPhoneQuery),
      ]);
      if (existingUser.exists) {
        throw new ProfileCreationError(409, 'Profile already exists');
      }
      if (!phoneMatches.empty || !legacyPhoneMatches.empty) {
        throw new ProfileCreationError(409, 'Profile cannot be created');
      }
      if (!handshakeDoc.exists) {
        throw new ProfileCreationError(403, 'Profile verification failed');
      }

      const handshake = handshakeDoc.data()!;
      const handshakePhone = typeof handshake.phone === 'string' ? handshake.phone.replace(/\D/g, '') : '';
      if (
        handshake.purpose !== 'phone_verification'
        || handshake.is_verified !== true
        || handshakePhone !== normalizedPhone
        || typeof handshake.expires_at !== 'number'
        || handshake.expires_at < Date.now()
        || handshake.consumed === true
        || Boolean(handshake.consumed_by)
      ) {
        throw new ProfileCreationError(403, 'Profile verification failed');
      }

      transaction.set(userRef, newProfile);
      transaction.update(handshakeRef, {
        consumed: true,
        consumed_by: userId,
        consumed_at: Date.now(),
        consume_state: 'consumed',
      });
    });

    await logBusinessEvent({
      event_type: 'profile_created',
      actor_type: 'customer',
      actor_id: userId,
      target_type: 'user',
      target_id: userId,
      severity: 'info',
      source: 'api',
      metadata: { hasReferredBy: Boolean(parsed.data.referredBy) },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ProfileCreationError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    console.error('Create profile error:', error);
    return NextResponse.json({ detail: 'Internal server error processing profile creation' }, { status: 500 });
  }
}
