export type OfferState = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'DISABLED';

export interface Offer {
  offer_id: string;
  version: number;
  
  title: string;
  description: string;
  image_url?: string;
  
  discount_percentage?: number;
  discount_amount?: number;
  
  valid_from: number;
  valid_until: number;
  
  applicable_item_ids?: string[];
  website_url?: string;
  
  status: OfferState;
  
  created_at: number;
  updated_at: number;
  published_at?: number;
}

export interface OfferDelivery {
  delivery_id: string;
  offer_id: string;
  offer_version: number;
  customer_id: string;
  
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
  skip_reason?: string;
  
  wamid?: string;
  window_expires_at_at_send?: number;
  
  created_at: number;
  sent_at?: number;
  delivered_at?: number;
  failed_at?: number;
}
