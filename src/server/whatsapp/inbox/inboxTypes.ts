import { Timestamp } from 'firebase-admin/firestore';
import { SupportedLanguage } from '../chat/types';

export interface WhatsAppConversation {
  conversation_id: string; // The normalized phone number
  customer_id?: string;
  phone_hash: string;
  phone_masked: string;
  customer_display_name?: string;

  status: 'OPEN' | 'RESOLVED' | 'ARCHIVED';
  control_mode: 'AI' | 'HUMAN';
  control_version: number;

  assigned_to?: string;
  preferred_language?: SupportedLanguage;

  last_message_at: Timestamp | number;
  last_user_message_at?: Timestamp | number;
  last_bot_message_at?: Timestamp | number;
  whatsapp_window_expires_at?: Timestamp | number;

  last_message_preview?: string;
  unread_count: number;
  needs_attention: boolean;
  attention_reason?: string;
  attention_at?: Timestamp | number;

  tags?: string[];
  active_order_id?: string;

  created_at: Timestamp | number;
  updated_at: Timestamp | number;
}

export interface WhatsAppMessage {
  message_id: string; // wamid or generated ID
  conversation_id: string;
  wamid?: string;

  direction: 'INBOUND' | 'OUTBOUND';
  sender_type: 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM';
  sender_user_id?: string;

  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'LOCATION' | 'INTERACTIVE' | 'ORDER_EVENT' | 'OFFER' | 'ENGAGEMENT' | 'SYSTEM_EVENT';

  text?: string;
  media?: {
    media_id?: string;
    url?: string;
    mime_type?: string;
    caption?: string;
  };
  transcript?: string;

  status: 'RECEIVED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  reply_to_message_id?: string;
  metadata?: Record<string, unknown>;

  created_at: Timestamp | number;
  sent_at?: Timestamp | number;
  delivered_at?: Timestamp | number;
  read_at?: Timestamp | number;
  failed_at?: Timestamp | number;
}
