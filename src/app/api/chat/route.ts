// [PUBLIC] - Browser-callable route without strict token requirements
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitDurable } from '@/lib/rateLimit';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

// Zod schema for input validation
const chatRequestSchema = z.object({
  userMessage: z.string().min(1).max(1000),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'bot']),
    content: z.string().max(2000)
  })).max(20),
  // Accepted temporarily for client compatibility, but never trusted or used.
  menuContext: z.string().max(20_000).optional()
}).strict();

const MAX_REQUEST_BYTES = 30 * 1024;

// ---------------------------------------------------------------------------
// Deterministic "Bhai" chatbot — no external AI API
// ---------------------------------------------------------------------------

const BHAI_GREETINGS = [
  'Arre yaar, kya scene hai? 😄',
  'Bhai sun, what\'s up today?',
  'Sach mein? Tell me everything!',
  'Macha, kya chal raha hai campus pe?',
];

const FOOD_RESPONSES = [
  'Ek kaam kar — biryani le lo, guaranteed mood fix hai! 🍛',
  'Bhai mera suggestion: frappe + waffle combo. Pakka set!',
  'Oasis pe aa ja, I\'ll hook you up with something fresh!',
  'Momos with red chutney — trust me on this one, macha! 🥟',
];

const STRESS_RESPONSES = [
  'Arre yaar, lite le lo. Ek chai lo and breathe. Tu handle karega this! ☕',
  'Bhai sun — oasis pe aa ja. Good food + good company = everything sorted.',
  'Sach mein? That sounds rough. Come grab comfort food, I\'ll join you.',
  'Tu toh full gone hai mamu! Relax — waffles and chill first, then exams.',
];

const GENERAL_RESPONSES = [
  'Kya scene hai yaar? Tell me more and I\'ll sort you out! 😄',
  'Mast plan hai — aa ja oasis pe, we\'ll figure it out together.',
  'Bhai sun, whatever it is — food first, then talk!',
  'Pakka set yaar, don\'t stress. I got you!',
];

function buildBhaiResponse(
  userMessage: string,
  menuLines: string[],
): { message: string; recommendedMenuItemIds: string[]; is_highly_stressed: boolean; choices: string[] } {
  const lower = userMessage.toLowerCase();

  const isStressed = /sad|stress|tired|cry|upset|overwhelm|anxious|depress|worry|fail|exam|board/.test(lower);
  const wantFood = /food|eat|hungry|order|biryani|waffle|burger|momo|coffee|chai|drink|snack|menu/.test(lower);
  const isGreeting = /hi|hello|hey|sup|what'?s up|namaste|bhai/.test(lower);

  let message: string;
  const choices: string[] = [];

  if (isGreeting) {
    message = BHAI_GREETINGS[Math.floor(Math.random() * BHAI_GREETINGS.length)];
    choices.push('What\'s on the menu?', 'I\'m hungry 🍛', 'Just chilling');
  } else if (wantFood) {
    message = FOOD_RESPONSES[Math.floor(Math.random() * FOOD_RESPONSES.length)];
    choices.push('Add to cart', 'Suggest something else', 'What\'s the deal?');
  } else if (isStressed) {
    message = STRESS_RESPONSES[Math.floor(Math.random() * STRESS_RESPONSES.length)];
    choices.push('Haan yaar 😔', 'I\'m okay actually', 'Recommend comfort food');
  } else {
    message = GENERAL_RESPONSES[Math.floor(Math.random() * GENERAL_RESPONSES.length)];
    choices.push('Kya scene hai?', 'I need food', 'Tell me more');
  }

  return {
    message,
    recommendedMenuItemIds: [],
    is_highly_stressed: isStressed,
    choices: choices.slice(0, 3),
  };
}

export async function POST(req: Request) {
  try {
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwardedFor || req.headers.get('x-real-ip') || 'unknown';
    let rateLimitIdentity = `ip:${ip}`;

    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      if (!adminAuth) return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 });
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7), true);
        rateLimitIdentity = `uid:${decoded.uid}`;
      } catch {
        return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
      }
    }

    const requestLimit = await rateLimitDurable(`chat:${rateLimitIdentity}`, 10, 60 * 1000);
    if (!requestLimit.success) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(requestLimit.retryAfterMs / 1000)) },
        },
      );
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid Request' }, { status: 400 });
    }
    const result = chatRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid Request', details: result.error.issues }, { status: 400 });
    }

    const { userMessage } = result.data;

    // Fetch live menu for context (best-effort)
    const menuLines: string[] = [];
    if (adminDb) {
      try {
        const menuSnapshot = await adminDb.collection('menu')
          .where('is_available', '==', true)
          .limit(50)
          .get();
        menuSnapshot.docs.forEach(doc => {
          const item = doc.data();
          menuLines.push(`${String(item.name || '')} (₹${item.price || ''})`);
        });
      } catch {
        // Continue without menu — chat still works
      }
    }

    // Build deterministic Bhai response
    const responseData = buildBhaiResponse(userMessage, menuLines);

    // Return in the same shape the client expects (choices[0].message.content)
    return NextResponse.json({
      choices: [{
        message: {
          content: JSON.stringify(responseData),
        },
      }],
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
