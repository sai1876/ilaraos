import { z } from 'zod';

export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', nativeName: 'English' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी' },
  te: { name: 'Telugu', nativeName: 'తెలుగు' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം' },
  mr: { name: 'Marathi', nativeName: 'मराठी' },
  bn: { name: 'Bengali', nativeName: 'বাংলা' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  or: { name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  ur: { name: 'Urdu', nativeName: 'اردو' },
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

export const SupportedLanguageSchema = z.enum([
  'en',
  'hi',
  'te',
  'ta',
  'kn',
  'ml',
  'mr',
  'bn',
  'gu',
  'pa',
  'or',
  'ur',
]);

export const ChatIntentEnum = z.enum([
  'ORDER',
  'RECOMMEND',
  'MENU',
  'CART',
  'ORDER_STATUS',
  'OFFERS',
  'GREETING',
  'CASUAL_CHAT',
  'HELP',
  'SET_LANGUAGE',
  'UNKNOWN',
]);

export type ChatIntent = z.infer<typeof ChatIntentEnum>;

export const IntentConstraintsSchema = z.object({
  category: z.string().optional().describe('Menu category like Beverages, Burgers, Momos, etc.'),
  temperature: z.enum(['cold', 'hot']).optional(),
  taste: z.enum(['spicy', 'sweet', 'savoury', 'mild']).optional(),
  appetite: z.enum(['light', 'filling']).optional(),
  maxPrice: z.number().optional(),
  excludedTerms: z.array(z.string()).optional(),
});

export type IntentConstraints = z.infer<typeof IntentConstraintsSchema>;

export const RequestedItemSchema = z.object({
  requestedName: z.string(),
  quantity: z.number().default(1),
});

export type RequestedItem = z.infer<typeof RequestedItemSchema>;

export const ParsedIntentSchema = z.object({
  intent: ChatIntentEnum,
  confidence: z.number().min(0).max(1),
  constraints: IntentConstraintsSchema.optional(),
  items: z.array(RequestedItemSchema).optional(),
  language: SupportedLanguageSchema.optional(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

export interface ConversationTurn {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface ConversationState {
  preferred_language?: SupportedLanguage;
  language_source?: 'explicit' | 'detected';
  language_updated_at?: number;

  last_intent?: ChatIntent;

  customer_id?: string;

  last_user_message_at?: number;
  whatsapp_window_expires_at?: number;
  
  last_bot_message_at?: number;

  last_engagement_at?: number;
  last_engagement_reason?: string;
  engagement_count_today?: number;
  
  engagement_opt_out?: boolean;
  
  recent_engagements?: any[]; // Store history of recent engagements (e.g. up to 10)
  
  last_offer_broadcast_at?: number;

  recent_item_ids: string[];
  turns: ConversationTurn[];
  updated_at: number;
  expires_at: number;
}
