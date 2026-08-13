const fs = require('fs');
const path = require('path');

const filePath = 'e:\\ilara-main (3)\\ilara-main\\src\\app\\api\\webhook\\whatsapp\\route.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix WHATSAPP_APP_SECRET logic
const oldSignatureBlock = `    if (process.env.WHATSAPP_APP_SECRET) {
      const signatureResult = verifyMetaWebhookSignature(
        rawBody,
        request.headers.get('x-hub-signature-256'),
        process.env.WHATSAPP_APP_SECRET,
      );

      if (!signatureResult.ok) {
        const status = signatureResult.reason === 'not_configured' ? 503 : 401;
        return NextResponse.json({ error: 'Webhook authentication failed' }, { status });
      }
    }`;

const newSignatureBlock = `    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      console.error('[WHATSAPP WEBHOOK] WHATSAPP_APP_SECRET is not configured');
      return NextResponse.json({ error: 'Service Unavailable' }, { status: 503 });
    }

    const signatureResult = verifyMetaWebhookSignature(
      rawBody,
      request.headers.get('x-hub-signature-256'),
      secret,
    );

    if (!signatureResult.ok) {
      const status = signatureResult.reason === 'not_configured' ? 503 : 401;
      return NextResponse.json({ error: 'Webhook authentication failed' }, { status });
    }`;

content = content.replace(oldSignatureBlock, newSignatureBlock);

// 2. Change text matching logic in POST
// First replace the `const tokenMatch = ...` block with new logic.
const textMatchRegexStr = /const tokenMatch = messageText\.trim\(\)\.match\(\/\^LOGIN\(\\\?:\\\\s\+Ref:\)\\\?\s\*\(\[A-Za-z0-9_-\]\{8,64\}\)\\\$\/i\);/;
// Wait, regex might be tricky. Let's find it by substring.
const textMatchStart = content.indexOf(`const tokenMatch = messageText.trim().match(/^LOGIN(?:\\s+Ref:)?\\s*([A-Za-z0-9_-]{8,64})$/i);`);
const authElseStart = content.indexOf(`} else {`, textMatchStart);

if (textMatchStart !== -1 && authElseStart !== -1) {
  const newMatchLogic = `      const newAuthMatch = messageText.trim().match(/^(LOGIN|VERIFY)\\s+Ref:\\s*([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$/i);
      const legacySignupMatch = messageText.trim().match(/^(?:LOGIN\\s+)?Ref:\\s*([A-Za-z0-9_-]{8,64})$/i);

      if (newAuthMatch) {
        const purpose = newAuthMatch[1].toUpperCase() === 'LOGIN' ? 'passwordless_login' : 'phone_verification';
        const challengeId = newAuthMatch[2];
        const verifier = newAuthMatch[3];
        
        await processAuthChallengeInBackground(phoneNumberId, fromPhone, normalizedFromPhone, purpose, challengeId, verifier)
          .catch(err => console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Auth challenge processing failed:', err));

        return { response: NextResponse.json({ success: true, message: 'Challenge processed' }), processingKind: 'LOGIN_HANDSHAKE', expectedConversationId: normalizedFromPhone };
      } else if (legacySignupMatch) {
        const token = legacySignupMatch[1].toUpperCase();
        
        // Process text handshake
        await processTextHandshakeInBackground(phoneNumberId, fromPhone, normalizedFromPhone, token)
          .catch(err => console.error('[WHATSAPP WEBHOOK ASYNC ERROR] Handshake processing failed:', err));

        return { response: NextResponse.json({ success: true, message: 'Handshake completed' }), processingKind: 'LOGIN_HANDSHAKE', expectedConversationId: normalizedFromPhone };
      `;
  
  content = content.slice(0, textMatchStart) + newMatchLogic + content.slice(authElseStart + 7);
}

// 3. Add processAuthChallengeInBackground next to processTextHandshakeInBackground
const processTextHandshakeIndex = content.indexOf('async function processTextHandshakeInBackground');
if (processTextHandshakeIndex !== -1) {
  const newProcessAuthChallenge = `
/**
 * Background Asynchronous Pipeline: verifies AUTH-04 new tokens
 */
async function processAuthChallengeInBackground(
  phoneNumberId: string,
  fromPhone: string,
  normalizedFromPhone: string,
  purpose: 'passwordless_login' | 'phone_verification',
  challengeId: string,
  verifier: string
) {
  console.log(\`[BACKGROUND TASK] Verifying AUTH-04 Challenge for \${maskPhone(fromPhone)}\`);
  const { verifyPasswordlessChallenge, verifySignupChallenge, canonicalizePhone } = await import('@/server/auth/whatsappChallenge');
  
  try {
    const canonicalPhone = canonicalizePhone(normalizedFromPhone);
    if (!canonicalPhone) {
      console.warn(\`[WHATSAPP WEBHOOK REJECT] Invalid phone format: \${normalizedFromPhone}\`);
      return;
    }

    let result;
    if (purpose === 'passwordless_login') {
      result = await verifyPasswordlessChallenge(challengeId, verifier, canonicalPhone);
    } else {
      result = await verifySignupChallenge(challengeId, verifier, canonicalPhone);
    }

    if (!result.success) {
      console.warn(\`[BACKGROUND TASK REJECT] Challenge verification failed: \${result.reason}\`);
      
      // Strict Sender Mismatch: log safe security event, do not verify
      if (result.reason === 'sender_mismatch') {
        await logBusinessEvent({
          event_type: 'whatsapp_auth_sender_mismatch',
          actor_type: 'webhook',
          actor_id: 'unknown',
          target_type: 'system',
          target_id: challengeId,
          severity: 'warning',
          source: 'webhook',
          metadata: { masked_phone: maskPhone(normalizedFromPhone), reason: result.reason }
        });
      }

      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Macha! This verification request failed or has expired. Please retry from the web app.",
        { sender_type: 'SYSTEM' }
      );
      return;
    }

    console.log(\`[BACKGROUND TASK SUCCESS] Challenge verified for: \${challengeId}\`);
    if (purpose === 'passwordless_login') {
      await logBusinessEvent({
        event_type: 'passwordless_login_verified',
        actor_type: 'webhook',
        actor_id: 'unknown',
        target_type: 'system',
        target_id: challengeId,
        severity: 'info',
        source: 'webhook',
        metadata: { masked_phone: maskPhone(normalizedFromPhone), challenge_id: challengeId }
      });
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Ustaad! Your login is verified. Please return to the web app to continue! 🚀",
        { sender_type: 'SYSTEM' }
      );
    } else {
      await dispatchWhatsAppMessage(
        phoneNumberId,
        fromPhone,
        "Ustaad! Your phone number is verified. Please return to the web app screen to complete your profile! 🚀",
        { sender_type: 'SYSTEM' }
      );
    }
  } catch (error) {
    console.error('[BACKGROUND TASK EXCEPTION] Auth challenge verification error:', error);
  }
}

`;
  content = content.slice(0, processTextHandshakeIndex) + newProcessAuthChallenge + content.slice(processTextHandshakeIndex);
}

// 4. Update processTextHandshakeInBackground for legacy tokens (disallow passwordless)
content = content.replace(
  `const purpose = handshakeData.purpose || 'phone_verification';`,
  `const purpose = handshakeData.purpose || 'phone_verification';
    if (purpose === 'passwordless_login') {
      console.warn(\`[WHATSAPP WEBHOOK REJECT] Legacy passwordless token attempted, but they are disabled in AUTH-04.\`);
      return;
    }`
);
const legacyPwlessStart = content.indexOf(`if (purpose === 'passwordless_login') {`);
// Find the closing brace of the legacy passwordless logic. 
// It ends with `return;\n    }`
const legacyPwlessEnd = content.indexOf(`return;\n    }`, legacyPwlessStart) + `return;\n    }`.length;
// Actually I just inserted a small if-statement. The old one was:
// if (purpose === 'passwordless_login') { ... return; }
// I should just replace the entire old `if (purpose === 'passwordless_login') { ... }` block with my warning.

let newContent = content;
const pwMatch = `    if (purpose === 'passwordless_login') {`;
const startIndex = newContent.indexOf(pwMatch);
if (startIndex !== -1) {
  // Let's find the `// Existing Signup` which comes right after the old if block
  const endIndex = newContent.indexOf(`// Existing Signup`, startIndex);
  if (endIndex !== -1) {
    const replacement = `    if (purpose === 'passwordless_login') {
      console.warn(\`[WHATSAPP WEBHOOK REJECT] Legacy passwordless token attempted, but they are disabled in AUTH-04.\`);
      return;
    }

    `;
    newContent = newContent.slice(0, startIndex) + replacement + newContent.slice(endIndex);
  }
}

fs.writeFileSync(filePath, newContent);
console.log('Successfully updated webhook.');
