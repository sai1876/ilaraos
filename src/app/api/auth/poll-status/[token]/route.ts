// [PUBLIC] - Polling status for authentication
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

async function logConsumeFailure(uid: string, token: string, reason: string) {
  await logBusinessEvent({
    event_type: 'passwordless_login_consume_failed',
    actor_type: 'system',
    actor_id: uid || 'system',
    target_type: 'auth_handshake',
    target_id: `${token.substring(0, 4)}****`,
    severity: 'critical',
    source: 'api',
    metadata: { reason },
  });
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const token = params.token.toUpperCase();
    // Legacy 8-character tokens are not supported.
    if (token.length !== 32 || !/^[A-F0-9]{32}$/.test(token)) {
      return NextResponse.json({ is_phone_verified: false }, { status: 400, headers: noStoreHeaders });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [ipLimit, tokenLimit] = await Promise.all([
      rateLimitDurable(`poll-auth-ip:${ip}`, 600, 10 * 60 * 1000),
      rateLimitDurable(`poll-auth-token:${tokenHash}`, 250, 10 * 60 * 1000),
    ]);
    if (!ipLimit.success || !tokenLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || tokenLimit.source === 'unavailable';
      return NextResponse.json(
        { is_phone_verified: false },
        { status: unavailable ? 503 : 429, headers: noStoreHeaders },
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { is_phone_verified: false },
        { status: 503, headers: noStoreHeaders },
      );
    }

    const handshakeRef = adminDb.collection('auth_handshakes').doc(token);
    const reservation = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(handshakeRef);
      if (!snapshot.exists) return { status: 'invalid' as const };

      const data = snapshot.data()!;
      const purpose = data.purpose;
      if (!['phone_verification', 'passwordless_login'].includes(purpose)) {
        return { status: 'invalid' as const };
      }
      if (typeof data.expires_at !== 'number' || Date.now() > data.expires_at) {
        return { status: 'invalid' as const, purpose, uid: data.uid };
      }
      if (data.is_verified !== true) {
        return { status: 'pending' as const };
      }

      if (purpose === 'phone_verification') {
        if (data.consumed === true || data.consumed_by) {
          return { status: 'invalid' as const };
        }
        return { status: 'verified' as const, purpose, data };
      }

      if (data.used === true || ['consuming', 'consumed', 'consume_failed'].includes(data.consume_state)) {
        return { status: 'invalid' as const, purpose, uid: data.uid };
      }
      transaction.update(handshakeRef, { consume_state: 'consuming' });
      return { status: 'verified' as const, purpose, data };
    });

    if (reservation.status !== 'verified') {
      if (reservation.status === 'invalid' && reservation.purpose === 'passwordless_login') {
        await logBusinessEvent({
          event_type: 'passwordless_login_poll_failed',
          actor_type: 'system',
          actor_id: typeof reservation.uid === 'string' ? reservation.uid : 'system',
          target_type: 'auth_handshake',
          target_id: `${token.substring(0, 4)}****`,
          severity: 'warning',
          source: 'api',
          metadata: {},
        });
      }
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }
    if (reservation.purpose === 'phone_verification') {
      return NextResponse.json({ is_phone_verified: true }, { headers: noStoreHeaders });
    }

    const uid = reservation.data.uid;
    if (typeof uid !== 'string' || !uid) {
      await handshakeRef.update({ consume_state: 'consume_failed' });
      await logConsumeFailure('', token, 'missing_uid');
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const accountStatus = String(userData?.account_status || userData?.status || '').toLowerCase();
    if (!userDoc.exists || accountStatus !== 'active' || userData?.is_active === false) {
      await handshakeRef.update({ consume_state: 'consume_failed' });
      await logConsumeFailure(uid, token, 'inactive_account');
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    try {
      const authUser = await getAuth().getUser(uid);
      if (authUser.disabled) {
        await handshakeRef.update({ consume_state: 'consume_failed' });
        await logConsumeFailure(uid, token, 'disabled_account');
        return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
      }

      const customToken = await getAuth().createCustomToken(uid);
      await handshakeRef.update({
        used: true,
        consume_state: 'consumed',
        used_at: Date.now(),
      });

      await logBusinessEvent({
        event_type: 'passwordless_login_consumed',
        actor_type: 'customer',
        actor_id: uid,
        target_type: 'auth_handshake',
        target_id: `${token.substring(0, 4)}****`,
        severity: 'info',
        source: 'api',
        metadata: {},
      });

      return NextResponse.json({
        is_phone_verified: true,
        custom_token: customToken,
        user_profile: {
          uid,
          name: userData?.name || userData?.display_name || '',
          role: 'customer',
          account_status: 'active',
          points: Number(userData?.points) || 0,
        },
      }, { headers: noStoreHeaders });
    } catch (error) {
      console.error(`[POLL STATUS ERROR] token: ${token.substring(0, 4)}****`, error);
      await handshakeRef.update({ consume_state: 'consume_failed' });
      await logConsumeFailure(uid, token, 'custom_token_failure');
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }
  } catch (error) {
    console.error('Poll status error:', error);
    return NextResponse.json(
      { is_phone_verified: false },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
