import { describe, expect, it } from 'vitest';
import { reconcileCartCustomizations } from '@/features/checkout/reconcileCartCustomizations';
import type { CartItem } from '@/store/useStore';
import type { MenuItem } from '@/lib/types';

const burger = {
  item_id: 'burger-1',
  name: 'Chicken Burger',
  description: 'A burger',
  price: 120,
  category: 'Burgers',
  station: 'FASTFOOD',
  is_available: true,
  is_featured: false,
  sort_order: 1,
  customizationOptions: [{
    groupName: 'Extras',
    options: [{ name: 'Extra Cheese', price: 15 }],
  }],
} satisfies MenuItem;

const cartItem: CartItem = {
  id: 'cart-1',
  menuItemId: 'burger-1',
  name: 'Chicken Burger',
  price: 145,
  quantity: 1,
  station: 'FASTFOOD',
  modifiers: ['Extra Mayo', 'Extra Cheese'],
};

describe('checkout customization reconciliation', () => {
  it('removes stale customizations and recalculates the client price before checkout', () => {
    const result = reconcileCartCustomizations([cartItem], [burger]);

    expect(result.changed).toBe(true);
    expect(result.cart[0]).toMatchObject({
      modifiers: ['Extra Cheese'],
      price: 135,
    });
  });

  it('keeps canonical customization names case-insensitively', () => {
    const result = reconcileCartCustomizations([
      { ...cartItem, price: 135, modifiers: [' extra cheese '] },
    ], [burger]);

    expect(result.changed).toBe(true);
    expect(result.cart[0].modifiers).toEqual(['Extra Cheese']);
    expect(result.cart[0].price).toBe(135);
  });
});
