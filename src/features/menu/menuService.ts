import { MENU_COL } from '@/lib/firebase/collections';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { MenuItem } from '@/lib/types';

import { db, auth } from "@/lib/firebase";


import { queryCache } from '@/lib/queryCache';

export const fetchMenuItems = async (bypassCache = false): Promise<MenuItem[]> => {
  return queryCache.query<MenuItem[]>({
    key: 'menu:main',
    forceRefresh: bypassCache,
    ttlMs: 5 * 60 * 1000,
    timeoutMs: 4000,
    fetcher: async () => {
      const q = query(collection(db, MENU_COL), orderBy("sort_order", "asc"));
      const snap = await getDocs(q);
      const items: MenuItem[] = [];
      snap.forEach((docSnap: any) => {
        const data = docSnap.data();
        if (!data.deleted) {
          items.push(data as MenuItem);
        }
      });
      return items;
    }
  });
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
  queryCache.invalidate('menu');
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
  queryCache.invalidate('menu');
};

// --- Stock Registry CRUD Operations ---













