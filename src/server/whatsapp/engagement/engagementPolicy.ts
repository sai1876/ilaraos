import { EngagementContext } from './engagementTypes';

const DEFAULT_ENGAGEMENT_MIN_GAP_HOURS = 6;
const DEFAULT_ENGAGEMENT_MAX_PER_DAY = 2;

// Engagement hours: 9 AM to 9 PM
const ENGAGEMENT_START_HOUR = 9;
const ENGAGEMENT_END_HOUR = 21;

export interface PolicyResult {
  eligible: boolean;
  skipReason?: string;
}

/**
 * Deterministic Hard Engagement Policy.
 * MUST be checked before calling any AI to prevent illegal or annoying messages.
 */
export function checkEngagementPolicy(context: EngagementContext): PolicyResult {
  const now = Date.now();

  // 1. WhatsApp 24-hour window must be OPEN
  if (now > context.windowExpiresAt) {
    return { eligible: false, skipReason: 'whatsapp_window_closed' };
  }

  // 2. Opt-out
  if (context.optedOut) {
    return { eligible: false, skipReason: 'opted_out' };
  }

  // 3. Active order
  // Do not disrupt ongoing active transactional operations with generic engagement
  if (context.activeOrder) {
    return { eligible: false, skipReason: 'active_order_ongoing' };
  }

  // 4. Time of day checks (9 AM to 9 PM)
  if (context.currentHour < ENGAGEMENT_START_HOUR || context.currentHour >= ENGAGEMENT_END_HOUR) {
    return { eligible: false, skipReason: 'outside_engagement_hours' };
  }

  // 5. Daily limit
  const maxPerDay = Number(process.env.WHATSAPP_ENGAGEMENT_MAX_PER_DAY) || DEFAULT_ENGAGEMENT_MAX_PER_DAY;
  if (context.engagementCountToday >= maxPerDay) {
    return { eligible: false, skipReason: 'daily_limit_reached' };
  }

  // 6. Minimum gap between engagements (cooldown)
  const minGapHours = Number(process.env.WHATSAPP_ENGAGEMENT_MIN_GAP_HOURS) || DEFAULT_ENGAGEMENT_MIN_GAP_HOURS;
  const minGapMs = minGapHours * 60 * 60 * 1000;
  
  if (context.lastEngagementAt && (now - context.lastEngagementAt < minGapMs)) {
    return { eligible: false, skipReason: 'recent_engagement_cooldown' };
  }

  // 7. Recent promotional contact (e.g., offer broadcast)
  if (context.lastOfferBroadcastAt && (now - context.lastOfferBroadcastAt < minGapMs)) {
    return { eligible: false, skipReason: 'recent_offer_cooldown' };
  }

  // 8. User interacted too recently (don't randomly engage while they might be chatting right now)
  // Let's say if they messaged in the last 30 minutes, they are currently active.
  const INTERACTION_BUFFER_MS = 30 * 60 * 1000;
  if (now - context.lastUserMessageAt < INTERACTION_BUFFER_MS) {
    return { eligible: false, skipReason: 'customer_currently_active' };
  }

  return { eligible: true };
}
