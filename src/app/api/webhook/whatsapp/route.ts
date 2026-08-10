// [INTERNAL] - Route used by server-to-server or webhook calls
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { 
  downloadMetaMedia, 
  sendWhatsAppMessage 
} from '@/lib/voiceOrderingService';
import { transcribeAudioWithGemini } from '@/server/whatsapp/chat/voiceTranscriber';
import { persistInboundMessage, processMessageStatuses } from '@/server/whatsapp/inbox/webhookPersistence';
import { dispatchWhatsAppMessage } from '@/server/whatsapp/inbox/messagingService';
import { claimInboundWebhookMessage, completeInboundWebhookMessage, failInboundWebhookMessage } from '@/server/whatsapp/inbox/webhookIdempotency';

import { maskPhone } from '@/lib/security/maskPii';
import * as admin from 'firebase-admin';
import { logBusinessEvent } from '@/server/events/logBusinessEvent';
import { verifyMetaWebhookSignature } from '@/server/whatsapp/verifyWebhookSignature';
import { chatOrchestrator } from '@/server/whatsapp/chat/chatOrchestrator';
import { updateConversationState } from '@/server/whatsapp/chat/conversationMemory';
import { SupportedLanguage } from '@/server/whatsapp/chat/types';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

interface MetaWebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  audio?: { id?: string };
  text?: { body?: string };
  location?: { latitude?: number; longitude?: number };
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MetaWebhookMessage[];
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

// Verify token from environment or fallback
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

function getTrustedAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
        return url.origin;
      }
    } catch {}
  }
  if (process.env.VERCEL_URL) {
    const vercelHost = process.env.VERCEL_URL.startsWith('http') 
      ? process.env.VERCEL_URL 
      : `https://${process.env.VERCEL_URL}`;
    try {
      return new URL(vercelHost).origin;
    } catch {}
  }
  return 'https://ilaraos.vercel.app';
}

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

async function findUserByPhone(
  usersRef: admin.firestore.CollectionReference,
  phone: string
): Promise<admin.firestore.DocumentSnapshot | null> {
  const variations = getPhoneVariations(phone);
  console.log(`[USER LOOKUP] Searching for phone variations...`);
  
  // 1. Try querying 'phone' field
  const queryPhone = await usersRef.where('phone', 'in', variations).limit(1).get();
  if (!queryPhone.empty) {
    return queryPhone.docs[0];
  }
  
  // 2. Try querying 'phone_number' field
  const queryPhoneNumber = await usersRef.where('phone_number', 'in', variations).limit(1).get();
  if (!queryPhoneNumber.empty) {
    return queryPhoneNumber.docs[0];
  }
  
  return null;
}


/**
 * GET - WhatsApp Webhook Verification
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!VERIFY_TOKEN) {
    console.error('[WHATSAPP WEBHOOK] WHATSAPP_VERIFY_TOKEN is missing');
    return new Response('Internal Server Error', { status: 500 });
  }

  // Accept the strictly defined verify token
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WHATSAPP WEBHOOK] Webhook verified successfully.');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[WHATSAPP WEBHOOK] Webhook verification failed.');
  return new Response('Forbidden', { status: 403 });
}

/**
 * POST - Handle Inbound WhatsApp Webhook Payloads
 */
export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    if (process.env.WHATSAPP_APP_SECRET) {
      const signatureResult = verifyMetaWebhookSignature(
        rawBody,
        request.headers.get('x-hub-signature-256'),
        process.env.WHATSAPP_APP_SECRET,
      );

      if (!signatureResult.ok) {
        const status = signatureResult.reason === 'not_configured' ? 503 : 401;
        return NextResponse.json({ error: 'Webhook authentication failed' }, { status });
      }
    }

    if (!adminDb) {
      console.error('[WHATSAPP WEBHOOK] Firebase Admin DB not initialized.');
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const baseUrl = getTrustedAppBaseUrl();

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const metadata = value?.metadata;
    const expectedPhoneNumberId = process.env.WHATSAPP_BOT_NUMBER_ID;
    const phoneNumberId = metadata?.phone_number_id || expectedPhoneNumberId || 'unknown';

    if (expectedPhoneNumberId && metadata?.phone_number_id && metadata.phone_number_id !== expectedPhoneNumberId) {
      return NextResponse.json({ error: 'Webhook target mismatch' }, { status: 403 });
    }

    const safeLog = {
      event_type: message?.type || 'unknown',
      message_id: message?.id,
      masked_from: maskPhone(message?.from || '')
    };
    console.log('[WHATSAPP WEBHOOK] Webhook payload received (safe):', JSON.stringify(safeLog));

    const statuses = (value as any)?.statuses;
    if (statuses && statuses.length > 0) {
      await processMessageStatuses(statuses).catch(e => console.error('[WHATSAPP WEBHOOK] Failed to process statuses:', e));
      return NextResponse.json({ success: true, message: 'Statuses processed' });
    }

    if (!message) {
      return NextResponse.json({ success: true, message: 'Status or echo ignored' });
    }
    if (typeof message.from !== 'string' || !message.from || typeof message.id !== 'string' || !message.id) {
      return NextResponse.json({ error: 'Invalid webhook message' }, { status: 400 });
    }

    const fromPhone = message.from; // e.g. "919876543210"
    const normalizedFromPhone = fromPhone.replace(/[^0-9]/g, "");

    const messageId = message.id;
    let processingToken: string | undefined;

    if (messageId) {
      const claim = await claimInboundWebhookMessage({
        messageId,
        maskedFrom: maskPhone(fromPhone)
      });

      if (claim.disposition === 'COMPLETED_DUPLICATE') {
        console.log(`[WHATSAPP WEBHOOK] Message ID ${messageId} already processed. Ignoring.`);
        return NextResponse.json({ success: true, message: 'Duplicate message ignored' });
      }

      if (claim.disposition === 'ACTIVE_PROCESSING') {
        console.log(`[WHATSAPP WEBHOOK] Message ID ${messageId} is currently being processed by another worker. Returning 200.`);
        return NextResponse.json({ success: true, message: 'Concurrent processing' });
      }

      processingToken = claim.processingToken;
    }

    let response: Response;
    try {
      response = await (async () => {
        // ----------------------------------------------------
    // CASE 1: Voice Note Order Payload (.ogg audio)
    // ----------------------------------------------------
    if (message.type === 'audio' && typeof message.audio?.id === 'string' && message.audio.id) {
      const mediaId = message.audio.id;
      console.log(`[WHATSAPP WEBHOOK] Voice message received from ${maskPhone(fromPhone)}, media ID: ${mediaId}`);

      // --- Gate A: Phone Authentication Lookup (FAST CHECK) ---
      const usersRef = adminDb.collection('users');
      const userDoc = await findUserByPhone(usersRef, normalizedFromPhone);

      // 1. Persist inbound message deterministically
      const { controlMode, controlVersion } = await persistInboundMessage({
        messageId: messageId,
        fromPhone: fromPhone,
        normalizedPhone: normalizedFromPhone,
        type: 'AUDIO',
        media: { media_id: mediaId }
      });

      if (!userDoc) {
        console.warn(`[WHATSAPP WEBHOOK REJECT] Phone ${maskPhone(fromPhone)} not registered.`);
        if (controlMode === 'AI') {
          await dispatchWhatsAppMessage(
            phoneNumberId,
            fromPhone,
            "Macha! You don't have an account registered with Ilara yet. Please open our web app and verify your profile first! 🌟",
            { sender_type: 'AI', expected_control_version: controlVersion }
          );
        }
        return NextResponse.json({ success: true, message: 'Unregistered user aborted' });
      }

      const userData = userDoc.data();
      const accountStatus = userData?.account_status || userData?.status || '';
      if (accountStatus.toLowerCase() !== 'active') {
        console.warn(`[WHATSAPP WEBHOOK REJECT] User status is ${accountStatus}.`);
        await sendWhatsAppMessage(
          phoneNumberId,
          fromPhone,
          "Macha! You don't have an account registered with Ilara yet. Please open our web app and verify your profile first! 🌟"
        );
        return NextResponse.json({ success: true, message: 'Inactive user aborted' });
      }

      // Process voice order if AI is in control
      if (controlMode === 'AI') {
        await processVoiceOrderInBackground(phoneNumberId, fromPhone, normalizedFromPhone, mediaId, baseUrl, controlVersion)
          .catch(err => console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Background processing failed:', err));
      } else {
        console.log(`[WHATSAPP WEBHOOK] Voice message persisted but skipped AI processing (mode: HUMAN).`);
      }

      console.log(`[WHATSAPP WEBHOOK] Voice order processed.`);
      
      await logBusinessEvent({
        event_type: 'whatsapp_voice_order_received',
        actor_type: 'webhook',
        actor_id: userDoc.id || 'unknown',
        target_type: 'user',
        target_id: userDoc.id || 'unknown',
        severity: 'info',
        source: 'webhook',
        metadata: {
          mediaId
        }
      });

      return NextResponse.json({ success: true, message: 'Voice order processed' });
    }

    // ----------------------------------------------------
    // CASE 2: Text Verification Code Message Payload (Signup Handshake) & Chat
    // ----------------------------------------------------
    if (message.type === 'text' && typeof message.text?.body === 'string' && message.text.body) {
      const messageText = message.text.body;
      const tokenMatch = messageText.trim().match(/^LOGIN(?:\s+Ref:)?\s*([A-Za-z0-9_-]{8,64})$/i);

      if (tokenMatch) {
        const token = tokenMatch[1].toUpperCase();
        
        // Process text handshake
        await processTextHandshakeInBackground(phoneNumberId, fromPhone, normalizedFromPhone, token)
          .catch(err => console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Handshake processing failed:', err));

        return NextResponse.json({ success: true, message: 'Handshake completed' });
      } else {
        // --- Gate A: Phone Authentication Lookup for general chat ---
        const usersRef = adminDb.collection('users');
        const userDoc = await findUserByPhone(usersRef, normalizedFromPhone);

        // 1. Persist inbound message deterministically
        const { controlMode, controlVersion } = await persistInboundMessage({
          messageId: messageId || `gen_${Date.now()}`,
          fromPhone: fromPhone,
          normalizedPhone: normalizedFromPhone,
          type: 'TEXT',
          text: messageText
        });

        if (!userDoc) {
          console.warn(`[WHATSAPP WEBHOOK REJECT] Phone ${maskPhone(fromPhone)} not registered.`);
          if (controlMode === 'AI') {
            await dispatchWhatsAppMessage(
              phoneNumberId,
              fromPhone,
              "Macha! You don't have an account registered with Ilara yet. Please open our web app and verify your profile first! 🌟",
              { sender_type: 'AI', expected_control_version: controlVersion }
            );
          }
          return NextResponse.json({ success: true, message: 'Unregistered user aborted' });
        }

        const userData = userDoc.data();
        const accountStatus = userData?.account_status || userData?.status || '';
        if (accountStatus.toLowerCase() !== 'active') {
          console.warn(`[WHATSAPP WEBHOOK REJECT] User status is ${accountStatus}.`);
          if (controlMode === 'AI') {
            await dispatchWhatsAppMessage(
              phoneNumberId,
              fromPhone,
              "Macha! Your account is not active yet. Please verify your email first! 🌟",
              { sender_type: 'AI', expected_control_version: controlVersion }
            );
          }
          return NextResponse.json({ success: true, message: 'Inactive user aborted' });
        }

        // Check for explicit language and opt-out commands deterministically
        const lowerMsg = messageText.trim().toLowerCase();
        const enMatch = lowerMsg.match(/^(?:english only|talk in english(?: only)?|reply in english|maintain only english|use english from now on|speak english)$/i);
        const hiMatch = lowerMsg.match(/^(?:hindi only|hindi mein bolo|speak hindi)$/i);
        const teMatch = lowerMsg.match(/^(?:telugu only|telugu lo matladu|speak telugu)$/i);
        
        let newLang: SupportedLanguage | null = null;
        let confirmMsg = '';
        if (enMatch) { newLang = 'en'; confirmMsg = "Got it. I'll reply in English from now on."; }
        else if (hiMatch) { newLang = 'hi'; confirmMsg = "Theek hai. Main ab se Hindi mein baat karunga."; }
        else if (teMatch) { newLang = 'te'; confirmMsg = "Sare. Nenu ippati nunchi Telugu lo matladuthanu."; }
        else if (lowerMsg.match(/^(?:tamil only|speak tamil)$/i)) { newLang = 'ta'; confirmMsg = "Got it. I'll reply in Tamil."; }
        else if (lowerMsg.match(/^(?:kannada only|speak kannada)$/i)) { newLang = 'kn'; confirmMsg = "Got it. I'll reply in Kannada."; }
        else if (lowerMsg.match(/^(?:malayalam only|speak malayalam)$/i)) { newLang = 'ml'; confirmMsg = "Got it. I'll reply in Malayalam."; }
        else if (lowerMsg.match(/^(?:marathi only|speak marathi)$/i)) { newLang = 'mr'; confirmMsg = "Got it. I'll reply in Marathi."; }
        else if (lowerMsg.match(/^(?:bengali only|speak bengali)$/i)) { newLang = 'bn'; confirmMsg = "Got it. I'll reply in Bengali."; }
        else if (lowerMsg.match(/^(?:gujarati only|speak gujarati)$/i)) { newLang = 'gu'; confirmMsg = "Got it. I'll reply in Gujarati."; }
        else if (lowerMsg.match(/^(?:punjabi only|speak punjabi)$/i)) { newLang = 'pa'; confirmMsg = "Got it. I'll reply in Punjabi."; }
        else if (lowerMsg.match(/^(?:odia only|speak odia)$/i)) { newLang = 'or'; confirmMsg = "Got it. I'll reply in Odia."; }
        else if (lowerMsg.match(/^(?:urdu only|speak urdu)$/i)) { newLang = 'ur'; confirmMsg = "Got it. I'll reply in Urdu."; }

        const optOutMatch = lowerMsg.match(/^(?:stop messages|don't send promotions|stop reminders)$/i);
        if (optOutMatch) {
          await updateConversationState(normalizedFromPhone, { engagement_opt_out: true });
          if (controlMode === 'AI') {
            await dispatchWhatsAppMessage(phoneNumberId, fromPhone, "Noted. I won't send you any proactive reminders or promotions anymore.", { sender_type: 'AI', expected_control_version: controlVersion });
          }
          return NextResponse.json({ success: true, message: 'Opted out of engagement' });
        }

        if (newLang) {
          await updateConversationState(normalizedFromPhone, {
            preferred_language: newLang,
            language_source: 'explicit',
            language_updated_at: Date.now()
          });
          if (controlMode === 'AI') {
            await dispatchWhatsAppMessage(phoneNumberId, fromPhone, confirmMsg, { sender_type: 'AI', expected_control_version: controlVersion });
          }
          return NextResponse.json({ success: true, message: 'Language updated' });
        }

        // Only let AI reply if control mode is AI
        if (controlMode !== 'AI') {
          console.log(`[WHATSAPP WEBHOOK] Text message persisted but skipped AI processing (mode: HUMAN).`);
          return NextResponse.json({ success: true, message: 'Skipped AI due to HUMAN control' });
        }

        // Process chat message
        const result = await chatOrchestrator.processMessage({
          messageText,
          phone: normalizedFromPhone,
          userId: userDoc.id,
          userData,
          baseUrl
        }).catch(err => {
          console.error('[WHATSAPP WEBHOOK ASYNC ERROR] General chat processing failed:', err);
          return null;
        });

        if (result && result.reply) {
          await dispatchWhatsAppMessage(phoneNumberId, fromPhone, result.reply, { sender_type: 'AI', expected_control_version: controlVersion });
        }

        await logBusinessEvent({
          event_type: 'whatsapp_message_received',
          actor_type: 'webhook',
          actor_id: userDoc.id || 'unknown',
          target_type: 'user',
          target_id: userDoc.id || 'unknown',
          severity: 'info',
          source: 'webhook'
        });

        return NextResponse.json({ success: true, message: 'Chat message processed' });
      }
    }

    // ----------------------------------------------------
    // CASE 3: Location Message Payload (Sharing Live Location)
    // ----------------------------------------------------
    if (message.type === 'location' && message.location) {
      const loc = message.location;
      const lat = loc.latitude;
      const lng = loc.longitude;
      if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
        return NextResponse.json({ error: 'Invalid location payload' }, { status: 400 });
      }
      console.log(`[WHATSAPP WEBHOOK] Location received from ${maskPhone(fromPhone)}`);

      // --- Gate A: Phone Authentication Lookup ---
      const usersRef = adminDb.collection('users');
      const userDoc = await findUserByPhone(usersRef, normalizedFromPhone);

      // 1. Persist inbound location message deterministically
      const { controlMode, controlVersion } = await persistInboundMessage({
        messageId: messageId || `loc_${Date.now()}`,
        fromPhone: fromPhone,
        normalizedPhone: normalizedFromPhone,
        type: 'LOCATION',
        media: { url: `geo:${lat},${lng}` }
      });

      if (!userDoc) {
        console.warn(`[WHATSAPP WEBHOOK REJECT] Phone ${maskPhone(fromPhone)} not registered.`);
        if (controlMode === 'AI') {
          await dispatchWhatsAppMessage(
            phoneNumberId,
            fromPhone,
            "Macha! You don't have an account registered with Ilara yet. Please open our web app and verify your profile first! 🌟",
            { sender_type: 'AI', expected_control_version: controlVersion }
          );
        }
        return NextResponse.json({ success: true, message: 'Unregistered user aborted' });
      }

      // Update user's live_location in Firestore
      const userRef = userDoc.ref;
      await userRef.update({
        live_location: {
          lat: lat,
          lng: lng,
          updated_at: Date.now()
        }
      });
      console.log(`[WHATSAPP WEBHOOK] Updated live_location for user: ${userDoc.id}`);

      if (controlMode === 'AI') {
        await processLocationMessageInBackground(phoneNumberId, fromPhone, normalizedFromPhone, lat, lng, controlVersion)
          .catch(err => console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Location processing failed:', err));
      } else {
        console.log(`[WHATSAPP WEBHOOK] Location message persisted but skipped AI processing (mode: HUMAN).`);
      }

      await logBusinessEvent({
        event_type: 'whatsapp_location_received',
        actor_type: 'webhook',
        actor_id: userDoc.id || 'unknown',
        target_type: 'user',
        target_id: userDoc.id || 'unknown',
        severity: 'info',
        source: 'webhook'
      });

      return NextResponse.json({ success: true, message: 'Location processed' });
    }

      return NextResponse.json({ success: true, message: 'Unhandled webhook event' });
      })();
    } catch (error: any) {
      if (messageId && processingToken) {
        await failInboundWebhookMessage(messageId, processingToken, error.code || 'INTERNAL_PROCESSING_FAILED');
      }
      throw error;
    }

    if (messageId && processingToken) {
      if (response.status === 200) {
        await completeInboundWebhookMessage(messageId, processingToken);
      } else {
        await failInboundWebhookMessage(messageId, processingToken, `HTTP_${response.status}`);
      }
    }

    return response;

  } catch (error: unknown) {
    console.error('[WHATSAPP WEBHOOK ERROR] Webhook POST router failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Background Asynchronous Pipeline: downloads media, transcribes, parses catalog, stages order, sends link.
 */
async function processVoiceOrderInBackground(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  mediaId: string,
  baseUrl: string,
  controlVersion: number
) {
  if (!adminDb) return;
  console.log(`[BACKGROUND TASK] Starting pipeline for ${maskPhone(fromPhone)}, Media: ${mediaId}`);

  try {
    // 1. Download Media File
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const mediaResult = await downloadMetaMedia(mediaId);
      audioBuffer = mediaResult.buffer;
      mimeType = mediaResult.mimeType;
    } catch (err) {
      console.error('[BACKGROUND TASK ERROR] Meta media download failed:', err);
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! We couldn't fetch your voice note from WhatsApp. Please try sending it again! 🎙️",
        { sender_type: 'AI', expected_control_version: controlVersion }
      );
      return;
    }

    // 2. Transcribe Audio via Gemini
    let transcription = '';
    try {
      transcription = await transcribeAudioWithGemini(audioBuffer, mimeType);
    } catch (err) {
      console.error('[BACKGROUND TASK ERROR] Transcription failed:', err);
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "I couldn't understand that voice note. Please try again or type your message.",
        { sender_type: 'AI', expected_control_version: controlVersion }
      );
      return;
    }

    if (!transcription.trim()) {
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "I couldn't understand that voice note. Please try again or type your message.",
        { sender_type: 'AI', expected_control_version: controlVersion }
      );
      return;
    }

    // 3. Forward the transcribed text to the unified general chat pipeline!
    console.log(`[BACKGROUND TASK] Transcribed voice to text: "${transcription}". Forwarding to chat pipeline.`);
    
    const usersRef = adminDb.collection('users');
    const userDoc = await findUserByPhone(usersRef, normalizedFromPhone);
    const userData = userDoc ? userDoc.data() : undefined;

    await chatOrchestrator.processMessage({
      messageText: transcription,
      phone: normalizedFromPhone,
      userId: userDoc ? userDoc.id : '',
      userData,
      baseUrl
    }).then(result => {
      if (result && result.reply) {
        return dispatchWhatsAppMessage(phoneNumberId, fromPhone, result.reply, { sender_type: 'AI', expected_control_version: controlVersion });
      }
    }).catch(err => {
      console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Voice chat processing failed:', err);
    });

  } catch (error) {
    console.error('[BACKGROUND TASK EXCEPTION] Failed to process voice note:', error);
    await dispatchWhatsAppMessage(
      phoneNumberId,
      fromPhone,
      "Ustaad! We ran into an unexpected issue processing your voice note. Please try ordering again or type your request. 🚀",
      { sender_type: 'SYSTEM' }
    );
  }
}

/**
 * Background Asynchronous Pipeline: verifies signup token handshake.
 */
async function processTextHandshakeInBackground(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  token: string
) {
  if (!adminDb) return;
  console.log(`[BACKGROUND TASK] Verifying Signup Token for ${maskPhone(fromPhone)}`);

  try {
    const handshakeRef = adminDb.collection('auth_handshakes').doc(token);
    const handshakeSnap = await handshakeRef.get();

    if (!handshakeSnap.exists) {
      await sendWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! This verification link or code is invalid or expired. Please retry from the web app."
      );
      return;
    }

    const handshakeData = handshakeSnap.data()!;
    const expiresAt = handshakeData.expires_at;

    if (Date.now() > expiresAt) {
      await sendWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! This verification link or code is invalid or expired. Please retry from the web app."
      );
      return;
    }

    if (handshakeData.used) {
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! This verification link has already been used. Please request a new one.",
        { sender_type: 'SYSTEM' }
      );
      return;
    }

    // Determine purpose (default to signup/phone_verification for backward compatibility)
    const purpose = handshakeData.purpose || 'phone_verification';

    if (purpose === 'passwordless_login') {
      // For passwordless login, we must use the UID to look up the user profile,
      // because we only store masked_phone in the handshake to avoid leaking PII.
      const userRef = adminDb.collection('users').doc(handshakeData.uid);
      const userSnap = await userRef.get();
      
      if (!userSnap.exists) {
        await dispatchWhatsAppMessage(
          phoneNumberId,
          fromPhone,
          "Macha! We couldn't find your account. Please sign up first.",
          { sender_type: 'SYSTEM' }
        );
        return;
      }

      const userProfile = userSnap.data()!;
      const registeredPhone = (userProfile.phone || userProfile.phone_number || handshakeData.phone || '').replace(/[^0-9]/g, "");
      const webhookSuffix = normalizedFromPhone.slice(-10);
      const registeredSuffix = registeredPhone.slice(-10);

      if (!registeredSuffix) {
        await userRef.set({ phone: `+${normalizedFromPhone}` }, { merge: true });
      } else if (webhookSuffix !== registeredSuffix) {
        await logBusinessEvent({
          event_type: 'passwordless_login_failed',
          actor_type: 'webhook',
          actor_id: handshakeData.uid,
          target_type: 'user',
          target_id: handshakeData.uid,
          severity: 'warning',
          source: 'webhook',
          metadata: { masked_phone: maskPhone(normalizedFromPhone), reason: "sender_mismatch" }
        });
        console.warn(`[WHATSAPP WEBHOOK] Phone suffix notice (webhook: ${webhookSuffix}, registered: ${registeredSuffix}), proceeding with token verification.`);
      }

      // Token matches! Update handshake state
      await handshakeRef.update({
        is_verified: true,
        verified_at: Date.now()
        // Do not mark used: true here, the polling endpoint will consume it and mark it used.
      });

      console.log(`[BACKGROUND TASK SUCCESS] Passwordless login verified for: ${token.substring(0, 4)}****`);
      
      await logBusinessEvent({
        event_type: 'passwordless_login_verified',
        actor_type: 'webhook',
        actor_id: handshakeData.uid,
        target_type: 'user',
        target_id: handshakeData.uid,
        severity: 'info',
        source: 'webhook',
        metadata: { masked_phone: maskPhone(normalizedFromPhone), token_id: token.substring(0, 4) + '****' }
      });

      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Ustaad! Your login is verified. Please return to the web app to continue! 🚀",
        { sender_type: 'SYSTEM' }
      );
      return;
    }

    // Existing Signup / phone_verification flow
    const registeredPhone = handshakeData.phone ? handshakeData.phone.replace(/[^0-9]/g, "") : "";
    const webhookSuffix = normalizedFromPhone.slice(-10);
    const registeredSuffix = registeredPhone.slice(-10);

    if (webhookSuffix !== registeredSuffix) {
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! This verification request failed. The WhatsApp sender number must match the phone number you entered on signup.",
        { sender_type: 'SYSTEM' }
      );
      return;
    }

    // Token matches! Update handshake state
    await handshakeRef.update({
      is_verified: true,
      verified_at: Date.now()
    });

    console.log(`[BACKGROUND TASK SUCCESS] Signup handshake verified for: ${token}`);
    await dispatchWhatsAppMessage(
      phoneNumberId,
      fromPhone,
      "Ustaad! Your phone number is verified. Please return to the web app screen to complete your profile! 🚀",
      { sender_type: 'SYSTEM' }
    );

  } catch (error) {
    console.error('[BACKGROUND TASK EXCEPTION] Handshake verification error:', error);
  }
}


/**
 * Background Asynchronous Pipeline: handles location updates with deterministic Bhai reply.
 */
async function processLocationMessageInBackground(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  lat: number,
  lng: number,
  controlVersion: number
) {
  if (!adminDb) return;
  console.log(`[BACKGROUND TASK] Starting location message pipeline for ${maskPhone(fromPhone)}`);

  try {
    // 1. Fetch current weather from Open-Meteo (free, no API key)
    let weatherLine = 'Weather unknown.';
    try {
      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,apparent_temperature&timezone=auto`
      );
      if (wRes.ok) {
        const wData = await wRes.json();
        const temp = Math.round(wData.current.temperature_2m);
        const feels = Math.round(wData.current.apparent_temperature);
        const code = wData.current.weathercode;
        let condition = 'clear';
        if (code === 0) condition = 'sunny and clear';
        else if (code <= 3) condition = 'partly cloudy';
        else if (code <= 48) condition = 'foggy';
        else if (code <= 67) condition = 'rainy';
        else if (code <= 77) condition = 'snowy';
        else if (code <= 99) condition = 'thunderstormy';
        weatherLine = `It's ${temp}°C (feels like ${feels}°C) and ${condition}`;
      }
    } catch (err) {
      console.warn('[BACKGROUND LOCATION] Failed to fetch weather:', err);
    }

    // 2. Fetch active menu catalog
    const menuSnap = await adminDb.collection('menu').where('is_available', '==', true).get();
    const menuItems = menuSnap.docs.map(doc => doc.data());

    // 3. Deterministic Bhai reply based on weather
    const isRainy = /rainy|foggy|snowy|thunder/.test(weatherLine.toLowerCase());
    const isSunny = /sunny|clear/.test(weatherLine.toLowerCase());

    let reply: string;
    if (isRainy) {
      reply = `Arre yaar, it's ${weatherLine}! Perfect excuse to stay in and order something warm. Bhai sun — momos or hot chai? 🌧️`;
    } else if (isSunny) {
      reply = `Sach mein? ${weatherLine} — mast day hai! Come to Ilara for something refreshing. ☀️`;
    } else {
      reply = `Kya scene hai machha! ${weatherLine}. Ilara Cafe pe aa ja — something good is always ready. 😄`;
    }

    // 4. Append a couple of menu picks
    if (menuItems.length > 0) {
      const picks = menuItems.slice(0, 2);
      reply += `\n\nBhai suggests:\n${picks.map(i => `• ${i.name} (₹${i.price})`).join('\n')}`;
    }

    // 5. Send reply
    const result = await dispatchWhatsAppMessage(phoneNumberId, fromPhone, reply, { sender_type: 'AI', expected_control_version: controlVersion });
    if (result.ok) {
      console.log(`[BACKGROUND LOCATION SUCCESS] Reply sent to ${maskPhone(fromPhone)}`);
    } else {
      console.error(`[BACKGROUND LOCATION ERROR] Failed to send reply to ${maskPhone(fromPhone)}`);
    }

  } catch (error) {
    console.error('[BACKGROUND LOCATION EXCEPTION] Failed to process location:', error);
    await dispatchWhatsAppMessage(
      phoneNumberId,
      fromPhone,
      "Kya scene hai machha! Received your location, but ran into some issue loading the weather. Lite le lo! 🚀",
      { sender_type: 'AI', expected_control_version: controlVersion }
    );
  }
}
