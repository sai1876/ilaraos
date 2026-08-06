// [PUBLIC] - Deterministic welcome message for the StressBuster chat widget
import { NextResponse } from 'next/server';
import { z } from 'zod';

const welcomeRequestSchema = z.object({
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']),
  weatherLine: z.string().max(500).optional(),
  offersLine: z.string().max(500).optional(),
}).strict();

const MAX_REQUEST_BYTES = 4 * 1024;

const WELCOME_MESSAGES: Record<string, string> = {
  morning: 'Good morning yaar! ☀️ Oasis pe aa ja — fresh chai and hot bites are ready. Kya scene hai today?',
  afternoon: 'Afternoon slump? Arre lite le lo! Come grab something good and recharge. Kya khaana hai?',
  evening: 'Evening vibes are good yaar! 🌅 Perfect time for a frappe or some momos. What\'s on your mind?',
  night: 'Late night grind? Bhai sun — we got you covered. Snacks and comfort food available. Kya scene hai?',
};

export async function POST(req: Request) {
  try {
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

    const parsed = welcomeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Request' }, { status: 400 });
    }

    const { timeOfDay, weatherLine, offersLine } = parsed.data;
    let message = WELCOME_MESSAGES[timeOfDay] ?? WELCOME_MESSAGES.afternoon;

    // Append contextual snippets if available
    if (weatherLine && !/unknown/i.test(weatherLine)) {
      if (/rainy|rain|monsoon/i.test(weatherLine)) {
        message += ' It\'s raining outside — perfect excuse to stay in and eat well! 🌧️';
      } else if (/sunny|clear/i.test(weatherLine)) {
        message += ' Sunny day energy! Come by for something refreshing. ☀️';
      }
    }
    if (offersLine && !/no special/i.test(offersLine)) {
      message += ` Also — ${offersLine.split('|')[0].trim()}.`;
    }

    // Return in the shape StressBusterChat.tsx expects: choices[0].message.content
    return NextResponse.json({
      choices: [{
        message: {
          content: JSON.stringify({ message }),
        },
      }],
    });
  } catch (error) {
    console.error('[CHAT WELCOME] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
