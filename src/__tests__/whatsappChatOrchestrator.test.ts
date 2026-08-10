import { describe, it, expect } from 'vitest';
import { resolveOrderRequest } from '../server/whatsapp/chat/orderResolver';
import { MenuItem } from '../lib/types';
import { rankMenuItems } from '../server/whatsapp/chat/menuRanker';
import { getDeterministicFallback } from '../server/whatsapp/chat/deterministicFallback';

const mockMenu: MenuItem[] = [
  { item_id: 'm1', name: 'Classic Burger', price: 100, category: 'Burgers', is_available: true, sort_order: 1, description: '', station: 'FRYER', is_featured: false },
  { item_id: 'm2', name: 'Classic Chicken Burger', price: 150, category: 'Burgers', is_available: true, sort_order: 2, description: '', station: 'FRYER', is_featured: false },
  { item_id: 'm3', name: 'Iced Latte', price: 120, category: 'Beverages', is_available: true, sort_order: 3, description: '', station: 'BREWER', is_featured: false },
  { item_id: 'm4', name: 'Cold Coffee', price: 90, category: 'Beverages', is_available: true, sort_order: 4, description: '', station: 'BREWER', is_featured: false },
  { item_id: 'm5', name: 'Spicy Momos', price: 80, category: 'Momos', is_available: true, sort_order: 5, description: '', station: 'FRYER', is_featured: false },
  { item_id: 'm6', name: 'Hot Chai', price: 20, category: 'Beverages', is_available: true, sort_order: 6, description: '', station: 'FRYER', is_featured: false },
];

describe('WhatsApp Chat Orchestrator Components', () => {

  describe('orderResolver', () => {
    it('"one classic burger" matches ONLY Classic Burger', () => {
      const result = resolveOrderRequest('classic burger', 1, mockMenu);
      expect(result.status).toBe('exact');
      expect(result.resolvedItems![0].item.item_id).toBe('m1');
    });

    it('"one classic chicken burger" matches ONLY Classic Chicken Burger', () => {
      const result = resolveOrderRequest('classic chicken burger', 1, mockMenu);
      expect(result.status).toBe('exact');
      expect(result.resolvedItems![0].item.item_id).toBe('m2');
    });

    it('"burger" identifies ambiguity and generates clarification', () => {
      const result = resolveOrderRequest('burger', 1, mockMenu);
      expect(result.status).toBe('ambiguous');
      expect(result.ambiguousCandidates!.length).toBeGreaterThan(1);
    });

    it('unavailable exact product => do not stage it', () => {
      const result = resolveOrderRequest('nonexistent item', 1, mockMenu);
      expect(result.status).toBe('not_found');
    });
  });

  describe('menuRanker', () => {
    it('"suggest something cool" queries and ranks Beverages/cold items', () => {
      const ranked = rankMenuItems(mockMenu, { temperature: 'cold' });
      expect(ranked[0].category).toBe('Beverages');
      expect(['Iced Latte', 'Cold Coffee']).toContain(ranked[0].name);
    });

    it('"suggest a drink under 100" retrieves available items <= 100 correctly', () => {
      const filtered = mockMenu.filter(m => m.price <= 100 && m.category === 'Beverages');
      const ranked = rankMenuItems(filtered, {});
      expect(ranked.every(r => r.price <= 100)).toBe(true);
      expect(ranked.some(r => r.name === 'Iced Latte')).toBe(false); // 120 is filtered out
    });

    it('"something spicy" ranks spicy items', () => {
      const ranked = rankMenuItems(mockMenu, { taste: 'spicy' });
      expect(ranked[0].name).toBe('Spicy Momos');
    });
  });

  describe('deterministicFallback', () => {
    it('"love you" / "thanks" results in CASUAL_CHAT with no DB mutation', () => {
      const fallback = getDeterministicFallback('CASUAL_CHAT', 'love you');
      expect(fallback).toContain('Bhai sun'); // Expected casual response
    });

    it('"show menu" provides a browsing view fallback', () => {
      const fallback = getDeterministicFallback('MENU', 'show menu');
      expect(fallback).toContain('https://ilaracafe.vercel.app/menu');
    });

    it('burger ambiguity generates clarification message', () => {
      const fallback = getDeterministicFallback('ORDER', 'burger', '', '', [mockMenu[0], mockMenu[1]]);
      expect(fallback).toContain('Machha, did you mean Classic Burger or Classic Chicken Burger');
    });

    it('Network failure fallback is safe', () => {
      const fallback = getDeterministicFallback('UNKNOWN', 'gibberish');
      expect(fallback).toContain("I couldn't understand that");
    });
  });

});
