import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { rateLimitDurable } from '@/lib/rateLimit';
import { resolveActorContext, type ActorContext } from '@/server/auth/resolveActor';
import { encryptTotpSecret, readTotpSecret } from '@/server/auth/totpSecret';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';

const sessionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('init'),
    idToken: z.string().min(1),
  }),
  z.object({
    action: z.literal('verify'),
    idToken: z.string().min(1),
    totpCode: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal('logout'),
    idToken: z.string().optional(),
  }),
]);

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;
const SESSION_EXPIRES_IN_MS = SESSION_MAX_AGE_SECONDS * 1000;
const KITCHEN_ROLES = new Set([
  'staff',
  'kitchen',
  'chef',
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
]);

function clearSessionResponse(): NextResponse {
  const response = NextResponse.json({ success: true });
  response.cookies.set('__session', '', {
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return response;
}

function redirectForActor(actor: ActorContext): string {
  if (KITCHEN_ROLES.has(actor.role)) return '/kds';
  if (actor.role === 'rider') return '/delivery';
  if (actor.role === 'manager') return '/manager';
  return '/admin';
}

async function authenticateStaff(idToken: string): Promise<ActorContext | NextResponse> {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 });
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch (err: any) {
    console.error("verifyIdToken failed:", err);
    return NextResponse.json({ error: `Auth verification failed: ${err?.message || err}` }, { status: 401 });
  }

  const resolution = await resolveActorContext(adminDb, decodedToken);
  if (!resolution.ok) {
    const reasonMessages: Record<string, { error: string; status: number }> = {
      stale_token:          { error: 'Session expired. Please sign out and sign in again.', status: 401 },
      staff_inactive:       { error: 'Staff account is inactive or suspended. Contact your manager.', status: 403 },
      invalid_role:         { error: 'Your account role does not have staff access.', status: 403 },
      staff_record_required:{ error: 'No staff record found for this account. Contact admin.', status: 403 },
      account_inactive:     { error: 'Account is suspended or disabled. Contact admin.', status: 403 },
      profile_not_found:    { error: 'Account profile not found. Contact admin.', status: 403 },
    };
    console.error(`[auth/session] Staff login denied — reason: ${resolution.reason} uid: ${decodedToken.uid}`);
    const mapped = reasonMessages[resolution.reason] ?? { error: 'Staff access required', status: 403 };
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  if (!resolution.actor.staffId) {
    console.error(`[auth/session] Staff login denied — no staffId on actor uid: ${decodedToken.uid}`);
    return NextResponse.json({ error: 'No staff record linked to this account. Contact admin.' }, { status: 403 });
  }

  return resolution.actor;
}


export async function DELETE() {
  return clearSessionResponse();
}

export async function GET() {
  try {
    const actor = await requireSessionActor(['staff']);
    return NextResponse.json({
      actor: {
        uid: actor.uid,
        role: actor.role,
        staff_id: actor.staffId,
        outlet_id: actor.outletId,
      },
    });
  } catch (error) {
    const status = error instanceof SessionAuthorizationError ? error.status : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Authentication check failed' : error instanceof Error ? error.message : 'Unauthorized' },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = sessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (parsed.data.action === 'logout') {
      return clearSessionResponse();
    }

    const actor = await authenticateStaff(parsed.data.idToken);
    if (actor instanceof NextResponse) return actor;
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 });
    }

    const secretRef = adminDb.collection('admin_secrets').doc(actor.uid);

    if (parsed.data.action === 'init') {
      const secretDoc = await secretRef.get();

      if (secretDoc.exists && secretDoc.data()?.verified === true) {
        return NextResponse.json({ require_totp: true });
      }

      const secret = secretDoc.exists
        ? readTotpSecret(actor.uid, secretDoc.data())
        : authenticator.generateSecret();

      if (typeof secret !== 'string' || !secret) {
        return NextResponse.json({ error: '2FA setup unavailable' }, { status: 500 });
      }

      if (!secretDoc.exists) {
        await secretRef.set({
          secret_encrypted: encryptTotpSecret(actor.uid, secret),
          verified: false,
          staff_id: actor.staffId,
          created_at: Date.now(),
        });
      }

      const otpauth = authenticator.keyuri(
        actor.email || actor.staffId || actor.uid,
        'Ilara Cafe Staff',
        secret,
      );
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

      return NextResponse.json({
        setup_required: true,
        qrCodeDataUrl,
        secret,
      });
    }

    const attemptLimit = await rateLimitDurable(
      `staff-totp:${actor.uid}`,
      5,
      5 * 60 * 1000,
    );
    if (!attemptLimit.success) {
      const unavailable = attemptLimit.source === 'unavailable';
      return NextResponse.json(
        { error: unavailable ? 'Authentication temporarily unavailable' : 'Too many verification attempts' },
        {
          status: unavailable ? 503 : 429,
          headers: { 'Retry-After': String(Math.ceil(attemptLimit.retryAfterMs / 1000)) },
        },
      );
    }

    const secretDoc = await secretRef.get();
    const secret = secretDoc.exists ? readTotpSecret(actor.uid, secretDoc.data()) : null;
    if (typeof secret !== 'string' || !secret) {
      return NextResponse.json({ error: '2FA setup required' }, { status: 400 });
    }

    authenticator.options = { window: 2 };
    const isValid = authenticator.verify({ token: parsed.data.totpCode, secret });
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
    }

    await secretRef.update({
      verified: true,
      last_verified_at: Date.now(),
      staff_id: actor.staffId,
    });

    const sessionCookie = await adminAuth.createSessionCookie(
      parsed.data.idToken,
      { expiresIn: SESSION_EXPIRES_IN_MS },
    );

    const response = NextResponse.json({
      success: true,
      redirectUrl: redirectForActor(actor),
    });
    response.cookies.set('__session', sessionCookie, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Session authentication error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message || 'Unknown API failure'}` }, { status: 500 });
  }
}
