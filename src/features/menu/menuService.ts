import { MENU_COL } from '@/lib/firebase/collections';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { MenuItem } from '@/lib/types';

import { db, auth } from "@/lib/firebase";


import { getCachedData, setCachedData } from '@/lib/clientCache';

export const fetchMenuItems = async (bypassCache = false): Promise<MenuItem[]> => {
  const cacheKey = 'menu_items';
  if (!bypassCache) {
    const cached = getCachedData<MenuItem[]>(cacheKey, 5 * 60 * 1000);
    if (cached) return cached;
  }

  try {
    const q = query(collection(db, MENU_COL), orderBy("sort_order", "asc"));
    const snap = await Promise.race([
      getDocs(q),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]);
    const items: MenuItem[] = [];
    snap.forEach((doc: any) => {
      const data = doc.data();
      if (!data.deleted) {
        items.push(data as MenuItem);
      }
    });
    setCachedData(cacheKey, items);
    return items;
  } catch (err) {
    console.error("Failed to fetch menu items from Firestore:", err);
    throw err;
  }
};

export const saveMenuItem = async (item: MenuItem): Promise<void> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Authentication required");

  const res = await fetch('/api/operations/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ action: 'save', item })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to save menu item');
  }
};

export const deleteMenuItem = async (itemId: string): Promise<void> => {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Authentication required");

  const res = await fetch('/api/operations/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ action: 'delete', item_id: itemId })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete menu item');
  }
};

// --- Stock Registry CRUD Operations ---













