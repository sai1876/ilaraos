import { MenuItem } from './types';
import {
  downloadMetaMedia,
  sendWhatsAppMessage,
  type WhatsAppSendResult,
} from '@/server/whatsapp/client';

// Keep the historical imports stable while routing every Meta request through
// the canonical server-side WhatsApp client.
export { downloadMetaMedia, sendWhatsAppMessage };
export type { WhatsAppSendResult };

// ---------------------------------------------------------------------------
// Local deterministic text-order matcher
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5,
};

function extractQtyNear(text: string, matchIndex: number): number {
  const window = text.slice(Math.max(0, matchIndex - 30), matchIndex + 30);
  const digitMatch = window.match(/\b(\d{1,2})\b/);
  if (digitMatch) return Math.min(10, Math.max(1, parseInt(digitMatch[1], 10)));
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    if (window.includes(word)) return val;
  }
  return 1;
}

/**
 * Voice transcription currently has no external ASR dependency.
 * The deterministic fallback preserves the existing voice-order flow.
 */
export async function transcribeAudio(_audioBuffer: Buffer): Promise<string> {
  console.log('[VOICE] Audio transcription skipped — using fallback text order prompt.');
  return 'I want to order something from the menu';
}

/** Deterministic keyword-based menu matcher. */
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
    const tokens = nameLower.split(/\s+/).filter(t => t.length >= 3);
    const fullNameIdx = normalised.indexOf(nameLower);
    const tokenHits = tokens.filter(t => normalised.includes(t)).length;
    const threshold = Math.max(1, Math.ceil(tokens.length / 2));

    if ((fullNameIdx !== -1 || tokenHits >= threshold) && !seen.has(item.item_id)) {
      seen.add(item.item_id);
      const matchingToken = tokens.find(t => normalised.includes(t));
      const idx = fullNameIdx !== -1
        ? fullNameIdx
        : matchingToken
          ? normalised.indexOf(matchingToken)
          : 0;
      matches.push({ id: item.item_id, qty: extractQtyNear(normalised, idx) });
    }
  }

  console.log(`[VOICE MATCH] Matched ${matches.length} item(s) from transcription.`);
  return matches;
}
