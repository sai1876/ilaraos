import { apiRequest } from '@/lib/apiClient';

export interface CricketAvailabilityResponse {
  date: string;
  timeZone: string;
  serverNow: number;
  config: any;
  slotsLeft: number;
  slots: {
    slotKey: string;
    venueId: string;
    dateStr: string;
    timeStr: string;
    startAt: number;
    endAt: number;
    displayStart: string;
    displayEnd: string;
    status: 'available' | 'past' | 'lead_time' | 'booked' | 'held' | 'blocked' | 'closed';
    bookable: boolean;
    reason: string | null;
    pricePaise: number;
  }[];
}

export interface CricketHoldResponse {
  success: boolean;
  holdId: string;
  expiresAt: number;
  businessDate: string;
  slotKeys: string[];
  displayTimes: string[];
  totalPaise: number;
}

export interface CricketBookResponse {
  success: boolean;
  bookingId: string;
  bookingReference: string;
  redirectUrl: string;
  ticketToken: string;
  booking: any;
}

export const fetchCricketAvailability = async (dateStr?: string): Promise<CricketAvailabilityResponse> => {
  const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
  return apiRequest<CricketAvailabilityResponse>(`/api/cricket/availability${query}`, {
    cacheKey: `cricket_avail:${dateStr || 'today'}`,
    staleTimeMs: 15 * 1000,
    timeoutMs: 3000,
    retry: 0,
    bypassAuth: true,
  });
};

export const createCricketHold = async (slotKeys: string[], dateStr?: string): Promise<CricketHoldResponse> => {
  return apiRequest<CricketHoldResponse>('/api/cricket/hold', {
    method: 'POST',
    body: JSON.stringify({ slot_keys: slotKeys, date: dateStr }),
  });
};

export const confirmCricketBooking = async (data: {
  holdId?: string;
  slot_keys: string[];
  date: string;
  customer_name: string;
  customer_phone: string;
  payment_option: 'pay_at_venue' | 'demo_online';
  is_student?: boolean;
}): Promise<CricketBookResponse> => {
  return apiRequest<CricketBookResponse>('/api/cricket/book', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const fetchMyCricketBookings = async (): Promise<{
  success: boolean;
  serverNow: number;
  upcoming: any[];
  past: any[];
  cancelled: any[];
  totalCount: number;
}> => {
  return apiRequest('/api/cricket/bookings/mine', {
    cacheKey: 'cricket_mine',
    staleTimeMs: 10 * 1000,
  });
};

export const cancelCricketBooking = async (bookingId: string, reason?: string): Promise<void> => {
  await apiRequest(`/api/cricket/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
};

export const verifyTicketToken = async (token: string) => {
  return apiRequest(`/api/cricket/tickets/verify?token=${encodeURIComponent(token)}`);
};

export const updateCricketAdminConfig = async (configData: any): Promise<void> => {
  await apiRequest('/api/cricket/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_config', config: configData }),
  });
};

export const blockCricketSlotAdmin = async (slotKey: string, dateStr: string, reason?: string): Promise<void> => {
  await apiRequest('/api/cricket/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'block_slot', slot_key: slotKey, business_date: dateStr, reason }),
  });
};

export const unblockCricketSlotAdmin = async (slotKey: string): Promise<void> => {
  await apiRequest('/api/cricket/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'unblock_slot', slot_key: slotKey }),
  });
};
