import { z } from 'zod';

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
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

export interface ConversationTurn {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface ConversationState {
  last_intent?: ChatIntent;
  recent_item_ids: string[];
  turns: ConversationTurn[];
  updated_at: number;
  expires_at: number;
}
