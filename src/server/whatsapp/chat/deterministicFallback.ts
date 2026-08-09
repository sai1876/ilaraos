import { ChatIntent } from './types';
import { MenuItem } from '@/lib/types';

export function getDeterministicFallback(
  intent: ChatIntent,
  message: string,
  checkoutLink: string = '',
  orderSummary: string = '',
  ambiguousItems: MenuItem[] = [],
  retrievedItems: MenuItem[] = []
): string {
  if (checkoutLink) {
    return `Arre yaar, pakka set! I've added ${orderSummary} to your cart. Complete your order here: ${checkoutLink} 🍛`;
  }
  
  if (ambiguousItems.length > 0) {
    const names = ambiguousItems.map(i => i.name).join(' or ');
    return `Machha, did you mean ${names}? Please tell me exactly which one you want.`;
  }
  
  if (intent === 'RECOMMEND' || intent === 'MENU') {
    if (retrievedItems.length > 0) {
      const picks = retrievedItems.map(i => `• ${i.name} (₹${i.price})`).join('\n');
      return `Bhai suggests:\n${picks}\n\nOrder here: https://ilaracafe.vercel.app/menu`;
    } else {
      return `Sorry yaar, couldn't find what you're looking for right now. Check our full menu at https://ilaracafe.vercel.app/menu`;
    }
  }

  if (intent === 'CASUAL_CHAT' || intent === 'GREETING') {
    return 'Bhai sun — aa ja oasis pe, good food fixes everything. Kya order karein?';
  }

  if (intent === 'ORDER_STATUS' || intent === 'CART') {
    return `Check your active orders and cart here: https://ilaracafe.vercel.app`;
  }

  return "I couldn't understand that just now. Try again or send 'menu'.";
}
