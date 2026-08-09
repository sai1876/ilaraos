import { MenuItem } from '@/lib/types';
import { IntentConstraints } from './types';

export function rankMenuItems(items: MenuItem[], constraints?: IntentConstraints, query?: string): MenuItem[] {
  const scoredItems = items.map(item => {
    let score = 0;
    const text = `${item.name} ${item.description || ''} ${item.category}`.toLowerCase();

    // 1. Featured boost
    if (item.is_featured) score += 10;

    // 2. Sort order base
    score += Math.max(0, (100 - (item.sort_order || 99))) / 10;

    // 3. Constraints matching (soft)
    if (constraints) {
      if (constraints.temperature === 'cold' && (text.includes('iced') || text.includes('cold') || text.includes('chilled') || item.category === 'Beverages' || text.includes('shake'))) {
        score += 50; // Strong preference
      }
      if (constraints.temperature === 'hot' && (text.includes('hot') || text.includes('warm') || text.includes('chai') || text.includes('coffee'))) {
        score += 50;
      }
      if (constraints.taste && text.includes(constraints.taste.toLowerCase())) {
        score += 20;
      }
      if (constraints.appetite === 'light' && (text.includes('snack') || text.includes('lite') || item.price < 150)) {
        score += 10;
      }
      if (constraints.appetite === 'filling' && (text.includes('meal') || text.includes('bowl') || item.price > 200)) {
        score += 10;
      }
    }

    // 4. Query matching
    if (query) {
      const qTokens = query.toLowerCase().split(/\s+/);
      for (const t of qTokens) {
        if (t.length > 2 && text.includes(t)) {
          score += 15;
        }
      }
    }

    return { item, score };
  });

  // Sort descending by score
  scoredItems.sort((a, b) => b.score - a.score);

  // Return top 3
  return scoredItems.slice(0, 3).map(s => s.item);
}
