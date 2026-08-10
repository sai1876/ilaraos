import { GoogleGenAI, Type, Schema } from '@google/genai';
import { EngagementGenerationContext, EngagementReason, RecentEngagementMemory } from './engagementTypes';
import { SUPPORTED_LANGUAGES } from '../chat/types';
import crypto from 'crypto';

function computeNormalizedHash(msg: string): string {
  const normalized = msg.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

function computeOpeningKey(msg: string): string {
  const words = msg.trim().split(/\s+/);
  return words.slice(0, 3).join(' ').toLowerCase().replace(/[^a-z ]/g, '');
}

/**
 * Evaluates novelty deterministically against history.
 */
function isRepetitive(
  history: RecentEngagementMemory[],
  candidate: { semantic_key: string; message: string; strategy: string }
): boolean {
  if (!history || history.length === 0) return false;
  
  const candHash = computeNormalizedHash(candidate.message);
  const candOpening = computeOpeningKey(candidate.message);

  for (const past of history) {
    if (past.semantic_key === candidate.semantic_key) return true;
    if (past.normalized_message_hash === candHash) return true;
    if (past.opening_key && past.opening_key === candOpening) return true;
  }
  return false;
}

/**
 * Uses Gemini to generate a personalized, grounded engagement message.
 */
export async function generateEngagementMessage(
  context: EngagementGenerationContext,
  reason: EngagementReason
): Promise<RecentEngagementMemory | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');
    
    const langInfo = SUPPORTED_LANGUAGES[context.customer.preferredLanguage] || SUPPORTED_LANGUAGES.en;
    let languageInstruction = `English only. Avoid "Bhai", "Macha", etc. when English is selected.`;
    if (context.customer.preferredLanguage !== 'en') {
      languageInstruction = `You MUST reply in conversational ${langInfo.name}. Keep it polite and friendly.`;
    }

    const availableNames = context.availableMenuItems.map(i => `${i.name} (₹${i.price})`).join(', ');

    const systemPrompt = `CUSTOMER ENGAGEMENT TASK

Current local time: ${context.localHour}:00
Day: ${context.dayOfWeek}
Daypart: ${context.dayPart.toUpperCase()}
Weather: ${context.weather?.condition || 'unknown'}, ${context.weather?.temperatureC || 0}°C
Restaurant: ${context.restaurant.isOpen ? 'OPEN' : 'CLOSED'}
Preferred language: ${langInfo.name}

Relevant available products:
${availableNames}

Customer history:
- recent orders: ${context.customer.recentOrderItemIds.length > 0 ? 'Yes' : 'No'}

Current offers:
${context.activeOffers.length > 0 ? context.activeOffers.length + ' offers available' : 'None'}

Selected strategy: ${reason}

Requirements:
- Generate one short WhatsApp message.
- ${languageInstruction}
- Do not repeat previous wording.
- Do not reuse the same opening.
- Mention at most 2 actual products.
- Never invent products/prices/offers.
- Sound natural, not like an advertisement template.
- Do not say anything about weather not present in supplied context.
- Return a JSON object representing the engagement.
`;
    
    const ai = new GoogleGenAI({ apiKey });
    
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING },
        content_angle: { type: Type.STRING },
        primary_item_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
        semantic_key: { type: Type.STRING }
      },
      required: ['message', 'content_angle', 'primary_item_ids', 'semantic_key']
    };

    let attempt = 0;
    const maxAttempts = 2; // Allow exactly one regeneration

    while (attempt < maxAttempts) {
      const parts = [{ text: "Generate the engagement message now." }];
      if (attempt > 0) {
        parts[0].text = "The previous generation was too similar to a recent message. Try a completely different content angle and opening phrasing.";
      }

      const result = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      if (!result.text) {
        attempt++;
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(result.text);
      } catch (e) {
        attempt++;
        continue;
      }

      if (isRepetitive(context.recentEngagements, { semantic_key: parsed.semantic_key, message: parsed.message, strategy: reason })) {
        console.log(`[ENGAGEMENT GENERATOR] Novelty guard caught repetition. Attempt ${attempt+1}`);
        attempt++;
        continue;
      }

      // Passed novelty guard
      const memory: RecentEngagementMemory = {
        message: parsed.message,
        reason: reason,
        sentAt: new Date().toISOString(),
        strategy: reason,
        content_angle: parsed.content_angle,
        primary_item_ids: parsed.primary_item_ids,
        semantic_key: parsed.semantic_key,
        normalized_message_hash: computeNormalizedHash(parsed.message),
        opening_key: computeOpeningKey(parsed.message)
      };

      return memory;
    }
    
    console.warn(`[ENGAGEMENT GENERATOR] Exhausted generation attempts due to novelty guard.`);
    return null; // SKIP instead of forcing a message
  } catch (err) {
    console.error(`[ENGAGEMENT GENERATOR] Gemini generation failed:`, err);
    return null;
  }
}
