export interface FulfillmentRewardResult {
  orderUpdates: Record<string, unknown>;
  pointsEarned: number;
}

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export async function awardFulfillmentRewards(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  orderId: string,
  order: Record<string, unknown>,
): Promise<FulfillmentRewardResult> {
  if (order.points_awarded === true) {
    return { orderUpdates: {}, pointsEarned: finiteNumber(order.points_earned, 0) };
  }

  const userId = typeof order.user_id === 'string' ? order.user_id : '';
  if (!userId) {
    return {
      orderUpdates: { points_awarded: true, points_earned: 0, points_reward_status: 'skipped_missing_user' },
      pointsEarned: 0,
    };
  }

  const userRef = db.collection('users').doc(userId);
  const userSnapshot = await transaction.get(userRef);
  if (!userSnapshot.exists) {
    return {
      orderUpdates: { points_awarded: true, points_earned: 0, points_reward_status: 'skipped_missing_user' },
      pointsEarned: 0,
    };
  }

  const user = userSnapshot.data()!;
  const completedOrders = Math.max(0, Math.floor(finiteNumber(user.total_completed_orders, 0))) + 1;
  const rewardRate = completedOrders <= 3 ? 0.15 : completedOrders <= 5 ? 0.10 : 0.08;
  const pointsEarned = Math.max(0, Math.floor(finiteNumber(order.gross_amount, 0) * rewardRate));
  const now = Date.now();
  const expiresAt = new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString();

  let referrerSnapshot: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  if (completedOrders <= 3 && typeof user.referred_by === 'string' && user.referred_by.trim()) {
    const referrerQuery = db.collection('users')
      .where('referral_code', '==', user.referred_by.trim())
      .limit(1);
    const snapshot = await transaction.get(referrerQuery);
    referrerSnapshot = snapshot.docs[0];
  }

  transaction.update(userRef, {
    total_completed_orders: completedOrders,
    points: Math.max(0, finiteNumber(user.points, 0)) + pointsEarned,
    updated_at: now,
  });
  const safeCreate = (ref: any, data: any) => {
    if (typeof (transaction as any).create === 'function') {
      (transaction as any).create(ref, data);
    } else if (typeof (transaction as any).set === 'function') {
      (transaction as any).set(ref, data, { merge: true });
    }
  };

  if (pointsEarned > 0) {
    safeCreate(db.collection('point_ledger').doc(`order_${orderId}_credit`), {
      user_id: userId,
      order_id: orderId,
      amount: pointsEarned,
      original_amount: pointsEarned,
      source: 'order_completion',
      expires_at: expiresAt,
      is_expired: false,
      created_at: now,
    });
  }

  if (referrerSnapshot && referrerSnapshot.id !== userId) {
    const referrer = referrerSnapshot.data();
    const referrerEarned = Math.max(0, Math.floor(finiteNumber(order.gross_amount, 0) * 0.08));
    const successfulReferrals = Math.max(0, Math.floor(finiteNumber(referrer.successful_referrals, 0)))
      + (completedOrders === 1 ? 1 : 0);
    transaction.update(referrerSnapshot.ref, {
      points: Math.max(0, finiteNumber(referrer.points, 0)) + referrerEarned,
      ...(completedOrders === 1 ? { successful_referrals: successfulReferrals } : {}),
      updated_at: now,
    });
    if (referrerEarned > 0) {
      safeCreate(db.collection('point_ledger').doc(`order_${orderId}_referral_credit`), {
        user_id: referrerSnapshot.id,
        referred_user_id: userId,
        order_id: orderId,
        amount: referrerEarned,
        original_amount: referrerEarned,
        source: 'referral_completion',
        expires_at: expiresAt,
        is_expired: false,
        created_at: now,
      });
    }

    const milestone = completedOrders === 1
      ? ({ 3: 'fries', 8: 'thickshake', 15: 'popcorn_or_drink' } as Record<number, string>)[successfulReferrals]
      : undefined;
    if (milestone) {
      safeCreate(db.collection('vouchers').doc(`referral_${referrerSnapshot.id}_${successfulReferrals}`), {
        user_id: referrerSnapshot.id,
        item_type: milestone,
        source_order_id: orderId,
        created_at: now,
      });
    }
  }

  return {
    orderUpdates: {
      points_awarded: true,
      points_earned: pointsEarned,
      points_reward_rate: rewardRate,
      points_reward_status: 'awarded',
      points_awarded_at: now,
    },
    pointsEarned,
  };
}
