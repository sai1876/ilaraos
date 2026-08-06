// [PUBLIC] - Passwordless login initiation
import { NextResponse } from 'next/server';
import { rateLimitDurable } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebaseAdmin';
import { z } from 'zod';
import crypto from 'crypto';
import { maskPhone } from '@/lib/security/maskPii';
import * as admin from 'firebase-admin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';

const passwordlessSchema = z.object({
  phone: z.string().min(10, "Invalid phone number format").max(24),
}).strict();

const MAX_BODY_BYTES = 4 * 1024;

function getPhoneVariations(phone: string): string[] {
  const digits = phone.replace(/[^0-9]/g, "");
  const variations = new Set<string>([digits, `+${digits}`]);
  
  if (digits.length > 10) {
    const last10 = digits.slice(-10);
    variations.add(last10);
    variations.add(`+${last10}`);
    variations.add(`+91${last10}`);
    variations.add(`91${last10}`);
  } else if (digits.length === 10) {
    variations.add(`+${digits}`);
    variations.add(`+91${digits}`);
    variations.add(`91${digits}`);
  }
  
  return Array.from(variations);
}

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
    const variations = getPhoneVariations(phone);

    // Optional: hash the phone for verification in webhook if we want
    let phoneHash = undefined;
    const secret = process.env.AUTH_HASH_SECRET;
    if (secret) {
      phoneHash = crypto.createHmac('sha256', secret).update(phone).digest('hex');
    }

    // Rate Limit
    const rlKey = phoneHash || crypto.createHash('sha256').update(phone).digest('hex');
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
    
    const queryPhone = await usersRef.where('phone', 'in', variations).limit(1).get();
    if (!queryPhone.empty) {
      userDoc = queryPhone.docs[0];
    } else {
      const queryPhoneNumber = await usersRef.where('phone_number', 'in', variations).limit(1).get();
      if (!queryPhoneNumber.empty) {
        userDoc = queryPhoneNumber.docs[0];
      }
    }

    if (!userDoc) {
      await logBusinessEvent({
        event_type: 'passwordless_login_failed',
        actor_type: 'system',
        actor_id: 'system',
        target_type: 'system',
        target_id: 'system',
        severity: 'warning',
        source: 'api',
        metadata: { masked_phone: maskedPhone, reason: "user_not_found" }
      });
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }

    const userData = userDoc.data();
    const uid = userDoc.id;
    const accountStatus = userData?.account_status || userData?.status || 'active';

    if (accountStatus.toLowerCase() !== 'active') {
      await logBusinessEvent({
        event_type: 'passwordless_login_failed',
        actor_type: 'system',
        actor_id: uid,
        target_type: 'user',
        target_id: uid,
        severity: 'warning',
        source: 'api',
        metadata: { masked_phone: maskedPhone, reason: "account_inactive" }
      });
      return NextResponse.json({ success: false, detail: "Invalid credentials" }, { status: 401 });
    }

    const rawBotNumber = process.env.WHATSAPP_BOT_NUMBER || process.env.WHATSAPP_BUSINESS_NUMBER || '';
    const botNumber = rawBotNumber.replace(/\D/g, '');
    if (!botNumber || botNumber.length < 10 || botNumber.length > 15) {
      console.error("[AUTH] WHATSAPP_BOT_NUMBER missing or invalid");
      return NextResponse.json({ success: false, detail: "Internal Server Error" }, { status: 500 });
    }

    // 2. Generate 32-character hex token (128-bit)
    const token = crypto.randomBytes(16).toString('hex').toUpperCase();

    // 3. Store in auth_handshakes
    const handshakeRef = adminDb.collection('auth_handshakes').doc(token);
    await handshakeRef.set({
      uid: uid,
      masked_phone: maskedPhone,
      ...(phoneHash && { phone_hash: phoneHash }),
      purpose: "passwordless_login",
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes
      is_verified: false,
      used: false,
      consume_state: "pending",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await logBusinessEvent({
      event_type: 'passwordless_login_requested',
      actor_type: 'system',
      actor_id: uid,
      target_type: 'customer',
      target_id: uid,
      severity: 'info',
      source: 'api',
      metadata: { masked_phone: maskedPhone, token_id: token.substring(0, 4) + '****' }
    });

    // 4. Build WhatsApp URL
    const redirectText = `Hey Ilara Cafe! 🌟\n\nI want to log in securely to my account.\n\nLOGIN Ref: ${token}`;
    const encodedText = encodeURIComponent(redirectText);
    const whatsappUrl = `https://wa.me/${botNumber}?text=${encodedText}`;

    // redirect_url can just be whatsappUrl
    return NextResponse.json({ 
      success: true, 
      token, 
      redirect_url: whatsappUrl, 
      whatsapp_url: whatsappUrl 
    });
    
  } catch (err: unknown) {
    console.error("Passwordless login error:", err);
    return NextResponse.json({ success: false, detail: "Internal Server Error" }, { status: 500 });
  }
}
