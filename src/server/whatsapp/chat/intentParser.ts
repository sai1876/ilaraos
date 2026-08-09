import { GoogleGenAI, Type } from '@google/genai';
import { ParsedIntent, ParsedIntentSchema, ConversationTurn } from './types';

export async function parseIntent(message: string, recentTurns: ConversationTurn[]): Promise<ParsedIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are the intent parser for Ilara Cafe's WhatsApp chatbot.
Given a user message and recent conversation context, classify the user's intent.

Supported intents:
ORDER: User wants to order specific items (e.g., "one classic burger").
RECOMMEND: User is asking for suggestions (e.g., "suggest something cool", "what's spicy?").
MENU: User wants to see the menu.
CART: User wants to view or manage their cart.
ORDER_STATUS: User is asking about an existing order's status.
OFFERS: User asks for deals/offers.
GREETING: "hi", "hello", "good morning".
CASUAL_CHAT: "thanks", "how are you", "love you".
HELP: "help", "how does this work".
UNKNOWN: Cannot be determined.

For ORDER or RECOMMEND, extract constraints or requested items accurately.
For contextual orders like "add one" or "add that", use the recent conversation to infer the intent (ORDER) and the requested items.
Respond with strictly valid JSON. Do NOT hallucinate.`;

  const contextStr = recentTurns.length > 0 
    ? `Recent Context:\n${recentTurns.map(t => `${t.role}: ${t.content}`).join('\n')}\n\n`
    : '';

  const prompt = `${contextStr}User Message: "${message}"\nParse this message into JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING, enum: ['ORDER', 'RECOMMEND', 'MENU', 'CART', 'ORDER_STATUS', 'OFFERS', 'GREETING', 'CASUAL_CHAT', 'HELP', 'UNKNOWN'] },
          confidence: { type: Type.NUMBER },
          constraints: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              temperature: { type: Type.STRING, enum: ['cold', 'hot'] },
              taste: { type: Type.STRING, enum: ['spicy', 'sweet', 'savoury', 'mild'] },
              appetite: { type: Type.STRING, enum: ['light', 'filling'] },
              maxPrice: { type: Type.NUMBER },
              excludedTerms: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                requestedName: { type: Type.STRING },
                quantity: { type: Type.NUMBER }
              },
              required: ['requestedName', 'quantity']
            }
          }
        },
        required: ['intent', 'confidence']
      }
    }
  });

  if (!response.text) {
    throw new Error('No response from Gemini API');
  }

  const parsed = JSON.parse(response.text);
  return ParsedIntentSchema.parse(parsed);
}
