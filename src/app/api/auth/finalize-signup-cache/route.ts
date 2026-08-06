import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { USERS_COL } from '@/lib/firebase/collections';
import { POINT_LEDGER_EXPIRY_DAYS } from '@/lib/constants';
import { FieldValue } from 'firebase-admin/firestore';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { rateLimitDurable } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!adminDb || !adminAuth) {
      return NextResponse.json({ detail: 'Firebase Admin not configured' }, { status: 500 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken, true);
    } catch {
      return NextResponse.json({ detail: 'Invalid Firebase ID token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Rate limits to prevent sign-up abuse
    const [ipLimit, actorLimit] = await Promise.all([
      rateLimitDurable(`finalize-signup-ip:${ip}`, 20, 15 * 60 * 1000),
      rateLimitDurable(`finalize-signup-uid:${userId}`, 5, 15 * 60 * 1000),
    ]);
    if (!ipLimit.success || !actorLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || actorLimit.source === 'unavailable';
      return NextResponse.json(
        { detail: unavailable ? 'Authentication temporarily unavailable' : 'Too many requests' },
        { status: unavailable ? 503 : 429 },
      );
    }

    const db = adminDb;
    const userRef = db.collection(USERS_COL).doc(userId);

    // Read the trusted Firestore profile
    let userDoc = await userRef.get();
    const authUser = await adminAuth.getUser(userId);

    if (!userDoc.exists) {
      const email = authUser.email || '';
      const phone = authUser.phoneNumber || '';
      const name = authUser.displayName || email.split('@')[0] || 'New User';

      const newProfile = {
        user_id: userId,
        email,
        phone,
        name,
        is_active: true,
        account_status: 'active',
        status: 'active',
        points: 0,
        referral_code: 'HAUHAU_' + userId.slice(0, 6).toUpperCase(),
        created_at: Date.now(),
        updated_at: Date.now()
      };

      await userRef.set(newProfile);
      userDoc = await userRef.get();
    }

    const userData = userDoc.data()!;
    const profileActive = userData.is_active === true
      && userData.account_status === 'active'
      && userData.status === 'active';
    if (authUser.disabled || !authUser.emailVerified || !profileActive) {
      return NextResponse.json({ detail: 'Profile is not active' }, { status: 403 });
    }

    const phone = userData.phone;
    const email = userData.email || userData.student_email;
    const referredBy = userData.referred_by;

    // (Redis cache writes removed — no external Redis instance)

    // --- IDEMPOTENT TRANSACTIONAL REWARDS CREATION ---
    let selfReferralAttempted = false;
    await db.runTransaction(async (transaction) => {
      // 1. Check if welcome bonus already exists
      const welcomeQuery = db.collection('point_ledger')
        .where('user_id', '==', userId)
        .where('source', '==', 'welcome_bonus')
        .limit(1);

      const welcomeCheck = await transaction.get(welcomeQuery);

      const expDate = new Date();
      expDate.setDate(expDate.getDate() + POINT_LEDGER_EXPIRY_DAYS);

      if (welcomeCheck.empty) {
        const welcomeLedgerRef = db.collection('point_ledger').doc();
        transaction.set(welcomeLedgerRef, {
          user_id: userId,
          amount: 100,
          original_amount: 100,
          source: 'welcome_bonus',
          expires_at: expDate.toISOString(),
          is_expired: false,
          created_at: Date.now()
        });
      }

      // 2. Process Referral Bonus idempotently
      if (referredBy) {
        let referrerRef = null;
        let querySnapshot = await db.collection(USERS_COL).where("referral_code", "==", referredBy).limit(1).get();
        if (querySnapshot.empty && referredBy.startsWith("ILARA_")) {
          const fallbackCode = "ILARA_" + referredBy.substring(6);
          querySnapshot = await db.collection(USERS_COL).where("referral_code", "==", fallbackCode).limit(1).get();
        }

        if (!querySnapshot.empty) {
          const referrerDoc = querySnapshot.docs[0];
          const referrerData = referrerDoc.data();
          const referrerId = referrerDoc.id;

          const referrerPhone = (referrerData.phone || '').replace(/\D/g, '');
          const referrerEmail = (referrerData.email || referrerData.student_email || '').toLowerCase().trim();
          const userPhone = (phone || '').replace(/\D/g, '');
          const userEmail = (email || '').toLowerCase().trim();

          if (referrerId === userId || referrerPhone === userPhone || referrerEmail === userEmail) {
            selfReferralAttempted = true;
          } else {
            referrerRef = db.collection(USERS_COL).doc(referrerId);
          }
        }

        if (referrerRef) {
          // Check if referral bonus was already awarded for this SPECIFIC new user
          const referralQuery = db.collection('point_ledger')
            .where('user_id', '==', referrerRef.id)
            .where('source', '==', 'referral_bonus')
            .where('referred_user_id', '==', userId)
            .limit(1);

          const referralCheck = await transaction.get(referralQuery);

          if (referralCheck.empty) {
            transaction.update(referrerRef, {
              points: FieldValue.increment(50)
            });

            const referrerLedgerRef = db.collection('point_ledger').doc();
            transaction.set(referrerLedgerRef, {
              user_id: referrerRef.id,
              referred_user_id: userId,
              amount: 50,
              original_amount: 50,
              source: 'referral_bonus',
              expires_at: expDate.toISOString(),
              is_expired: false,
              created_at: Date.now()
            });
          }
        }
      }
    });

    if (selfReferralAttempted) {
      await logBusinessEvent({
        event_type: 'self_referral_attempt',
        actor_type: 'customer',
        actor_id: userId,
        target_type: 'user',
        target_id: userId,
        severity: 'warning',
        source: 'api',
        metadata: { referred_by: referredBy || '' }
      });
    }

    await logBusinessEvent({
      event_type: 'signup_finalized',
      actor_type: 'customer',
      actor_id: userId,
      target_type: 'user',
      target_id: userId,
      severity: 'info',
      source: 'api',
      metadata: {
        cacheCleared: true,
        selfReferralAttempted
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Finalize signup cache error:", error);
    return NextResponse.json({ detail: 'Internal server error processing finalization' }, { status: 500 });
  }
}
