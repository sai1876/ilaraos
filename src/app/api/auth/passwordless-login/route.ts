// [PUBLIC] - Passwordless login initiation
import { NextResponse } from 'next/server';
import { rateLimitDurable } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebaseAdmin';
import { z } from 'zod';
import crypto from 'crypto';
import { maskPhone } from '@/lib/security/maskPii';
import * as admin from 'firebase-admin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { createPasswordlessChallenge, canonicalizePhone, generateHighEntropySecret, hashSecret } from '@/server/auth/whatsappChallenge';
import { cookies } from 'next/headers';

const passwordlessSchema = z.object({
  phone: z.string().min(10, "Invalid phone number format").max(24),
}).strict();

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }
    const result = passwordlessSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }

    const { phone } = result.data;
    const maskedPhone = maskPhone(phone);
    const canonicalPhone = canonicalizePhone(phone);

    if (!canonicalPhone) {
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }

    // Rate Limit (by ip and canonical phone)
    const rlKey = crypto.createHash('sha256').update(canonicalPhone).digest('hex');
    const phoneRl = await rateLimitDurable(`pwl_phone_${rlKey}`, 3, 15 * 60 * 1000); // 3 per 15 mins
    if (!phoneRl.success) {
      const status = phoneRl.source === 'unavailable' ? 503 : 429;
      return NextResponse.json(
        { success: false, detail: status === 503 ? 'Authentication temporarily unavailable' : 'Too many requests' },
        { status, headers: { 'Retry-After': String(Math.ceil(phoneRl.retryAfterMs / 1000)) } },
      );
    }

    const ipRl = await rateLimitDurable(`pwl_ip_${ip}`, 10, 15 * 60 * 1000); // 10 per 15 mins
    if (!ipRl.success) {
      const status = ipRl.source === 'unavailable' ? 503 : 429;
      return NextResponse.json(
        { success: false, detail: status === 503 ? 'Authentication temporarily unavailable' : 'Too many requests' },
        { status, headers: { 'Retry-After': String(Math.ceil(ipRl.retryAfterMs / 1000)) } },
      );
    }

    // 1. Lookup user in Firestore
    if (!adminDb) {
      return NextResponse.json({ success: false, detail: "Internal Server Error" }, { status: 500 });
    }
    
    const usersRef = adminDb.collection('users');
    let userDoc: admin.firestore.DocumentSnapshot | null = null;
    let uid: string | undefined = undefined;
    let validAccount = false;
    
    // We check against the raw digits and +canonical
    const digits = canonicalPhone.replace(/[^0-9]/g, "");
    const variations = [digits, `+${digits}`, `+91${digits.slice(-10)}`, `91${digits.slice(-10)}`];
    
    const queryPhone = await usersRef.where('phone', 'in', variations).limit(1).get();
    if (!queryPhone.empty) {
      userDoc = queryPhone.docs[0];
    } else {
      const queryPhoneNumber = await usersRef.where('phone_number', 'in', variations).limit(1).get();
      if (!queryPhoneNumber.empty) {
        userDoc = queryPhoneNumber.docs[0];
      }
    }

    if (userDoc) {
      const userData = userDoc.data();
      const accountStatus = userData?.account_status || userData?.status || 'active';
      if (accountStatus.toLowerCase() === 'active') {
        uid = userDoc.id;
        validAccount = true;
      }
    }

    const rawBotNumber = process.env.WHATSAPP_BOT_NUMBER || process.env.WHATSAPP_BUSINESS_NUMBER || '';
    const botNumber = rawBotNumber.replace(/\\D/g, '');
    if (!botNumber || botNumber.length < 10 || botNumber.length > 15) {
      console.error("[AUTH] WHATSAPP_BOT_NUMBER missing or invalid");
      return NextResponse.json({ success: false, detail: "Internal Server Error" }, { status: 500 });
    }

    // 2. Generate Challenge
    const browserBindingSecret = generateHighEntropySecret();
    const browserBindingHash = hashSecret(browserBindingSecret);
    
    const { challengeId, verifier } = await createPasswordlessChallenge(canonicalPhone, browserBindingHash, uid);
    
    if (validAccount) {
      await logBusinessEvent({
        event_type: 'passwordless_login_requested',
        actor_type: 'system',
        actor_id: uid!,
        target_type: 'customer',
        target_id: uid!,
        severity: 'info',
        source: 'api',
        metadata: { masked_phone: maskedPhone, challenge_id: challengeId }
      });
    } else {
      // Safe internal log for dummy challenge
      await logBusinessEvent({
        event_type: 'passwordless_login_dummy_issued',
        actor_type: 'system',
        actor_id: 'system',
        target_type: 'system',
        target_id: challengeId,
        severity: 'warning',
        source: 'api',
        metadata: { masked_phone: maskedPhone, reason: userDoc ? "account_inactive" : "user_not_found" }
      });
    }

    // 3. Set binding cookie
    const cookieStore = cookies();
    cookieStore.set('__wa_auth_bind', browserBindingSecret, {
      maxAge: 10 * 60, // 10 mins matching challenge expiry
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    // 4. Build WhatsApp URL
    const redirectText = `Hey Ilara Cafe! 🌟\n\nI want to log in securely to my account.\n\nLOGIN Ref: ${challengeId}.${verifier}`;
    const encodedText = encodeURIComponent(redirectText);
    const whatsappUrl = `https://wa.me/${botNumber}?text=${encodedText}`;

    // Identical outward response shape regardless of whether the account was valid or dummy
    return NextResponse.json({ 
      success: true, 
      token: challengeId, // returning challengeId as token for legacy client polling temporarily
      redirect_url: whatsappUrl, 
      whatsapp_url: whatsappUrl 
    });
    
  } catch (err: unknown) {
    console.error("Passwordless login error:", err);
    return NextResponse.json({ success: false, detail: "Internal Server Error" }, { status: 500 });
  }
}
