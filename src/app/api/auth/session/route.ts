import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { rateLimitDurable } from '@/lib/rateLimit';
import { resolveActorContext } from '@/server/auth/resolveActor';
import {
  encryptTotpSecret,
  readTotpSecret,
  TotpResetRequiredError,
} from '@/server/auth/totpSecret';
import { requireSessionActor, SessionAuthorizationError } from '@/server/auth/requireSessionActor';
import { getHomeRouteForRole } from '@/lib/auth/roles';
import {
  createPreAuthChallenge,
  verifyPreAuthChallenge,
  PREAUTH_COOKIE_NAME,
} from '@/server/auth/preAuthChallenge';

const sessionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('init'),
    idToken: z.string().min(1),
  }),
  z.object({
    action: z.literal('verify'),
    idToken: z.string().optional(),
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
  response.cookies.set(PREAUTH_COOKIE_NAME, '', {
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return response;
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
  const reqStart = Date.now();
  const timings: Record<string, number> = {};

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

    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable.', code: 'AUTHENTICATION_UNAVAILABLE' },
        { status: 503 },
      );
    }

    // --- STAGE 1: INIT ACTION ---
    if (parsed.data.action === 'init') {
      const tokenStart = Date.now();
      let decodedToken;
      try {
        decodedToken = await adminAuth.verifyIdToken(parsed.data.idToken, true);
      } catch (err: any) {
        console.error('[auth/session] verifyIdToken failed:', err?.message || err);
        return NextResponse.json(
          { error: 'Authentication token verification failed.', code: 'INVALID_ID_TOKEN' },
          { status: 401 },
        );
      }
      timings.verify_id_token = Date.now() - tokenStart;

      // Resolve Actor Context first
      const initFetchStart = Date.now();
      const resolution = await resolveActorContext(adminDb, decodedToken);
      timings.actor_resolution = Date.now() - initFetchStart;

      if (!resolution.ok) {
        return NextResponse.json({ error: 'Staff access required', code: 'STAFF_RECORD_REQUIRED' }, { status: 403 });
      }

      const actor = resolution.actor;
      if (actor.role === 'customer' || !actor.staffId) {
        return NextResponse.json({ error: 'Staff access required', code: 'STAFF_RECORD_REQUIRED' }, { status: 403 });
      }

      const secretDoc = await adminDb.collection('admin_secrets').doc(actor.uid).get();

      // Generate HMAC Signed Pre-Auth Challenge Cookie
      const challenge = createPreAuthChallenge({
        uid: actor.uid,
        staffId: actor.staffId,
        role: actor.role,
        outletId: actor.outletId || 'main',
        tokenVersion: actor.tokenVersion,
      });

      let responsePayload: any;

      if (secretDoc.exists && secretDoc.data()?.verified === true) {
        try {
          readTotpSecret(actor.uid, secretDoc.data());
          responsePayload = { require_totp: true, code: 'TOTP_REQUIRED' };
        } catch (error) {
          if (error instanceof TotpResetRequiredError) {
            return NextResponse.json(
              { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
              { status: 409 },
            );
          }
          return NextResponse.json(
            { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
            { status: 503 },
          );
        }
      } else {
        // Setup TOTP if unverified or missing
        let secret: string | null = null;
        if (secretDoc.exists) {
          try {
            secret = readTotpSecret(actor.uid, secretDoc.data());
          } catch {}
        }

        if (!secret) {
          secret = authenticator.generateSecret();
        }

        const encryptedEnvelope = encryptTotpSecret(actor.uid, secret);

        await adminDb.collection('admin_secrets').doc(actor.uid).set({
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

        responsePayload = {
          setup_required: true,
          qrCodeDataUrl,
          code: 'TOTP_SETUP_REQUIRED',
        };
      }

      const response = NextResponse.json(responsePayload);
      response.cookies.set(challenge.cookieName, challenge.token, {
        maxAge: 120, // 2 minutes max
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      timings.total = Date.now() - reqStart;
      response.headers.set('Server-Timing', Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(', '));
      return response;
    }

    // --- STAGE 2: VERIFY ACTION ---
    // Fast path: Check pre-auth challenge cookie first
    const cookieHeader = request.headers.get('cookie') || '';
    const cookiesMap = new Map(cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }));

    const preAuthToken = cookiesMap.get(PREAUTH_COOKIE_NAME);
    const preAuthValStart = Date.now();
    const preAuth = verifyPreAuthChallenge(preAuthToken);
    timings.preauth_validation = Date.now() - preAuthValStart;

    let targetUid: string;
    let targetRole: string;
    let targetStaffId: string;
    let fallbackIdToken = parsed.data.idToken;

    if (preAuth) {
      targetUid = preAuth.uid;
      targetRole = preAuth.role;
      targetStaffId = preAuth.staffId;
    } else if (fallbackIdToken) {
      // Fallback: verify ID token if pre-auth cookie is missing
      let decodedToken;
      try {
        decodedToken = await adminAuth.verifyIdToken(fallbackIdToken, true);
      } catch (err) {
        return NextResponse.json({ error: 'Session expired. Please sign in again.', code: 'STALE_TOKEN' }, { status: 401 });
      }
      const resolution = await resolveActorContext(adminDb, decodedToken);
      if (!resolution.ok || resolution.actor.role === 'customer' || !resolution.actor.staffId) {
        return NextResponse.json({ error: 'Staff access required', code: 'STAFF_RECORD_REQUIRED' }, { status: 403 });
      }
      targetUid = resolution.actor.uid;
      targetRole = resolution.actor.role;
      targetStaffId = resolution.actor.staffId;
    } else {
      return NextResponse.json({ error: 'Pre-authentication challenge expired. Please enter password again.', code: 'PREAUTH_EXPIRED' }, { status: 401 });
    }

    // Rate Limit Guard
    const attemptLimit = await rateLimitDurable(`staff-totp:${targetUid}`, 5, 5 * 60 * 1000);
    if (!attemptLimit.success) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(attemptLimit.retryAfterMs / 1000)) } },
      );
    }

    // Parallelize Fast Staff Access & Admin Secret Read
    const fastFetchStart = Date.now();
    const [accessDoc, secretDoc] = await Promise.all([
      adminDb.collection('staff_access').doc(targetUid).get(),
      adminDb.collection('admin_secrets').doc(targetUid).get(),
    ]);
    timings.fast_db_read = Date.now() - fastFetchStart;

    if (!secretDoc.exists) {
      return NextResponse.json({ error: '2FA setup required', code: 'TOTP_SETUP_REQUIRED' }, { status: 400 });
    }

    // Check staff account active
    if (accessDoc.exists) {
      const access = accessDoc.data();
      if (access?.status === 'inactive' || access?.status === 'suspended') {
        return NextResponse.json({ error: 'Staff account inactive', code: 'STAFF_INACTIVE' }, { status: 403 });
      }
    }

    let secret: string | null = null;
    try {
      secret = readTotpSecret(targetUid, secretDoc.data());
    } catch (error) {
      if (error instanceof TotpResetRequiredError) {
        return NextResponse.json(
          { error: 'Two-factor authentication must be re-enrolled.', code: 'TOTP_RESET_REQUIRED' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: 'Two-factor authentication is temporarily unavailable.', code: 'TOTP_CONFIGURATION_ERROR' },
        { status: 503 },
      );
    }

    if (typeof secret !== 'string' || !secret) {
      return NextResponse.json({ error: '2FA setup required', code: 'TOTP_SETUP_REQUIRED' }, { status: 400 });
    }

    // TOTP Verification
    const totpVerifyStart = Date.now();
    authenticator.options = { window: 2 };
    const isValid = authenticator.verify({ token: parsed.data.totpCode, secret });
    timings.totp_verify = Date.now() - totpVerifyStart;

    if (!isValid) {
      return NextResponse.json({ error: 'That code wasn\'t accepted. Enter the current code from Authenticator.', code: 'INVALID_TOTP' }, { status: 401 });
    }

    // Async secret update in background
    adminDb.collection('admin_secrets').doc(targetUid).update({
      verified: true,
      last_verified_at: Date.now(),
      staff_id: targetStaffId,
    }).catch(err => console.error('Failed to update TOTP last_verified_at:', err));

    // Session Cookie Creation
    const sessionCookieStart = Date.now();

    // If fallbackIdToken is available, create session cookie with it, else mint custom token session
    let sessionCookie: string;
    if (fallbackIdToken) {
      sessionCookie = await adminAuth!.createSessionCookie(fallbackIdToken, { expiresIn: SESSION_EXPIRES_IN_MS });
    } else {
      const customToken = await adminAuth!.createCustomToken(targetUid, { role: targetRole });
      sessionCookie = await adminAuth!.createSessionCookie(customToken, { expiresIn: SESSION_EXPIRES_IN_MS }).catch(async () => {
        return adminAuth!.createSessionCookie(await adminAuth!.createCustomToken(targetUid), { expiresIn: SESSION_EXPIRES_IN_MS });
      });
    }
    timings.session_cookie = Date.now() - sessionCookieStart;

    const redirectUrl = getHomeRouteForRole(targetRole);

    const response = NextResponse.json({
      success: true,
      redirectUrl,
      code: 'AUTHENTICATED',
    });

    // Set __session cookie & clear pre-auth challenge cookie
    response.cookies.set('__session', sessionCookie, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    response.cookies.set(PREAUTH_COOKIE_NAME, '', {
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    timings.total = Date.now() - reqStart;
    response.headers.set('Server-Timing', Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(', '));
    return response;
  } catch (error: any) {
    console.error('Session authentication error:', error);
    return NextResponse.json(
      { error: 'Internal server error during authentication.', code: 'AUTHENTICATION_UNAVAILABLE' },
      { status: 500 },
    );
  }
}
