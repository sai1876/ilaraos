import type { MenuItem } from '@/lib/types';
import type { CartItem } from '@/store/useStore';

const normalize = (value: string) => value.trim().toLowerCase();

export function reconcileCartCustomizations(cart: CartItem[], menuItems: MenuItem[]) {
  let changed = false;

  const reconciledCart = cart.map(cartItem => {
    const menuItem = menuItems.find(item => item.item_id === cartItem.menuItemId);
    if (!menuItem) return cartItem;

    const availableOptions = (menuItem.customizationOptions || [])
      .flatMap(group => group.options || []);
    const optionsByName = new Map(availableOptions.map(option => [normalize(option.name), option]));
    const seen = new Set<string>();
    const modifiers = (cartItem.modifiers || []).flatMap(modifier => {
      const normalized = normalize(modifier);
      const option = optionsByName.get(normalized);
      if (!option || seen.has(normalized)) return [];
      seen.add(normalized);
      return [option.name];
    });
    const price = menuItem.price + modifiers.reduce((total, modifier) =>
      total + (optionsByName.get(normalize(modifier))?.price || 0), 0);
    const modifiersChanged = modifiers.length !== (cartItem.modifiers || []).length
      || modifiers.some((modifier, index) => modifier !== cartItem.modifiers?.[index]);

    if (modifiersChanged || price !== cartItem.price) {
      changed = true;
      return { ...cartItem, modifiers, price };
    }

    return cartItem;
  });

  return { cart: reconciledCart, changed };
}
