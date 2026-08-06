import { z } from "zod";

// SavedAddress Schema
export const savedAddressSchema = z.object({
  id: z.string(),
  label: z.string(),
  flatNo: z.string(),
  floor: z.string().optional(),
  area: z.string(),
  landmark: z.string().optional(),
  fullAddress: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number()
  }).optional()
});

// UserDocument Schema
export const userSchema = z.object({
  user_id: z.string(),
  phone: z.string(),
  name: z.string().optional(),
  student_email: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean(),
  batch_year: z.number().optional(),
  department: z.string().optional(),
  expected_grad: z.number().optional(),
  points: z.number(),
  referral_code: z.string(),
  referred_by: z.string().optional(),
  account_status: z.enum(["active", "suspended", "blacklisted", "inactive"]),
  created_at: z.number(),
  stress_coupons_issued: z.object({
    month: z.string(),
    count: z.number()
  }).optional(),
  addresses: z.array(savedAddressSchema).optional(),
  total_completed_orders: z.number().optional(),
  successful_referrals: z.number().optional(),
  status: z.string().optional(),
  is_active: z.boolean().optional(),
  is_email_verified: z.boolean().optional()
});

// OrderItem Schema
export const orderItemSchema = z.object({
  item_id: z.string(),
  menu_item_id: z.string(),
  name: z.string(),
  quantity: z.number().int().min(1),
  unit_price: z.number(),
  unit_price_paise: z.number().int().optional(),
  station: z.enum(["FRYER", "BREWER", "FASTFOOD", "BIRYANI", "GRILLED OR STEAMED", "FASTFOOD & BIRYANI"]),
  item_status: z.enum(["ordered", "preparing", "ready"]),
  modifiers: z.array(z.string()).optional(),
  refunded_quantity: z.number().int().optional(),
  refunded_amount: z.number().optional(),
  refunded_amount_paise: z.number().int().optional()
});

// OrderDocument Schema
export const orderSchema = z.object({
  order_id: z.string(),
  token_number: z.string(),
  user_id: z.string(),
  gross_amount: z.number(),
  gross_amount_paise: z.number().int().optional(),
  subtotal_amount: z.number().optional(),
  subtotal_amount_paise: z.number().int().optional(),
  platform_fee: z.number().optional(),
  platform_fee_paise: z.number().int().optional(),
  promo_discount: z.number().optional(),
  promo_discount_paise: z.number().int().optional(),
  points_redeemed: z.number().int(),
  cash_paid: z.number(),
  order_type: z.enum(["dine-in", "pickup", "delivery"]),
  hatch: z.string().optional(),
  table_no: z.string().optional(),
  outlet: z.string().optional(),
  delivery_address: z.string().optional(),
  status: z.enum([
    "pending", "accepted", "confirmed", "preparing", "ready", 
    "dispatched", "out_for_delivery", "delivered", "completed", 
    "cancelled", "rejected"
  ]),
  fulfillment_status: z.enum(["dispatched", "out_for_delivery", "delivered"]).optional(),
  estimated_time_mins: z.number(),
  items: z.array(orderItemSchema),
  created_at: z.number(),
  updated_at: z.number().optional(),
  completed_at: z.number().optional(),
  rider_id: z.string().optional(),
  delivery_coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  rush_held: z.boolean().optional(),
  feedback: z.object({
    rating: z.number(),
    comment: z.string(),
    submitted_at: z.number()
  }).optional(),
  otp: z.string().optional(),
  payment_status: z.string().optional(),
  is_paid: z.boolean().optional(),
  refunded_amount: z.number().optional(),
  refunded_amount_paise: z.number().int().optional(),
  refund_status: z.string().optional(),
  refund_payment_status: z.enum(["paid", "partial_pending"]).optional()
});

// Outlet Schema
export const outletSchema = z.object({
  id: z.string(),
  outlet_id: z.string().optional(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  status: z.enum(["active", "closed", "maintenance"]),
  hatches: z.array(z.string()).optional(),
  created_at: z.number()
});

// StaffShift Schema
export const staffShiftSchema = z.object({
  id: z.string(),
  day: z.string(),
  date: z.string(),
  time: z.string(),
  type: z.string()
});

// Staff Schema
export const staffSchema = z.object({
  id: z.string(),
  employee_id: z.string(),
  name: z.string(),
  email: z.string().email().optional(),
  role: z.enum([
    "owner", "manager", "deep_fryer", "grill_fryer", 
    "biryani_master", "brewer", "rider"
  ]),
  outlet: z.string(),
  pending_transfer: z.object({
    target_outlet: z.string(),
    effective_time: z.number()
  }).optional(),
  passcode: z.string().optional(),
  status: z.enum(["active", "offline", "suspended"]),
  created_at: z.number(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().optional(),
    updated_at: z.number()
  }).optional(),
  schedule: z.array(staffShiftSchema).optional(),
  faceDescriptor: z.any().optional(),
  phone: z.string().optional(),
  shift_start: z.string().optional(),
  shift_end: z.string().optional(),
  salary: z.number().optional(),
  hourly_rate: z.number().optional(),
  attendance_status: z.string().optional(),
  break_start: z.number().optional(),
  break_end: z.number().optional(),
  assigned_hatch: z.string().optional(),
  hire_date: z.string().optional(),
  performance_rating: z.number().optional()
});

// StockItem Schema
export const stockItemSchema = z.object({
  stock_id: z.string(),
  menu_item_id: z.string(),
  outlet_id: z.string().optional(),
  name: z.string(),
  current_quantity: z.number(),
  unit: z.string(),
  low_threshold: z.number(),
  last_updated: z.number(),
  updated_by: z.string().optional(),
  tracking_type: z.enum(["bulk", "pack"]).optional(),
  pieces_per_pack: z.number().optional(),
  cost_per_unit: z.number().optional(),
  cost_per_unit_paise: z.number().int().optional()
});

// Safe Document Parser
export function parseDocument<T extends z.ZodTypeAny>(schema: T, data: unknown, documentId: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[SCHEMA WARNING] Document "${documentId}" failed validation:`, result.error.format());
    return data as z.infer<T>; // Fallback to raw data for live resilience
  }
  return result.data;
}
