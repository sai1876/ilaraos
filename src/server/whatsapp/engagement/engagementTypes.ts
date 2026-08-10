export type EngagementReason =
  | 'BREAKFAST'
  | 'LUNCH'
  | 'AFTERNOON_SNACK'
  | 'DINNER'
  | 'LATE_NIGHT'
  | 'HOT_WEATHER'
  | 'RAINY_WEATHER'
  | 'COLD_WEATHER'
  | 'CART_RECOVERY'
  | 'REORDER'
  | 'PERSONALIZED_RECOMMENDATION'
  | 'ACTIVE_OFFER'
  | 'NEW_ITEM'
  | 'WEEKEND'
  | 'FOLLOW_UP'
  | 'DISCOVERY'
  | 'NONE';

import { SupportedLanguage } from '../chat/types';

import { MenuItem } from '@/lib/types';
import { Offer } from '../offers/offerBroadcastTypes';

export interface RecentEngagementMemory {
  message: string;
  reason: EngagementReason;
  sentAt: string;
  strategy: string;
  content_angle: string;
  primary_item_ids: string[];
  semantic_key: string;
  normalized_message_hash: string;
  opening_key: string;
  outcome?: 'replied' | 'ordered' | 'ignored';
}

export interface EngagementGenerationContext {
  currentTime: string;
  localHour: number;
  dayOfWeek: string;
  dayPart:
    | 'early_morning'
    | 'breakfast'
    | 'late_morning'
    | 'lunch'
    | 'afternoon'
    | 'evening'
    | 'dinner'
    | 'late_night';
  weather?: {
    condition: string;
    temperatureC?: number;
    rainProbability?: number;
  };
  restaurant: {
    isOpen: boolean;
    opensAt?: string;
    closesAt?: string;
  };
  workload: Record<string, number>;
  customer: {
    preferredLanguage: SupportedLanguage;
    favoriteCategories: string[];
    recentOrderItemIds: string[];
    lastOrderAt?: string;
  };
  cart?: {
    itemIds: string[];
  };
  availableMenuItems: MenuItem[];
  activeOffers: Offer[];
  recentEngagements: RecentEngagementMemory[];
}

export interface EngagementContext {
  customerId: string;
  phone: string;
  phoneHash: string;
  preferredLanguage: SupportedLanguage;
  
  lastUserMessageAt: number;
  windowExpiresAt: number;
  
  lastEngagementAt?: number;
  lastOfferBroadcastAt?: number;
  engagementCountToday: number;
  
  activeOrder: boolean;
  
  cart?: {
    itemIds: string[];
    total?: number;
  };
  
  recentItemIds: string[];
  frequentlyOrderedItemIds?: string[];
  favoriteCategories?: string[];
  recentlyRecommendedItemIds?: string[];
  
  currentAvailableMenuItems: MenuItem[];
  currentHour: number;
  optedOut: boolean;
}

export interface EngagementEvent {
  engagement_id: string;
  customer_id: string;
  
  reason: EngagementReason;
  score: number;
  
  status: 'sent' | 'skipped' | 'failed';
  skip_reason?: string;
  message_variant?: string;
  
  wamid?: string;
  
  sent_at?: number;
  window_expires_at_at_send: number;
  created_at: number;
}
