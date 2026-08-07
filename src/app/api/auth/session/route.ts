import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { rateLimitDurable } from '@/lib/rateLimit';
import { resolveActorContext, type ActorContext } from '@/server/auth/resolveActor';
import {
  encryptTotpSecret,
  readTotpSecret,
  TotpConfigurationError,
  TotpResetRequiredError,
} from '@/server/auth/totpSecret';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { getHomeRouteForRole } from '@/lib/auth/roles';

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

function clearSessionResponse(): NextResponse {
  const response = NextResponse.json({ success: true, code: 'LOGGED_OUT' });
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

async function authenticateStaff(idToken: string): Promise<ActorContext | NextResponse> {
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { error: 'Authentication service temporarily unavailable.', code: 'AUTHENTICATION_UNAVAILABLE' },
      { status: 503 },
    );
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch (err: any) {
    console.error('verifyIdToken failed:', err?.message || err);
    return NextResponse.json(
      { error: 'Authentication token verification failed.', code: 'INVALID_ID_TOKEN' },
      { status: 401 },
    );
  }

  const resolution = await resolveActorContext(adminDb, decodedToken);
  if (!resolution.ok) {
    const reasonMessages: Record<string, { error: string; code: string; status: number }> = {
      stale_token: {
        error: 'Session expired. Please sign out and sign in again.',
        code: 'STALE_TOKEN',
        status: 401,
      },
      staff_inactive: {
        error: 'Staff account is inactive or suspended. Contact your manager.',
        code: 'STAFF_INACTIVE',
        status: 403,
      },
      invalid_role: {
        error: 'Your account role does not have staff access.',
        code: 'INVALID_ROLE',
        status: 403,
      },
      staff_record_required: {
        error: 'No staff record found for this account. Contact admin.',
        code: 'STAFF_RECORD_REQUIRED',
        status: 403,
      },
      account_inactive: {
        error: 'Account is suspended or disabled. Contact admin.',
        code: 'STAFF_INACTIVE',
        status: 403,
      },
      profile_not_found: {
        error: 'Account profile not found. Contact admin.',
        code: 'STAFF_RECORD_REQUIRED',
        status: 403,
      },
    };
    console.error(`[auth/session] Staff login denied — reason: ${resolution.reason} uid: ${decodedToken.uid}`);
    const mapped = reasonMessages[resolution.reason] ?? {
      error: 'Staff access required',
      code: 'STAFF_RECORD_REQUIRED',
      status: 403,
    };
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }

  if (resolution.actor.role === 'customer') {
    return NextResponse.json(
      { error: 'Staff access required. Customer logins cannot access staff portal.', code: 'STAFF_RECORD_REQUIRED' },
      { status: 403 },
    );
  }

  if (!resolution.actor.staffId) {
    console.error(`[auth/session] Staff login denied — no staffId on actor uid: ${decodedToken.uid}`);
    return NextResponse.json(
      { error: 'No staff record linked to this account. Contact admin.', code: 'STAFF_RECORD_REQUIRED' },
      { status: 403 },
    );
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
      {
        error: status === 500 ? 'Authentication check failed' : error instanceof Error ? error.message : 'Unauthorized',
        code: status === 401 ? 'UNAUTHORIZED' : 'AUTHENTICATION_UNAVAILABLE',
      },
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
      return NextResponse.json({ error: 'Invalid JSON request format', code: 'INVALID_REQUEST' }, { status: 400 });
    }

    const parsed = sessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid session request parameters', code: 'INVALID_REQUEST' }, { status: 400 });
    }

    if (parsed.data.action === 'logout') {
      return clearSessionResponse();
    }

    const actor = await authenticateStaff(parsed.data.idToken);
    if (actor instanceof NextResponse) return actor;
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable.', code: 'AUTHENTICATION_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const secretRef = adminDb.collection('admin_secrets').doc(actor.uid);

    if (parsed.data.action === 'init') {
      const secretDoc = await secretRef.get();

      if (secretDoc.exists && secretDoc.data()?.verified === true) {
        // Perform TOTP health check during init to catch decryption or configuration issues early
        try {
          readTotpSecret(actor.uid, secretDoc.data());
          return NextResponse.json({ require_totp: true, code: 'TOTP_REQUIRED' });
        } catch (error) {
          if (error instanceof TotpResetRequiredError) {
            return NextResponse.json(
              { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
              { status: 409 },
            );
          }
          if (error instanceof TotpConfigurationError) {
            return NextResponse.json(
              { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
              { status: 503 },
            );
          }
          return NextResponse.json(
            { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
            { status: 409 },
          );
        }
      }

      // Handle setup or re-setup if unverified secret exists
      let secret: string | null = null;
      if (secretDoc.exists) {
        try {
          secret = readTotpSecret(actor.uid, secretDoc.data());
        } catch (error) {
          if (error instanceof TotpConfigurationError) {
            return NextResponse.json(
              { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
              { status: 503 },
            );
          }
          // If existing unverified secret is unreadable, generate a fresh secret
          secret = null;
        }
      }

      if (!secret) {
        secret = authenticator.generateSecret();
      }

      let encryptedEnvelope;
      try {
        encryptedEnvelope = encryptTotpSecret(actor.uid, secret);
      } catch (error) {
        if (error instanceof TotpConfigurationError) {
          return NextResponse.json(
            { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
            { status: 503 },
          );
        }
        return NextResponse.json(
          { error: 'Two-factor authentication setup unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
          { status: 503 },
        );
      }

      await secretRef.set({
        secret_encrypted: encryptedEnvelope,
        verified: false,
        staff_id: actor.staffId,
        created_at: Date.now(),
      });

      const otpauth = authenticator.keyuri(
        actor.email || actor.staffId || actor.uid,
        'Ilara Cafe Staff',
        secret,
      );
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

      return NextResponse.json({
        setup_required: true,
        qrCodeDataUrl,
        code: 'TOTP_SETUP_REQUIRED',
      });
    }

    // action === 'verify'
    const attemptLimit = await rateLimitDurable(
      `staff-totp:${actor.uid}`,
      5,
      5 * 60 * 1000,
    );
    if (!attemptLimit.success) {
      const unavailable = attemptLimit.source === 'unavailable';
      return NextResponse.json(
        {
          error: unavailable ? 'Authentication temporarily unavailable' : 'Too many verification attempts',
          code: unavailable ? 'AUTHENTICATION_UNAVAILABLE' : 'RATE_LIMITED',
        },
        {
          status: unavailable ? 503 : 429,
          headers: { 'Retry-After': String(Math.ceil(attemptLimit.retryAfterMs / 1000)) },
        },
      );
    }

    const secretDoc = await secretRef.get();
    if (!secretDoc.exists) {
      return NextResponse.json({ error: '2FA setup required', code: 'TOTP_SETUP_REQUIRED' }, { status: 400 });
    }

    let secret: string | null = null;
    try {
      secret = readTotpSecret(actor.uid, secretDoc.data());
    } catch (error) {
      if (error instanceof TotpResetRequiredError) {
        return NextResponse.json(
          { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
          { status: 409 },
        );
      }
      if (error instanceof TotpConfigurationError) {
        return NextResponse.json(
          { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
        { status: 409 },
      );
    }

    if (typeof secret !== 'string' || !secret) {
      return NextResponse.json({ error: '2FA setup required', code: 'TOTP_SETUP_REQUIRED' }, { status: 400 });
    }

    authenticator.options = { window: 2 };
    const isValid = authenticator.verify({ token: parsed.data.totpCode, secret });
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid TOTP code', code: 'INVALID_TOTP' }, { status: 401 });
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
      redirectUrl: getHomeRouteForRole(actor.role),
      code: 'AUTHENTICATED',
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
    return NextResponse.json(
      { error: 'Internal server error during authentication.', code: 'AUTHENTICATION_UNAVAILABLE' },
      { status: 500 },
    );
  }
}
