import { EngagementGenerationContext, EngagementReason } from './engagementTypes';

export interface ScoreResult {
  score: number;
  reason: EngagementReason;
}

const MINIMUM_ENGAGEMENT_SCORE_THRESHOLD = 15;

/**
 * Deterministically evaluates the context to see if there's a strong enough 
 * reason to proactively engage the customer.
 */
export function scoreEngagementContext(context: EngagementGenerationContext): ScoreResult {
  let candidates: { reason: EngagementReason; score: number }[] = [];

  // Helper variables
  const isMorning = context.dayPart === 'early_morning' || context.dayPart === 'breakfast' || context.dayPart === 'late_morning';
  const isLateNight = context.dayPart === 'late_night';
  
  const tempC = context.weather?.temperatureC || 25;
  const isHotWeather = tempC > 30;
  const isColdWeather = tempC < 20;
  const isRaining = (context.weather?.condition.includes('rain') || context.weather?.condition.includes('storm')) || false;
  
  // Workstation loads
  const fryerLoad = context.workload['FRYER'] || 0;
  const brewerLoad = context.workload['BREWER'] || 0;

  // 1. Abandoned Cart
  if (context.cart && context.cart.itemIds.length > 0) {
    candidates.push({ reason: 'CART_RECOVERY', score: 30 });
  }

  // 2. Reorder Opportunity
  if (context.customer.recentOrderItemIds.length > 0) {
    candidates.push({ reason: 'REORDER', score: 20 });
  }

  // 3. Active Offers
  if (context.activeOffers.length > 0) {
    candidates.push({ reason: 'ACTIVE_OFFER', score: 25 });
  }

  // 4. Meal Time Specifics (only if open and serving)
  if (context.restaurant.isOpen) {
    if (isMorning) candidates.push({ reason: 'BREAKFAST', score: 15 }); // Assuming always serves breakfast when open in morning
    if (context.dayPart === 'lunch') candidates.push({ reason: 'LUNCH', score: 18 });
    if (context.dayPart === 'afternoon') candidates.push({ reason: 'AFTERNOON_SNACK', score: 15 });
    if (context.dayPart === 'dinner') candidates.push({ reason: 'DINNER', score: 18 });
    if (isLateNight) candidates.push({ reason: 'LATE_NIGHT', score: 16 });
  }

  // 5. Weather Context
  if (isHotWeather && brewerLoad < 10) {
    // Encourage cold beverages if brewer not overloaded
    candidates.push({ reason: 'HOT_WEATHER', score: 22 });
  }
  if (isColdWeather || isRaining) {
    if (fryerLoad < 10) {
      candidates.push({ reason: 'RAINY_WEATHER', score: 22 }); // Fried/hot food
    } else {
      candidates.push({ reason: 'COLD_WEATHER', score: 18 });
    }
  }

  // 6. Weekend
  if (context.dayOfWeek === 'Saturday' || context.dayOfWeek === 'Sunday') {
    candidates.push({ reason: 'WEEKEND', score: 12 });
  }

  // 7. General Discovery
  candidates.push({ reason: 'DISCOVERY', score: 10 });

  // --- Downscoring for Overloaded Stations ---
  // If breakfast usually means hot beverages (BREWER) and brewer is loaded, downscore:
  if (brewerLoad > 15) {
    const bk = candidates.find(c => c.reason === 'BREAKFAST');
    if (bk) bk.score -= 10;
  }
  
  if (fryerLoad > 15) {
    const lunch = candidates.find(c => c.reason === 'LUNCH' || c.reason === 'DINNER');
    if (lunch) lunch.score -= 5;
  }

  // Find highest scoring candidate
  let bestCandidate = { reason: 'NONE' as EngagementReason, score: 0 };
  for (const c of candidates) {
    if (c.score > bestCandidate.score) {
      bestCandidate = c;
    }
  }

  // Filter against minimum threshold
  if (bestCandidate.score < MINIMUM_ENGAGEMENT_SCORE_THRESHOLD) {
    return { score: bestCandidate.score, reason: 'NONE' };
  }

  return bestCandidate;
}
