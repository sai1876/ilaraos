import { OFFERS_COL } from '@/lib/firebase/collections';
import { collection, getDocs } from 'firebase/firestore';
import { Offer } from '@/lib/types';

import { db, auth } from "@/lib/firebase";


import { queryCache } from '@/lib/queryCache';

export const fetchOffers = async (bypassCache = false): Promise<Offer[]> => {
  return queryCache.query<Offer[]>({
    key: 'offers:main',
    forceRefresh: bypassCache,
    ttlMs: 10 * 60 * 1000,
    timeoutMs: 3000,
    fetcher: async () => {
      const snap = await getDocs(collection(db, OFFERS_COL));
      const offers: Offer[] = [];
      snap.forEach((docSnap: any) => {
        const data = docSnap.data();
        if (!data.deleted) {
          offers.push(data as Offer);
        }
      });
      return offers;
    }
  });
};

export const saveOffer = async (offer: Offer): Promise<void> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Authentication required");

  const res = await fetch('/api/operations/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ action: 'save', offer })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to save offer');
  }
  queryCache.invalidate('offers');
};

export const deleteOffer = async (code: string): Promise<void> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Authentication required");

  const res = await fetch('/api/operations/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ action: 'delete', code })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete offer');
  }
  queryCache.invalidate('offers');
};

// --- Staff CRUD Operations ---



