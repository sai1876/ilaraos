'use server';

import { z } from 'zod';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { rateLimitDurable } from '@/lib/rateLimit';

const boundedText = (max: number) => z.string().trim().min(1).max(max);

async function authorizeAiAction(scope: string): Promise<void> {
  const actor = await requireSessionActor(['staff']);
  const limit = await rateLimitDurable(`ai:${scope}:${actor.uid}`, 20, 60 * 1000);
  if (!limit.success) {
    throw new Error('Request limit exceeded. Please wait a moment.');
  }
}

// ---------------------------------------------------------------------------
// Staff Copilot — rule-based knowledge base replies
// ---------------------------------------------------------------------------

const COPILOT_RULES: Array<{ keywords: string[]; reply: string }> = [
  {
    keywords: ['frappe', 'recipe', 'cold coffee'],
    reply: 'Frappe Recipe: 1 shot espresso, 2 pumps caramel syrup, 1 cup ice, 100ml milk. Blend 30 seconds. Top with whipped cream. Serve in a 400ml cup.',
  },
  {
    keywords: ['peak', 'busy', 'rush hour'],
    reply: 'Peak hours are 8 AM–10 AM and 8 PM–10 PM. Ensure full prep stock before 7:45 AM and 7:45 PM. Keep 2 staff on counter during peak.',
  },
  {
    keywords: ['wifi', 'password', 'internet'],
    reply: 'Staff Wi-Fi password: IlaraStaff2026. Do not share with customers.',
  },
  {
    keywords: ['biryani', 'rice'],
    reply: 'Biryani prep: Soak basmati 30 min. Fry onions golden. Parboil rice 70%. Layer and dum for 20 min. Garnish with mint and fried onion.',
  },
  {
    keywords: ['waffle', 'batter'],
    reply: 'Waffle Batter: 200g flour, 2 eggs, 250ml milk, 1 tsp baking powder, 30g melted butter, pinch of salt. Mix until smooth. Rest 10 min.',
  },
  {
    keywords: ['hygiene', 'clean', 'sop'],
    reply: 'Hygiene SOP: Wipe counters every 30 min. Wash hands before handling food. Sanitize equipment after each shift. Check expiry dates daily.',
  },
];

export const askStaffCopilotAction = async (message: string, context: string): Promise<string> => {
  await authorizeAiAction('staff-copilot');
  z.object({ message: boundedText(2000), context: z.string().max(10_000) }).strict().parse({ message, context });

  const lower = message.toLowerCase();
  for (const rule of COPILOT_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return rule.reply;
    }
  }
  return 'I can help with recipes, SOPs, peak hours, and hygiene rules. Please ask a specific question about cafe operations.';
};

// ---------------------------------------------------------------------------
// Inventory Forecast — deterministic heuristic
// ---------------------------------------------------------------------------

export const getInventoryForecastAction = async (
  ingredient: string,
  currentQty: number,
  unit: string,
  recentUsage: number,
  weatherContext: string,
): Promise<string> => {
  await authorizeAiAction('inventory-forecast');
  z.object({
    ingredient: boundedText(120),
    currentQty: z.number().finite().min(0).max(1_000_000),
    unit: boundedText(40),
    recentUsage: z.number().finite().min(0).max(1_000_000),
    weatherContext: z.string().max(2000),
  }).strict().parse({ ingredient, currentQty, unit, recentUsage, weatherContext });

  const daysRemaining = recentUsage > 0 ? Math.floor((currentQty / recentUsage) * 7) : 99;
  const isHot = /hot|sunny|summer/i.test(weatherContext);
  const isCold = /rain|cold|monsoon|fog/i.test(weatherContext);

  let adjustment = '';
  if (isHot && /milk|cream|ice|beverage/i.test(ingredient)) {
    adjustment = 'Cold weather demand spike expected — order 20–30% extra. ';
  } else if (isCold && /coffee|tea|momos|soup/i.test(ingredient)) {
    adjustment = 'Rain/cold weather hot-item demand spike — order 20–30% extra. ';
  }

  if (daysRemaining <= 2) {
    return `${adjustment}⚠️ Restock NOW — only ${daysRemaining} day(s) of ${ingredient} remaining at current usage (${recentUsage} ${unit}/week).`;
  } else if (daysRemaining <= 5) {
    return `${adjustment}Restock in 1–2 days. ${ingredient}: ${currentQty} ${unit} on hand, ~${daysRemaining} days remaining.`;
  }
  return `${adjustment}${ingredient} stock is comfortable (~${daysRemaining} days). Monitor and restock when below ${Math.ceil(recentUsage * 0.5)} ${unit}.`;
};

// ---------------------------------------------------------------------------
// Auto Schedule — pattern-based shift builder
// ---------------------------------------------------------------------------

export const autoScheduleAction = async (staffData: object[], peakHours: string): Promise<string> => {
  await authorizeAiAction('auto-schedule');
  z.object({
    staffData: z.array(z.record(z.string(), z.unknown())).max(100),
    peakHours: boundedText(1000),
  }).strict().parse({ staffData, peakHours });
  if (JSON.stringify(staffData).length > 20_000) throw new Error('Staff scheduling payload is too large');

  const active = staffData
    .map(s => s as { name?: string; role?: string; status?: string })
    .filter(s => s.status?.toLowerCase() === 'active');

  if (active.length === 0) {
    return 'No active staff available to schedule. Please activate staff members first.';
  }

  const lines = active.map((s, i) => {
    const shift = i % 2 === 0 ? '8:00 AM – 4:00 PM' : '4:00 PM – 12:00 AM';
    return `• ${s.name ?? 'Staff'} (${s.role ?? 'General'}) — ${shift}`;
  });

  return `Suggested Schedule (Peak: ${peakHours}):\n${lines.join('\n')}\n\nEnsure 2 staff on counter during peak hours. Rotate breaks every 2 hours.`;
};

// ---------------------------------------------------------------------------
// Yield Promos — rule-based promo generator
// ---------------------------------------------------------------------------

const PROMO_TEMPLATES: Record<string, { code: string; discountPercent: number; description: string; categoryScope: string; imagePrompt: string }> = {
  default: { code: 'CLEARSTOCK15', discountPercent: 15, description: 'Flash deal to clear today\'s overstocked items!', categoryScope: 'All', imagePrompt: 'Assorted cafe food items on a rustic wooden table, warm lighting' },
  biryani: { code: 'BIRYANI20', discountPercent: 20, description: 'Aromatic biryani — 20% off today only!', categoryScope: 'Biryani', imagePrompt: 'Steaming biryani in a copper pot, saffron rice, warm food photography' },
  waffle: { code: 'WAFFLE25', discountPercent: 25, description: 'Golden crispy waffles — grab \'em before they\'re gone!', categoryScope: 'Waffles', imagePrompt: 'Fresh golden waffles with strawberries and cream, bright studio lighting' },
  burger: { code: 'BURGER20', discountPercent: 20, description: 'Juicy burgers — limited time deal!', categoryScope: 'Burgers', imagePrompt: 'Stacked burger with fresh vegetables on a dark plate, professional food photo' },
  momo: { code: 'MOMO15', discountPercent: 15, description: 'Steaming momos — comfort food deal!', categoryScope: 'Momos', imagePrompt: 'Steamed momos in a bamboo basket with red chili dipping sauce, close-up food photo' },
  beverage: { code: 'DRINKS20', discountPercent: 20, description: 'Refreshing beverages — cool down for less!', categoryScope: 'Beverages', imagePrompt: 'Colorful cold drinks with ice and fruit garnishes, bright cafe setting' },
};

export const getYieldPromosAction = async (overstockedItems: object[]): Promise<string> => {
  await authorizeAiAction('yield-promos');
  z.array(z.record(z.string(), z.unknown())).max(100).parse(overstockedItems);
  if (JSON.stringify(overstockedItems).length > 20_000) throw new Error('Promotion payload is too large');

  const firstItem = overstockedItems[0] as { goal?: string; name?: string } | undefined;
  const goal = (firstItem?.goal || '').toLowerCase();

  let template = PROMO_TEMPLATES.default;
  if (/biryani|rice/.test(goal)) template = PROMO_TEMPLATES.biryani;
  else if (/waffle/.test(goal)) template = PROMO_TEMPLATES.waffle;
  else if (/burger/.test(goal)) template = PROMO_TEMPLATES.burger;
  else if (/momo/.test(goal)) template = PROMO_TEMPLATES.momo;
  else if (/beverage|drink|coffee|tea/.test(goal)) template = PROMO_TEMPLATES.beverage;

  return JSON.stringify(template);
};
