import { GoogleGenAI } from '@google/genai';
import { MenuItem } from '@/lib/types';
import { ParsedIntent, ConversationTurn } from './types';

export async function generateResponse(
  message: string,
  parsedIntent: ParsedIntent,
  contextTurns: ConversationTurn[],
  retrievedItems: MenuItem[] = [],
  checkoutLink: string = '',
  ambiguousItems: MenuItem[] = [],
  orderSummary: string = '',
  preferredLanguage: string = 'en'
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are Ilara Cafe's WhatsApp AI assistant, affectionately known as "Bhai" or "Machha". You speak casually in friendly Indian English with a touch of local slang (yaar, machha, lite le lo, etc.).

STRICT RULES:
1. Respond ONLY in the user's explicitly selected language (${preferredLanguage}). Do not switch languages unless explicitly asked. Do not use Hinglish or slang if English ('en') is strictly requested.
2. NEVER invent or hallucinate a menu item, price, availability, offer, order status, or restaurant fact.
3. Business facts must ONLY come from the provided Retrieved Data.
3. If the retrieved data contains no answer, clearly say that no matching option is currently available. Do not invent an alternative.
4. Keep responses concise and natural for WhatsApp. Use emojis appropriately.

If an ORDER was successfully staged, a checkoutLink and orderSummary will be provided. Tell the user to complete their order using the link.
If an ORDER was ambiguous, ambiguousItems will be provided. Ask the user which one they meant.
For CASUAL_CHAT or GREETING, respond warmly but keep it short.
For RECOMMEND/MENU, present the retrievedItems with their names and prices. Do not show more than what is provided.`;

  const dataContext = `
Retrieved Menu Items: ${JSON.stringify(retrievedItems.map(i => ({name: i.name, price: i.price, category: i.category})))}
Ambiguous Candidates: ${JSON.stringify(ambiguousItems.map(i => ({name: i.name})))}
Order Summary: ${orderSummary}
Checkout Link: ${checkoutLink}
Parsed Intent: ${parsedIntent.intent}
`;

  const contextStr = contextTurns.length > 0 
    ? `Recent Conversation Context:\n${contextTurns.map(t => `${t.role}: ${t.content}`).join('\n')}\n\n`
    : '';

  const prompt = `${contextStr}Data Context:\n${dataContext}\n\nUser Message: "${message}"\n\nGenerate the WhatsApp reply:`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
    }
  });

  return response.text || "Sorry machha, I ran into an issue getting that for you.";
}
