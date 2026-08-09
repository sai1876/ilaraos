// [INTERNAL] - Route used by server-to-server or webhook calls
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  downloadMetaMedia,
  transcribeAudio,
  matchVoiceOrderToMenu,
  sendWhatsAppMessage,
} from '@/lib/voiceOrderingService';
import { MenuItem } from '@/lib/types';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { maskPhone } from '@/lib/security/maskPii';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { verifyMetaWebhookSignature } from '@/server/whatsapp/verifyWebhookSignature';
import type { WhatsAppSendResult } from '@/server/whatsapp/client';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

interface MetaWebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  audio?: { id?: string };
  text?: { body?: string };
  location?: { latitude?: number; longitude?: number };
}

interface MetaWebhookStatus {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaWebhookMessage[];
        statuses?: MetaWebhookStatus[];
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

type ProcessClaim = 'claimed' | 'duplicate';

function getTrustedAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (
        url.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')
      ) {
        return url.origin;
      }
    } catch {
      // Fall through to Vercel URL.
    }
  }

  if (process.env.VERCEL_URL) {
    const vercelHost = process.env.VERCEL_URL.startsWith('http')
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`;
    try {
      return new URL(vercelHost).origin;
    } catch {
      // Fall through to the production fallback.
    }
  }

  return 'https://ilaraos.vercel.app';
}

function getPhoneVariations(phone: string): string[] {
  const digits = phone.replace(/[^0-9]/g, '');
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

async function findUserByPhone(
  usersRef: admin.firestore.CollectionReference,
  phone: string,
): Promise<admin.firestore.DocumentSnapshot | null> {
  const variations = getPhoneVariations(phone);
  console.log('[WA_USER_LOOKUP] Searching safe phone variations');

  const queryPhone = await usersRef.where('phone', 'in', variations).limit(1).get();
  if (!queryPhone.empty) return queryPhone.docs[0];

  const queryPhoneNumber = await usersRef.where('phone_number', 'in', variations).limit(1).get();
  if (!queryPhoneNumber.empty) return queryPhoneNumber.docs[0];

  return null;
}

async function claimIncomingMessage(
  messageId: string,
  fromPhone: string,
): Promise<ProcessClaim> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');

  const ref = adminDb.collection('processed_whatsapp_messages').doc(messageId);
  const nowMs = Date.now();

  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();

    if (snapshot.exists) {
      if (data?.status === 'completed') return 'duplicate';

      const updatedAt = data?.updated_at || data?.processed_at || data?.created_at;
      const updatedMs =
        typeof updatedAt?.toMillis === 'function'
          ? updatedAt.toMillis()
          : typeof updatedAt === 'number'
            ? updatedAt
            : 0;

      if (data?.status === 'processing' && nowMs - updatedMs < PROCESSING_STALE_AFTER_MS) {
        return 'duplicate';
      }
    }

    const attemptCount = Number(data?.attempt_count || 0) + 1;
    transaction.set(
      ref,
      {
        incoming_message_id: messageId,
        from: maskPhone(fromPhone),
        status: 'processing',
        attempt_count: attemptCount,
        last_error: null,
        created_at: data?.created_at || admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return 'claimed';
  });
}

async function markIncomingCompleted(messageId: string): Promise<void> {
  if (!adminDb) return;
  await adminDb.collection('processed_whatsapp_messages').doc(messageId).set(
    {
      status: 'completed',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      last_error: null,
    },
    { merge: true },
  );
}

async function markIncomingFailed(messageId: string, error: unknown): Promise<void> {
  if (!adminDb) return;
  const message = error instanceof Error ? error.message : String(error);
  await adminDb.collection('processed_whatsapp_messages').doc(messageId).set(
    {
      status: 'failed',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      last_error: message.slice(0, 500),
    },
    { merge: true },
  );
}

async function sendOrThrow(
  phoneNumberId: string,
  toPhone: string,
  body: string,
): Promise<Extract<WhatsAppSendResult, { ok: true }>> {
  console.log(
    '[WA_REPLY_GENERATED]',
    JSON.stringify({ recipient: maskPhone(toPhone), characters: body.length }),
  );

  const result = await sendWhatsAppMessage(phoneNumberId, toPhone, body);
  if (!result.ok) {
    throw new Error(
      `Meta outbound send rejected (HTTP ${result.status}${result.code ? `, code ${result.code}` : ''})`,
    );
  }
  return result;
}

function logStatusUpdates(statuses: MetaWebhookStatus[] | undefined): void {
  if (!statuses?.length) return;

  for (const status of statuses) {
    const firstError = status.errors?.[0];
    console.log(
      '[WA_STATUS_UPDATE]',
      JSON.stringify({
        message_id: status.id,
        status: status.status,
        masked_recipient: maskPhone(status.recipient_id || ''),
        error_code: firstError?.code,
        error_title: firstError?.title,
        error_message: firstError?.message,
        error_details: firstError?.error_data?.details,
      }),
    );
  }
}

async function safeBusinessEvent(
  input: Parameters<typeof logBusinessEvent>[0],
): Promise<void> {
  try {
    await logBusinessEvent(input);
  } catch (error) {
    // An observability failure must not cause Meta to retry a message that was already replied to.
    console.error('[WA_BUSINESS_EVENT_FAILED]', error);
  }
}

/** GET - Meta WhatsApp webhook verification. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (!verifyToken) {
    console.error('[WA_CONFIG_ERROR] WHATSAPP_VERIFY_TOKEN is missing');
    return new Response('Internal Server Error', { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[WA_WEBHOOK_VERIFIED] Meta webhook verification succeeded');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[WA_WEBHOOK_VERIFY_FAILED] Invalid webhook verification request');
  return new Response('Forbidden', { status: 403 });
}

/** POST - Handle inbound Meta WhatsApp webhook payloads. */
export async function POST(request: Request) {
  let claimedMessageId: string | null = null;

  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    console.log('[WA_WEBHOOK_RECEIVED]', JSON.stringify({ bytes: rawBody.byteLength }));

    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (!appSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[WA_CONFIG_ERROR] WHATSAPP_APP_SECRET is required in production');
        return NextResponse.json({ error: 'Webhook security is not configured' }, { status: 503 });
      }
      console.warn('[WA_SIGNATURE_SKIPPED] Development only: WHATSAPP_APP_SECRET is missing');
    } else {
      const signatureResult = verifyMetaWebhookSignature(
        rawBody,
        request.headers.get('x-hub-signature-256'),
        appSecret,
      );
      if (!signatureResult.ok) {
        console.warn('[WA_SIGNATURE_INVALID]', signatureResult.reason);
        return NextResponse.json({ error: 'Webhook authentication failed' }, { status: 401 });
      }
      console.log('[WA_SIGNATURE_VALID]');
    }

    if (!adminDb) {
      console.error('[WA_CONFIG_ERROR] Firebase Admin DB not initialized');
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const value = payload.entry?.[0]?.changes?.[0]?.value;
    logStatusUpdates(value?.statuses);

    const message = value?.messages?.[0];
    const metadata = value?.metadata;

    if (!message) {
      return NextResponse.json({ success: true, message: 'Status or echo processed' });
    }

    if (typeof message.from !== 'string' || !message.from || typeof message.id !== 'string' || !message.id) {
      return NextResponse.json({ error: 'Invalid webhook message' }, { status: 400 });
    }

    console.log(
      '[WA_MESSAGE_PARSED]',
      JSON.stringify({
        message_id: message.id,
        message_type: message.type || 'unknown',
        masked_from: maskPhone(message.from),
      }),
    );

    const expectedPhoneNumberId = process.env.WHATSAPP_BOT_NUMBER_ID?.trim();
    const incomingPhoneNumberId = metadata?.phone_number_id?.trim();

    if (
      expectedPhoneNumberId &&
      incomingPhoneNumberId &&
      incomingPhoneNumberId !== expectedPhoneNumberId
    ) {
      console.error(
        '[WA_PHONE_NUMBER_ID_MISMATCH]',
        JSON.stringify({ configured: expectedPhoneNumberId, incoming: incomingPhoneNumberId }),
      );
      return NextResponse.json({ error: 'Webhook target mismatch' }, { status: 403 });
    }

    const phoneNumberId = incomingPhoneNumberId || expectedPhoneNumberId;
    if (!phoneNumberId) {
      console.error('[WA_CONFIG_ERROR] No Meta Phone Number ID is available');
      return NextResponse.json({ error: 'WhatsApp Phone Number ID is not configured' }, { status: 503 });
    }

    const claim = await claimIncomingMessage(message.id, message.from);
    if (claim === 'duplicate') {
      console.log('[WA_DUPLICATE_IGNORED]', JSON.stringify({ message_id: message.id }));
      return NextResponse.json({ success: true, message: 'Duplicate message ignored' });
    }
    claimedMessageId = message.id;

    const fromPhone = message.from;
    const normalizedFromPhone = fromPhone.replace(/[^0-9]/g, '');
    const baseUrl = getTrustedAppBaseUrl();

    if (message.type === 'audio' && typeof message.audio?.id === 'string' && message.audio.id) {
      const userDoc = await findUserByPhone(adminDb.collection('users'), normalizedFromPhone);
      if (!userDoc) {
        await sendOrThrow(
          phoneNumberId,
          fromPhone,
          "You don't have an Ilara account registered with this WhatsApp number yet. Please open Ilara and verify your profile first.",
        );
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Unregistered user replied' });
      }

      const userData = userDoc.data();
      const accountStatus = String(userData?.account_status || userData?.status || '').toLowerCase();
      if (accountStatus !== 'active') {
        await sendOrThrow(
          phoneNumberId,
          fromPhone,
          'Your Ilara account is not active yet. Please complete account verification first.',
        );
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Inactive user replied' });
      }

      console.log('[WA_USER_FOUND]', JSON.stringify({ user_id: userDoc.id, message_type: 'audio' }));
      await processVoiceOrder(phoneNumberId, fromPhone, normalizedFromPhone, message.audio.id, baseUrl);
      await markIncomingCompleted(message.id);

      await safeBusinessEvent({
        event_type: 'whatsapp_voice_order_received',
        actor_type: 'webhook',
        actor_id: userDoc.id,
        target_type: 'user',
        target_id: userDoc.id,
        severity: 'info',
        source: 'webhook',
        metadata: { mediaId: message.audio.id },
      });

      return NextResponse.json({ success: true, message: 'Voice order processed' });
    }

    if (message.type === 'text' && typeof message.text?.body === 'string' && message.text.body) {
      const messageText = message.text.body.trim();
      const tokenMatch = messageText.match(/(?:LOGIN\s+)?Ref:\s*([A-Za-z0-9_-]{8,64})/i);

      if (tokenMatch) {
        await processTextHandshake(phoneNumberId, fromPhone, normalizedFromPhone, tokenMatch[1].toUpperCase());
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Handshake processed' });
      }

      const userDoc = await findUserByPhone(adminDb.collection('users'), normalizedFromPhone);
      if (!userDoc) {
        await sendOrThrow(
          phoneNumberId,
          fromPhone,
          "You don't have an Ilara account registered with this WhatsApp number yet. Please open Ilara and verify your profile first.",
        );
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Unregistered user replied' });
      }

      const userData = userDoc.data();
      const accountStatus = String(userData?.account_status || userData?.status || '').toLowerCase();
      if (accountStatus !== 'active') {
        await sendOrThrow(
          phoneNumberId,
          fromPhone,
          'Your Ilara account is not active yet. Please complete account verification first.',
        );
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Inactive user replied' });
      }

      console.log('[WA_USER_FOUND]', JSON.stringify({ user_id: userDoc.id, message_type: 'text' }));
      await processGeneralChat(
        phoneNumberId,
        fromPhone,
        normalizedFromPhone,
        messageText,
        userData,
        userDoc.id,
        baseUrl,
      );
      await markIncomingCompleted(message.id);

      await safeBusinessEvent({
        event_type: 'whatsapp_message_received',
        actor_type: 'webhook',
        actor_id: userDoc.id,
        target_type: 'user',
        target_id: userDoc.id,
        severity: 'info',
        source: 'webhook',
      });

      return NextResponse.json({ success: true, message: 'Chat message processed and Meta accepted reply' });
    }

    if (message.type === 'location' && message.location) {
      const lat = message.location.latitude;
      const lng = message.location.longitude;
      if (
        typeof lat !== 'number' ||
        !Number.isFinite(lat) ||
        typeof lng !== 'number' ||
        !Number.isFinite(lng)
      ) {
        throw new Error('Invalid location payload');
      }

      const userDoc = await findUserByPhone(adminDb.collection('users'), normalizedFromPhone);
      if (!userDoc) {
        await sendOrThrow(
          phoneNumberId,
          fromPhone,
          "You don't have an Ilara account registered with this WhatsApp number yet. Please open Ilara and verify your profile first.",
        );
        await markIncomingCompleted(message.id);
        return NextResponse.json({ success: true, message: 'Unregistered user replied' });
      }

      console.log('[WA_USER_FOUND]', JSON.stringify({ user_id: userDoc.id, message_type: 'location' }));
      await userDoc.ref.update({
        live_location: { lat, lng, updated_at: Date.now() },
      });

      await processLocationMessage(phoneNumberId, fromPhone, lat, lng);
      await markIncomingCompleted(message.id);

      await safeBusinessEvent({
        event_type: 'whatsapp_location_received',
        actor_type: 'webhook',
        actor_id: userDoc.id,
        target_type: 'user',
        target_id: userDoc.id,
        severity: 'info',
        source: 'webhook',
      });

      return NextResponse.json({ success: true, message: 'Location processed and Meta accepted reply' });
    }

    await markIncomingCompleted(message.id);
    return NextResponse.json({ success: true, message: 'Unsupported message type ignored' });
  } catch (error: unknown) {
    console.error('[WA_WEBHOOK_FAILED]', error);
    if (claimedMessageId) {
      try {
        await markIncomingFailed(claimedMessageId, error);
      } catch (markError) {
        console.error('[WA_DUPLICATE_STATE_ERROR] Failed to persist failed state', markError);
      }
    }
    return NextResponse.json({ error: 'WhatsApp message processing failed' }, { status: 500 });
  }
}

async function processVoiceOrder(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  mediaId: string,
  baseUrl: string,
): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');

  let audioBuffer: Buffer;
  try {
    audioBuffer = await downloadMetaMedia(mediaId);
  } catch (error) {
    console.error('[WA_MEDIA_DOWNLOAD_FAILED]', error);
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      "I couldn't fetch that voice note from WhatsApp. Please send it again or type your request.",
    );
    return;
  }

  const transcription = await transcribeAudio(audioBuffer);
  if (!transcription.trim()) {
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      "I couldn't understand that voice note. Please record it again or type your request.",
    );
    return;
  }

  const userDoc = await findUserByPhone(adminDb.collection('users'), normalizedFromPhone);
  await processGeneralChat(
    phoneNumberId,
    fromPhone,
    normalizedFromPhone,
    transcription,
    userDoc?.data(),
    userDoc?.id,
    baseUrl,
  );
}

async function processTextHandshake(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  token: string,
): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');

  const handshakeRef = adminDb.collection('auth_handshakes').doc(token);
  const handshakeSnap = await handshakeRef.get();

  if (!handshakeSnap.exists) {
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      'This verification reference is invalid or expired. Please retry from Ilara.',
    );
    return;
  }

  const handshakeData = handshakeSnap.data()!;
  const expiresAt = handshakeData.expires_at;
  const expiresAtMs =
    typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : Number(expiresAt || 0);

  if (!expiresAtMs || Date.now() > expiresAtMs) {
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      'This verification reference has expired. Please request a new one from Ilara.',
    );
    return;
  }

  if (handshakeData.used) {
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      'This verification reference has already been used. Please request a new one.',
    );
    return;
  }

  const purpose = handshakeData.purpose || 'phone_verification';

  if (purpose === 'passwordless_login') {
    if (!handshakeData.uid) throw new Error('Passwordless handshake is missing uid');

    const userRef = adminDb.collection('users').doc(handshakeData.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await sendOrThrow(phoneNumberId, fromPhone, "We couldn't find your Ilara account. Please sign up first.");
      return;
    }

    const userProfile = userSnap.data()!;
    const registeredPhone = String(
      userProfile.phone || userProfile.phone_number || handshakeData.phone || '',
    ).replace(/[^0-9]/g, '');

    if (registeredPhone && normalizedFromPhone.slice(-10) !== registeredPhone.slice(-10)) {
      await safeBusinessEvent({
        event_type: 'passwordless_login_failed',
        actor_type: 'webhook',
        actor_id: handshakeData.uid,
        target_type: 'user',
        target_id: handshakeData.uid,
        severity: 'warning',
        source: 'webhook',
        metadata: { masked_phone: maskPhone(normalizedFromPhone), reason: 'sender_mismatch' },
      });
      await sendOrThrow(
        phoneNumberId,
        fromPhone,
        'This login request belongs to a different phone number. Start a new login from Ilara.',
      );
      return;
    }

    if (!registeredPhone) {
      await userRef.set({ phone: `+${normalizedFromPhone}` }, { merge: true });
    }

    await handshakeRef.update({ is_verified: true, verified_at: Date.now() });
    await safeBusinessEvent({
      event_type: 'passwordless_login_verified',
      actor_type: 'webhook',
      actor_id: handshakeData.uid,
      target_type: 'user',
      target_id: handshakeData.uid,
      severity: 'info',
      source: 'webhook',
      metadata: {
        masked_phone: maskPhone(normalizedFromPhone),
        token_id: `${token.substring(0, 4)}****`,
      },
    });

    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      'Your login is verified. Return to Ilara to continue.',
    );
    return;
  }

  const registeredPhone = String(handshakeData.phone || '').replace(/[^0-9]/g, '');
  if (!registeredPhone || normalizedFromPhone.slice(-10) !== registeredPhone.slice(-10)) {
    await sendOrThrow(
      phoneNumberId,
      fromPhone,
      'This verification request does not match the WhatsApp number entered in Ilara.',
    );
    return;
  }

  await handshakeRef.update({ is_verified: true, verified_at: Date.now() });
  await sendOrThrow(
    phoneNumberId,
    fromPhone,
    'Your phone number is verified. Return to Ilara to complete your profile.',
  );
}

async function processGeneralChat(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  messageText: string,
  userData?: admin.firestore.DocumentData,
  userId?: string,
  baseUrl: string = 'https://ilaraos.vercel.app',
): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');

  const menuSnap = await adminDb.collection('menu').where('is_available', '==', true).get();
  const menuItems = menuSnap.docs.map(doc => doc.data() as MenuItem);
  const matches = await matchVoiceOrderToMenu(messageText, menuItems);

  let orderSummary = '';
  let checkoutLink = '';

  if (matches.length > 0) {
    const matchedItemsWithDetails: Array<{ name: string; qty: number; unit_price: number }> = [];
    let estimatedTotal = 0;
    const summaryParts: string[] = [];

    for (const match of matches) {
      const menuItem = menuItems.find(item => item.item_id === match.id);
      if (!menuItem) continue;

      const itemTotal = menuItem.price * match.qty;
      estimatedTotal += itemTotal;
      matchedItemsWithDetails.push({
        name: menuItem.name,
        qty: match.qty,
        unit_price: menuItem.price,
      });
      summaryParts.push(`${match.qty}x ${menuItem.name} (₹${itemTotal})`);
    }

    if (matchedItemsWithDetails.length > 0) {
      const voiceOrderId = crypto.randomUUID();
      await adminDb.collection('voice_orders').doc(voiceOrderId).set({
        user_phone: normalizedFromPhone,
        user_id: userData?.user_id || userId || '',
        items: matchedItemsWithDetails,
        estimated_total: estimatedTotal,
        status: 'staged',
        created_at: admin.firestore.Timestamp.now(),
        expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      });
      checkoutLink = `${baseUrl}/cart?session=${voiceOrderId}&magic=true`;
      orderSummary = summaryParts.join(', ');
    }
  }

  const lower = messageText.toLowerCase();
  const isGreeting = /^(hi|hello|hey|hii+|helo|namaste)\b/.test(lower);
  const asksMenu = /\b(menu|eat|food|order|available|recommend|suggest)\b/.test(lower);
  const isStressed = /sad|stress|tired|cry|upset|overwhelm|anxious|worry/.test(lower);

  let reply: string;
  if (checkoutLink) {
    reply = `Done. I added ${orderSummary} to your cart. Complete the order here: ${checkoutLink}`;
  } else if (asksMenu && menuItems.length > 0) {
    const picks = menuItems.slice(0, 5);
    reply = `Here are a few available items:\n${picks
      .map(item => `• ${item.name} (₹${item.price})`)
      .join('\n')}`;
  } else if (isStressed) {
    reply = 'I can help with your Ilara order. Tell me what you would like to eat or ask for the menu.';
  } else if (isGreeting) {
    reply = 'Hi! I am Ilara on WhatsApp. Send "menu" to see available food or tell me what you want to order.';
  } else {
    reply = 'Tell me what you would like to order, or send "menu" to see available items.';
  }

  await sendOrThrow(phoneNumberId, fromPhone, reply);
}

async function processLocationMessage(
  phoneNumberId: string,
  fromPhone: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin DB not initialized');

  let weatherLine = 'Weather information is unavailable right now.';
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,apparent_temperature&timezone=auto`,
    );
    if (response.ok) {
      const data = await response.json();
      const temperature = Math.round(data.current.temperature_2m);
      const feelsLike = Math.round(data.current.apparent_temperature);
      const code = data.current.weathercode;
      let condition = 'clear';
      if (code === 0) condition = 'sunny and clear';
      else if (code <= 3) condition = 'partly cloudy';
      else if (code <= 48) condition = 'foggy';
      else if (code <= 67) condition = 'rainy';
      else if (code <= 77) condition = 'snowy';
      else if (code <= 99) condition = 'stormy';
      weatherLine = `It is ${temperature}°C, feels like ${feelsLike}°C, and is ${condition}.`;
    }
  } catch (error) {
    console.warn('[WA_LOCATION_WEATHER_FAILED]', error);
  }

  const menuSnap = await adminDb.collection('menu').where('is_available', '==', true).get();
  const menuItems = menuSnap.docs.map(doc => doc.data() as MenuItem);
  const picks = menuItems.slice(0, 2);

  let reply = `Location received. ${weatherLine}`;
  if (picks.length > 0) {
    reply += `\n\nYou could try:\n${picks
      .map(item => `• ${item.name} (₹${item.price})`)
      .join('\n')}`;
  }

  await sendOrThrow(phoneNumberId, fromPhone, reply);
}
