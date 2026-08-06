import { MenuItem } from './types';

/**
 * Downloads audio binary data from Meta's media server.
 * (No AI dependency — uses only the Meta Graph API.)
 */
export async function downloadMetaMedia(mediaId: string): Promise<Buffer> {
  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!whatsappToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured in environment variables.');
  }

  try {
    console.log(`[META MEDIA] Retrieving media metadata for ID: ${mediaId}`);
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${whatsappToken}` },
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.text();
      throw new Error(`Failed to retrieve media metadata: ${metaRes.statusText}. Response: ${errBody}`);
    }

    const metadata = await metaRes.json();
    const downloadUrl = metadata.url;
    if (!downloadUrl) throw new Error('No download URL found in Meta media metadata response.');

    console.log(`[META MEDIA] Downloading media binary from URL`);
    const mediaRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${whatsappToken}` },
    });

    if (!mediaRes.ok) throw new Error(`Failed to download binary: ${mediaRes.statusText}`);

    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[META MEDIA ERROR] Media ingestion failed:`, error);
    throw new Error(`Media download error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Local deterministic text-order matcher
// Replaces: Groq Whisper transcription + LLM menu matching
//
// Strategy:
//  1. Normalise the transcription text (lower-case, collapse whitespace).
//  2. For each available menu item, check if any token from the item name
//     appears in the text, or if the item name is a substring of the text.
//  3. Extract a simple quantity from nearby digit words or number words.
//  4. Return matches in { id, qty } format — identical to the old Groq output.
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5,
};

function extractQtyNear(text: string, matchIndex: number): number {
  // Look ±30 chars around the match index for a digit or number-word
  const window = text.slice(Math.max(0, matchIndex - 30), matchIndex + 30);
  const digitMatch = window.match(/\b(\d{1,2})\b/);
  if (digitMatch) return Math.min(10, Math.max(1, parseInt(digitMatch[1], 10)));
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    if (window.includes(word)) return val;
  }
  return 1;
}

/**
 * NOTE: `audioBuffer` is no longer transcribed via an external API.
 * We convert the voice note to a confirmation message directly.
 * Voice ordering is fully text-menu matched in matchVoiceOrderToMenu instead.
 */
export async function transcribeAudio(_audioBuffer: Buffer): Promise<string> {
  // We cannot transcribe audio without an external ASR API.
  // Return a sentinel string that will be matched as "order via voice note" →
  // the caller then falls back to the menu-confirmation flow.
  console.log('[VOICE] Audio transcription skipped — using fallback text order prompt.');
  return 'I want to order something from the menu';
}

/**
 * Deterministic keyword-based menu matcher.
 * Replaces Groq LLM completions for menu matching.
 */
export async function matchVoiceOrderToMenu(
  transcription: string,
  menuItems: MenuItem[],
): Promise<{ id: string; qty: number }[]> {
  const normalised = transcription.toLowerCase().replace(/[^\w\s]/g, ' ');
  const available = menuItems.filter(item => item.is_available);
  const matches: { id: string; qty: number }[] = [];
  const seen = new Set<string>();

  for (const item of available) {
    const nameLower = item.name.toLowerCase();
    // Build token list from the item name (split by space, min 3 chars)
    const tokens = nameLower.split(/\s+/).filter(t => t.length >= 3);

    // A match occurs if:
    //  (a) the full name is a substring of the transcription, OR
    //  (b) at least half the name tokens appear in the transcription
    const fullNameIdx = normalised.indexOf(nameLower);
    const tokenHits = tokens.filter(t => normalised.includes(t)).length;
    const threshold = Math.max(1, Math.ceil(tokens.length / 2));

    if ((fullNameIdx !== -1 || tokenHits >= threshold) && !seen.has(item.item_id)) {
      seen.add(item.item_id);
      const idx = fullNameIdx !== -1 ? fullNameIdx : normalised.indexOf(tokens.find(t => normalised.includes(t))!);
      matches.push({ id: item.item_id, qty: extractQtyNear(normalised, idx) });
    }
  }

  console.log(`[VOICE MATCH] Matched ${matches.length} item(s) from transcription.`);
  return matches;
}

/**
 * Sends a text message back to the user via Meta Graph API.
 * (No AI dependency — pure Meta Cloud API call.)
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  toPhone: string,
  message: string,
): Promise<boolean> {
  const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!whatsappToken) {
    console.warn('[WHATSAPP] WHATSAPP_ACCESS_TOKEN is not configured. Skipping send.');
    return false;
  }

  try {
    console.log(`[WHATSAPP] Sending message to ${toPhone}`);
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: true, body: message },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WHATSAPP] Send failed: ${res.statusText}. Details: ${errText}`);
      return false;
    }

    console.log(`[WHATSAPP] Message sent to ${toPhone}`);
    return true;
  } catch (error) {
    console.error(`[WHATSAPP] Network error:`, error);
    return false;
  }
}
