import { MenuItem } from '@/lib/types';

export interface ResolvedOrderResult {
  status: 'exact' | 'ambiguous' | 'not_found';
  resolvedItems?: { item: MenuItem, quantity: number }[];
  ambiguousCandidates?: MenuItem[];
}

export function resolveOrderRequest(
  requestedName: string,
  quantity: number,
  menuItems: MenuItem[]
): ResolvedOrderResult {
  const normReq = requestedName.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  
  // 1. Exact Name Match (Normalized)
  const exactMatch = menuItems.find(i => {
    const normName = i.name.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    return normName === normReq;
  });

  if (exactMatch) {
    return {
      status: 'exact',
      resolvedItems: [{ item: exactMatch, quantity }]
    };
  }

  // 1.5 Full string occurrence
  const containsExact = menuItems.filter(i => {
    const normName = i.name.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    return ` ${normReq} `.includes(` ${normName} `);
  });
  
  if (containsExact.length === 1) {
    return {
      status: 'exact',
      resolvedItems: [{ item: containsExact[0], quantity }]
    };
  } else if (containsExact.length > 1) {
    // Check if one of them is the shortest (most basic) string and perfectly matches a subset
    // Sort by name length
    containsExact.sort((a, b) => a.name.length - b.name.length);
    if (containsExact[0].name.length < containsExact[1].name.length) {
      // e.g. "burger" vs "chicken burger" when user said "classic burger". Wait, containsExact checks if normReq contains normName.
      // If user says "classic chicken burger", containsExact might match "burger", "chicken burger", "classic chicken burger".
      // We want the longest match!
      return {
        status: 'exact',
        resolvedItems: [{ item: containsExact[containsExact.length - 1], quantity }]
      };
    }

    return {
      status: 'ambiguous',
      ambiguousCandidates: containsExact.slice(0, 3)
    };
  }

  // 2. Fuzzy Token Match
  const reqTokens = normReq.split(/\s+/).filter(t => t.length > 2);
  const candidates: { item: MenuItem, score: number, extraTokens: number }[] = [];

  for (const item of menuItems) {
    const normName = item.name.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    const itemTokens = normName.split(/\s+/).filter(t => t.length > 2);
    
    let matches = 0;
    for (const rt of reqTokens) {
      if (itemTokens.includes(rt)) {
        matches++;
      } else {
        if (itemTokens.some(it => it.includes(rt) || rt.includes(it))) {
          matches += 0.5;
        }
      }
    }

    if (matches > 0) {
      const extraTokens = Math.max(0, itemTokens.length - Math.floor(matches));
      candidates.push({ item, score: matches, extraTokens });
    }
  }

  // Filter strong candidates
  const strongCandidates = candidates.filter(c => c.score >= 1);
  
  // Sort by highest score, then fewest extra tokens
  strongCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.extraTokens - b.extraTokens;
  });

  if (strongCandidates.length === 0) {
    return { status: 'not_found' };
  }

  const top = strongCandidates[0];
  
  // If clear winner
  if (strongCandidates.length === 1 || (strongCandidates[1] && top.score > strongCandidates[1].score)) {
    return {
      status: 'exact',
      resolvedItems: [{ item: top.item, quantity }]
    };
  }

  // Genuinely ambiguous
  return {
    status: 'ambiguous',
    ambiguousCandidates: strongCandidates.map(c => c.item).slice(0, 3)
  };
}
