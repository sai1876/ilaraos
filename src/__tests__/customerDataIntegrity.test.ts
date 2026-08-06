import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculatePricingPreview } from '../features/checkout/clientPricingPreview';
import { generateHourlyTimeSlots } from '../features/cricket/timeSlots';

describe('customer data integrity fixes', () => {
  it('generates contiguous 60-minute cricket slots on the hour', () => {
    const slots = generateHourlyTimeSlots();
    expect(slots[0]).toBe('06:00 AM - 07:00 AM');
    expect(slots[1]).toBe('07:00 AM - 08:00 AM');
    expect(slots.at(-1)).toBe('10:00 PM - 11:00 PM');
    expect(slots).toHaveLength(17);
  });

  it('uses the same two-decimal promo discount in the total', () => {
    const preview = calculatePricingPreview({
      cart: [{ price: 135, quantity: 1 }], platformFee: 5, promoApplied: true,
      promoDiscountPercent: 10, promoScope: 'All', activeBalance: 0,
      pointsInput: 0, menuItems: [],
    });
    expect(preview.promoDiscount).toBe(13.5);
    expect(preview.total).toBe(126.5);
  });

  it('owns the order listener in the customer layout and deduplicates service results', () => {
    const root = path.resolve(__dirname, '..');
    const layout = fs.readFileSync(path.join(root, 'app/(customer)/layout.tsx'), 'utf8');
    const floating = fs.readFileSync(path.join(root, 'components/customer/FloatingOrderTracker.tsx'), 'utf8');
    const inline = fs.readFileSync(path.join(root, 'components/customer/OrderTracker.tsx'), 'utf8');
    const service = fs.readFileSync(path.join(root, 'features/orders/orderService.ts'), 'utf8');
    expect(layout).toContain('streamUserOrders(user.uid');
    expect(floating).not.toContain('streamUserOrders(');
    expect(inline).not.toContain('streamUserOrders(');
    expect(service).toContain('new Map(orders.map((order) => [order.order_id, order]))');
  });
});
