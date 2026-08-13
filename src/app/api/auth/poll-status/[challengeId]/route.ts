// [PUBLIC] - Polling status for authentication
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { rateLimitDurable } from '@/lib/rateLimit';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { cookies } from 'next/headers';
import { 
  getChallengePollState, 
  reservePasswordlessBootstrap, 
  releasePasswordlessBootstrapReservation, 
  markPasswordlessBootstrapIssued 
} from '@/server/auth/whatsappChallenge';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

async function logConsumeFailure(uid: string, token: string, reason: string) {
  await logBusinessEvent({
    event_type: 'passwordless_login_consume_failed',
    actor_type: 'system',
    actor_id: uid || 'system',
    target_type: 'whatsapp_challenge',
    target_id: token,
    severity: 'critical',
    source: 'api',
    metadata: { reason },
  });
}

export async function GET(req: Request, { params }: { params: { challengeId: string } }) {
  try {
    const challengeId = params.challengeId;
    if (!challengeId || challengeId.length < 16) {
      return NextResponse.json({ is_phone_verified: false }, { status: 400, headers: noStoreHeaders });
    }

    const cookieStore = cookies();
    const bindingSecret = cookieStore.get('__wa_auth_bind')?.value;
    if (!bindingSecret) {
      return NextResponse.json({ is_phone_verified: false }, { status: 400, headers: noStoreHeaders });
    }
    const browserBindingHash = crypto.createHash('sha256').update(bindingSecret).digest('hex');

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const tokenHash = crypto.createHash('sha256').update(challengeId).digest('hex');
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

    // Check challenge state
    const pollState = await getChallengePollState(challengeId, browserBindingHash);
    if (!pollState.success) {
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    if (pollState.purpose === 'phone_verification') {
      // DO NOT CONSUME. Only report verified status
      if (pollState.status === 'verified') {
        return NextResponse.json({ is_phone_verified: true }, { headers: noStoreHeaders });
      }
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    // Passwordless Flow
    if (pollState.status === 'bootstrap_issued') {
      // NEVER remint. User must restart if lost
      return NextResponse.json({ is_phone_verified: false, require_restart: true }, { headers: noStoreHeaders });
    }

    if (pollState.status !== 'verified' && pollState.status !== 'consuming') {
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    // Attempt to reserve bootstrap
    const reserveRes = await reservePasswordlessBootstrap(challengeId, browserBindingHash, 5000);
    if (!reserveRes.success) {
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    const { leaseId, uid } = reserveRes;

    if (!uid) {
      await releasePasswordlessBootstrapReservation(challengeId, leaseId!);
      await logConsumeFailure('system', challengeId, 'missing_uid');
      // For dummy challenge, it stays verified to pretend everything is fine, 
      // but no token is ever issued. The UI will eventually time out.
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const accountStatus = String(userData?.account_status || userData?.status || '').toLowerCase();
    if (!userDoc.exists || accountStatus !== 'active' || userData?.is_active === false) {
      await releasePasswordlessBootstrapReservation(challengeId, leaseId!);
      await logConsumeFailure(uid, challengeId, 'inactive_account');
      return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
    }

    try {
      const authUser = await getAuth().getUser(uid);
      if (authUser.disabled) {
        await releasePasswordlessBootstrapReservation(challengeId, leaseId!);
        await logConsumeFailure(uid, challengeId, 'disabled_account');
        return NextResponse.json({ is_phone_verified: false }, { headers: noStoreHeaders });
      }

      // Mint bootstrap custom token
      const customToken = await getAuth().createCustomToken(uid);
      
      // Mark issued
      const issued = await markPasswordlessBootstrapIssued(challengeId, leaseId!);
      if (!issued) {
        throw new Error('Failed to mark bootstrap issued');
      }

      await logBusinessEvent({
        event_type: 'passwordless_login_bootstrap_issued',
        actor_type: 'customer',
        actor_id: uid,
        target_type: 'whatsapp_challenge',
        target_id: challengeId,
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
      console.error(`[POLL STATUS ERROR] challenge: ${challengeId}`, error);
      await releasePasswordlessBootstrapReservation(challengeId, leaseId!);
      await logConsumeFailure(uid, challengeId, 'custom_token_failure');
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
