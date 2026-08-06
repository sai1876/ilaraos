// [PUBLIC] - Browser-callable route without strict token requirements
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { USERS_COL } from '@/lib/firebase/collections';
import { rateLimitDurable } from '@/lib/rateLimit';
import { z } from 'zod';
import crypto from 'node:crypto';

const availabilitySchema = z.object({
  phone: z.string().min(10).max(24).optional(),
  email: z.string().email().max(254).optional(),
}).strict().refine(value => Boolean(value.phone) !== Boolean(value.email));

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || !error || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export async function POST(req: Request) {
  try {
    const parsed = availabilitySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
    }
    const { phone, email } = parsed.data;
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwardedFor || req.headers.get('x-real-ip') || 'unknown';
    const normalizedIdentifier = phone ? phone.replace(/\D/g, '') : email!.toLowerCase().trim();
    const identifierHash = crypto.createHash('sha256').update(normalizedIdentifier).digest('hex');
    const [ipLimit, identifierLimit] = await Promise.all([
      rateLimitDurable(`availability-ip:${ip}`, 20, 15 * 60 * 1000),
      rateLimitDurable(`availability-id:${identifierHash}`, 5, 15 * 60 * 1000),
    ]);
    if (!ipLimit.success || !identifierLimit.success) {
      const unavailable = ipLimit.source === 'unavailable' || identifierLimit.source === 'unavailable';
      return NextResponse.json(
        { detail: unavailable ? 'Service temporarily unavailable' : 'Too many requests' },
        { status: unavailable ? 503 : 429 },
      );
    }

    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');

      // Check Firebase Auth
      if (adminAuth) {
        try {
          const userRecord = await adminAuth.getUserByPhoneNumber(`+${normalizedPhone}`);
          if (userRecord) {
            return NextResponse.json({ available: false }, { status: 200 });
          }
        } catch (authErr: unknown) {
          if (getErrorCode(authErr) !== 'auth/user-not-found') {
            console.error("Firebase Auth phone lookup error:", authErr);
          }
        }
      }

      // Check Firestore
      if (adminDb) {
        const q1 = await adminDb.collection(USERS_COL).where("phone", "==", normalizedPhone).limit(1).get();
        const q2 = await adminDb.collection(USERS_COL).where("phone_number", "==", normalizedPhone).limit(1).get();
        if (!q1.empty || !q2.empty) {
          return NextResponse.json({ available: false }, { status: 200 });
        }
      }
    }

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      // Check Firebase Auth
      if (adminAuth) {
        try {
          const userRecord = await adminAuth.getUserByEmail(normalizedEmail);
          if (userRecord) {
            return NextResponse.json({ available: false }, { status: 200 });
          }
        } catch (authErr: unknown) {
          if (getErrorCode(authErr) !== 'auth/user-not-found') {
            console.error("Firebase Auth email lookup error:", authErr);
          }
        }
      }

      // Check Firestore
      if (adminDb) {
        const q = await adminDb.collection(USERS_COL).where("email", "==", normalizedEmail).limit(1).get();
        if (!q.empty) {
          return NextResponse.json({ available: false }, { status: 200 });
        }
      }
    }

    return NextResponse.json({ available: true }, { status: 200 });

  } catch (error: unknown) {
    console.error("Check availability error:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
