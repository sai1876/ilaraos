// [INTERNAL] - Route used by server-to-server or webhook calls
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireSessionActor,
  SessionAuthorizationError,
} from '@/server/auth/requireSessionActor';
import { rateLimitDurable } from '@/lib/rateLimit';

// Disable static rendering
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 50 * 1024;
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const geminiRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('adjustAtmosphere'),
    payload: z.object({ userPrompt: boundedText(2000) }).strict(),
  }).strict(),
  z.object({
    action: z.literal('generateMenuDescription'),
    payload: z.object({
      itemName: boundedText(120),
      category: boundedText(80),
      ingredients: z.array(boundedText(120)).max(30),
    }).strict(),
  }).strict(),
  z.object({
    action: z.literal('generateSmartPromo'),
    payload: z.object({ businessGoal: boundedText(2000) }).strict(),
  }).strict(),
  z.object({
    action: z.literal('generateCRMMessage'),
    payload: z.object({
      patronName: boundedText(120),
      preferredItem: boundedText(120),
      daysAgo: z.number().int().min(0).max(3650),
      tone: z.enum(['cozy', 'exotic', 'urgent']),
    }).strict(),
  }).strict(),
  z.object({
    action: z.literal('analyzeSmartRefill'),
    payload: z.object({
      ingredient: boundedText(120),
      baselineUsage: z.number().finite().min(0).max(1_000_000),
      localWeatherContext: boundedText(2000),
    }).strict(),
  }).strict(),
  z.object({
    action: z.literal('generateSlideDetails'),
    payload: z.object({
      itemName: boundedText(120),
      category: boundedText(80),
      originalDescription: z.string().max(5000),
    }).strict(),
  }).strict(),
  z.object({
    action: z.literal('generateStressBusterResponse'),
    payload: z.object({
      userMessage: boundedText(2000),
      chatHistory: z.array(z.object({
        role: z.enum(['user', 'bot']),
        content: boundedText(2000),
      }).strict()).max(20),
      menuItems: z.array(z.object({
        id: boundedText(128),
        name: boundedText(120),
        category: boundedText(80),
        price: z.number().finite().min(0).max(1_000_000),
      }).strict()).max(100),
    }).strict(),
  }).strict(),
]);

// ---------------------------------------------------------------------------
// Deterministic local handlers — no external AI API calls
// ---------------------------------------------------------------------------

function handleAdjustAtmosphere(userPrompt: string): object {
  const lower = userPrompt.toLowerCase();
  let active_theme: string = 'default';
  let hero_headline = 'Fresh Bites, Warm Vibes';
  let hero_sub = 'Crafted with care, served with speed.';
  let banner_text = 'Order now and skip the queue!';
  let banner_color = 'golden';

  if (/rain|monsoon|cozy/.test(lower)) {
    active_theme = 'raining';
    hero_headline = 'Cozy Bites for Rainy Days';
    hero_sub = 'Warm up with our comfort specials.';
    banner_text = 'Rainy day special — free hot tea with any main!';
    banner_color = 'dark';
  } else if (/exam|study|quiet/.test(lower)) {
    active_theme = 'exam';
    hero_headline = 'Fuel Your Focus';
    hero_sub = 'Study snacks & energy bites — we\'ve got you.';
    banner_text = 'Exam mode: free refill on hot drinks all day!';
    banner_color = 'success';
  } else if (/fest|festival|party|diwali|celebration/.test(lower)) {
    active_theme = 'fest';
    hero_headline = 'Celebrate Every Bite';
    hero_sub = 'Festival flavours, campus energy.';
    banner_text = 'Festival special — 15% off combo meals today!';
    banner_color = 'urgent';
  } else if (/night|midnight|late/.test(lower)) {
    active_theme = 'night';
    hero_headline = 'Late Night Cravings Sorted';
    hero_sub = 'The campus canteen that never sleeps.';
    banner_text = 'Night owl deal: snacks combo at ₹99!';
    banner_color = 'dark';
  }

  return {
    active_theme,
    hero_headline,
    hero_sub,
    banner_active: true,
    banner_text,
    banner_color,
    reason: `Atmosphere adjusted for: ${userPrompt.slice(0, 60)}.`,
  };
}

function handleMenuDescription(itemName: string, category: string, ingredients: string[]): object {
  const ingredientList = ingredients.length > 0
    ? ingredients.slice(0, 4).join(', ')
    : 'premium gourmet ingredients';
  return {
    description: `${itemName} is a standout ${category.toLowerCase()} creation crafted with ${ingredientList}. Every bite delivers a balance of bold flavour and satisfying texture — a campus favourite you'll keep coming back for.`,
  };
}

function handleSmartPromo(businessGoal: string): object {
  const lower = businessGoal.toLowerCase();
  const templates: Array<{ test: RegExp; code: string; pct: number; desc: string; scope: string }> = [
    { test: /biryani|rice/, code: 'BIRYANI20', pct: 20, desc: 'Fragrant biryani — 20% off today only!', scope: 'Biryani' },
    { test: /waffle/, code: 'WAFFLE25', pct: 25, desc: 'Golden crispy waffles — grab them before they\'re gone!', scope: 'Waffles' },
    { test: /burger/, code: 'BURGER20', pct: 20, desc: 'Juicy burgers — limited time deal!', scope: 'Burgers' },
    { test: /momo/, code: 'MOMO15', pct: 15, desc: 'Steaming momos — comfort food deal!', scope: 'Momos' },
    { test: /beverage|drink|coffee|tea/, code: 'DRINKS20', pct: 20, desc: 'Refreshing beverages — cool down for less!', scope: 'Beverages' },
    { test: /snack/, code: 'SNACKS15', pct: 15, desc: 'Crispy snacks bundle — limited time!', scope: 'Snacks' },
  ];
  const match = templates.find(t => t.test.test(lower));
  if (match) {
    return { code: match.code, discountPercent: match.pct, description: match.desc, categoryScope: match.scope };
  }
  return { code: 'CLEARALL15', discountPercent: 15, description: 'Flash deal — 15% off all items today!', categoryScope: 'All' };
}

const CRM_TONE_MESSAGES: Record<string, (name: string, item: string, days: number) => string> = {
  cozy: (name, item, days) =>
    `Hey ${name}! It's been ${days} day${days !== 1 ? 's' : ''} — your favourite ${item} is waiting for you. Swing by Ilara for a warm welcome. Use code HAUHAU_${name.toUpperCase().slice(0,5)}_15 for 15% off today! 🍵`,
  exotic: (name, item, days) =>
    `${name}, escape the routine. ${days} days without ${item}? Treat yourself to Ilara's premium experience. Code HAUHAU_${name.toUpperCase().slice(0,5)}_20 — 20% off, valid today. ✨`,
  urgent: (name, item, days) =>
    `⚡ ${name}! Last time you visited: ${days} days ago. ${item} queue is clear RIGHT NOW. Use HAUHAU_${name.toUpperCase().slice(0,5)}_25 for 25% off — next 24h only!`,
};

function handleCRMMessage(patronName: string, preferredItem: string, daysAgo: number, tone: string): object {
  const fn = CRM_TONE_MESSAGES[tone] ?? CRM_TONE_MESSAGES.cozy;
  return { message: fn(patronName, preferredItem, daysAgo) };
}

function handleSmartRefill(ingredient: string, baselineUsage: number, localWeatherContext: string): object {
  const lower = localWeatherContext.toLowerCase();
  let multiplier = 1.0;
  let reasoning = 'Normal demand expected based on historical baseline.';

  const isHot = /hot|sunny|summer|scorching/.test(lower);
  const isCold = /rain|cold|monsoon|fog|cloudy/.test(lower);
  const isColdItem = /milk|cream|ice|soda|beverage|cold coffee/.test(ingredient.toLowerCase());
  const isHotItem = /coffee|tea|momos|soup|ginger/.test(ingredient.toLowerCase());

  if (isHot && isColdItem) {
    multiplier = 1.25;
    reasoning = 'Hot weather boosts cold beverage demand — ordering 25% above baseline.';
  } else if (isCold && isHotItem) {
    multiplier = 1.25;
    reasoning = 'Rainy/cold weather boosts hot item demand — ordering 25% above baseline.';
  }

  return {
    suggested_refill_amount: Math.ceil(baselineUsage * multiplier),
    reasoning,
  };
}

const SLIDE_ACCENT_MAP: Record<string, { accent: string; bg: string }> = {
  biryani: { accent: '#f8bc51', bg: 'radial-gradient(circle at center, #63503B 0%, #2A2118 100%)' },
  waffle:  { accent: '#f8bc51', bg: 'radial-gradient(circle at center, #D4A832 0%, #251B03 100%)' },
  burger:  { accent: '#E8621A', bg: 'radial-gradient(circle at center, #E8621A 0%, #1A0A02 100%)' },
  momo:    { accent: '#ef4444', bg: 'radial-gradient(circle at center, #E8621A 0%, #1A0A02 100%)' },
  salad:   { accent: '#2E7D5E', bg: 'radial-gradient(circle at center, #2E7D5E 0%, #0B241A 100%)' },
  default: { accent: '#f8bc51', bg: 'radial-gradient(circle at center, #63503B 0%, #2A2118 100%)' },
};

function handleSlideDetails(itemName: string, category: string, originalDescription: string): object {
  const lower = (itemName + ' ' + category).toLowerCase();
  let key = 'default';
  if (/biryani|rice/.test(lower)) key = 'biryani';
  else if (/waffle/.test(lower)) key = 'waffle';
  else if (/burger/.test(lower)) key = 'burger';
  else if (/momo/.test(lower)) key = 'momo';
  else if (/salad|veg/.test(lower)) key = 'salad';

  const { accent, bg } = SLIDE_ACCENT_MAP[key];
  const shortDesc = originalDescription.slice(0, 120) || `A delicious ${itemName} crafted with premium ingredients.`;
  return {
    tag: itemName.toUpperCase(),
    desc: `${shortDesc} Made fresh to order at Ilara Cafe — experience the taste that keeps students coming back.`,
    tags: [category, 'Fresh Daily', 'Chef\'s Pick'],
    accentColor: accent,
    bgColor: bg,
  };
}

const BHAI_REPLIES = [
  'Arre yaar, kya scene hai aaj? Tell me what\'s on your mind and I\'ll sort you out!',
  'Bhai sun, oasis pe aa ja. Whatever\'s going on, good food fixes everything, pakka set!',
  'Sach mein? That sounds rough. Lite le lo — ek chai lo and let\'s talk.',
  'Mast plan hai: come grab something from the menu, I\'ll join you. Kya chal raha hai?',
  'Tu toh full gone hai mamu! Relax, come eat something first.',
];

function handleStressBusterResponse(userMessage: string, menuItems: Array<{ id: string; name: string; category: string; price: number }>): object {
  const lower = userMessage.toLowerCase();
  const isStressed = /sad|stress|tired|cry|upset|overwhelm|anxious|depress|worry/.test(lower);
  const wantFood = /food|eat|hungry|order|biryani|waffle|burger|momo|coffee|chai/.test(lower);

  let message = BHAI_REPLIES[Math.floor(Math.random() * BHAI_REPLIES.length)];
  const recommended: string[] = [];

  if (wantFood && menuItems.length > 0) {
    const picks = menuItems.slice(0, 2);
    message = `Bhai sun — ${picks.map(i => i.name).join(' or ')} is what you need right now. Pakka mood fix!`;
    recommended.push(...picks.map(i => i.id));
  } else if (isStressed) {
    message = 'Arre yaar, sounds rough. Come to Ilara — good food + good company fixes everything. Lite le lo!';
    const comfortPicks = menuItems.slice(0, 2);
    recommended.push(...comfortPicks.map(i => i.id));
  }

  return {
    message,
    recommendedMenuItemIds: recommended,
    is_highly_stressed: isStressed,
  };
}

// ---------------------------------------------------------------------------
// Main route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireSessionActor(['manager', 'admin', 'owner']);
  } catch (error) {
    if (error instanceof SessionAuthorizationError) {
      return NextResponse.json(
        { error: error.status === 403 ? 'Forbidden' : 'Unauthorized' },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 });
  }

  try {
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let decodedBody: unknown;
    try {
      decodedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = geminiRequestSchema.safeParse(decodedBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { action, payload } = parsed.data;

    const limit = await rateLimitDurable(`ai:${actor.uid}`, 30, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    if (action === 'adjustAtmosphere') {
      return NextResponse.json(handleAdjustAtmosphere(payload.userPrompt));
    }

    if (action === 'generateMenuDescription') {
      return NextResponse.json(handleMenuDescription(payload.itemName, payload.category, payload.ingredients));
    }

    if (action === 'generateSmartPromo') {
      return NextResponse.json(handleSmartPromo(payload.businessGoal));
    }

    if (action === 'generateCRMMessage') {
      return NextResponse.json(handleCRMMessage(payload.patronName, payload.preferredItem, payload.daysAgo, payload.tone));
    }

    if (action === 'analyzeSmartRefill') {
      return NextResponse.json(handleSmartRefill(payload.ingredient, payload.baselineUsage, payload.localWeatherContext));
    }

    if (action === 'generateSlideDetails') {
      return NextResponse.json(handleSlideDetails(payload.itemName, payload.category, payload.originalDescription));
    }

    if (action === 'generateStressBusterResponse') {
      return NextResponse.json(handleStressBusterResponse(payload.userMessage, payload.menuItems));
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });

  } catch (error: unknown) {
    console.error('AI proxy API route failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
