import { MENU_COL } from '@/lib/firebase/collections';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { MenuItem } from '@/lib/types';

import { db } from "@/lib/firebase";
import { operationsApiRequest } from '@/lib/apiClient';


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
  await operationsApiRequest('/api/operations/catalog', {
    method: 'POST',
    body: JSON.stringify({ action: 'save', item })
  });
  queryCache.invalidate('menu');
};

export const deleteMenuItem = async (itemId: string): Promise<void> => {
  await operationsApiRequest('/api/operations/catalog', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', item_id: itemId })
  });
  queryCache.invalidate('menu');
};

// --- Stock Registry CRUD Operations ---













