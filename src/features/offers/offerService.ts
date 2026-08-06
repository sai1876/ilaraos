import { OFFERS_COL } from '@/lib/firebase/collections';
import { collection, getDocs } from 'firebase/firestore';
import { Offer } from '@/lib/types';

import { db, auth } from "@/lib/firebase";


import { getCachedData, setCachedData } from '@/lib/clientCache';

export const fetchOffers = async (bypassCache = false): Promise<Offer[]> => {
  const cacheKey = 'offers';
  if (!bypassCache) {
    const cached = getCachedData<Offer[]>(cacheKey, 5 * 60 * 1000);
    if (cached) return cached;
  }

  try {
    const snap = await Promise.race([
      getDocs(collection(db, OFFERS_COL)),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]);
    const offers: Offer[] = [];
    snap.forEach((doc: any) => {
      const data = doc.data();
      if (!data.deleted) {
        offers.push(data as Offer);
      }
    });
    setCachedData(cacheKey, offers);
    return offers;
  } catch (err) {
    console.error("Failed to fetch offers from Firestore:", err);
    throw err;
  }
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
};

// --- Staff CRUD Operations ---



