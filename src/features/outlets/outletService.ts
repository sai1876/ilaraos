import { OUTLETS_COL } from '@/lib/firebase/collections';
import { collection, getDocs } from 'firebase/firestore';
import { Outlet } from '@/lib/types';

import { db } from "@/lib/firebase";


const fallbackOutlets: Outlet[] = [
  {
    id: 'hyd_campus',
    outlet_id: 'hyd_campus',
    name: 'HYD CAMPUS',
    address: 'IIIT Hyderabad Campus, Gachibowli, Hyderabad, Telangana 500032',
    latitude: 17.4482,
    longitude: 78.3489,
    status: 'active',
    hatches: ['OASIS', 'CANOPY'],
    created_at: Date.now()
  }
];

import { queryCache } from '@/lib/queryCache';

export const fetchOutlets = async (bypassCache = false): Promise<Outlet[]> => {
  return queryCache.query<Outlet[]>({
    key: 'outlets:main',
    forceRefresh: bypassCache,
    ttlMs: 15 * 60 * 1000,
    timeoutMs: 3000,
    fetcher: async () => {
      try {
        const snap = await getDocs(collection(db, OUTLETS_COL));
        const outlets: Outlet[] = [];
        snap.forEach((docSnap: any) => {
          outlets.push(docSnap.data() as Outlet);
        });
        return outlets.length === 0 ? fallbackOutlets : outlets;
      } catch (err) {
        console.error("Failed to fetch outlets from Firestore, returning fallbackOutlets:", err);
        return fallbackOutlets;
      }
    }
  });
};

export const getOutletCoordinates = async (outletId: string): Promise<{latitude: number, longitude: number} | null> => {
  const outlets = await fetchOutlets();
  const outlet = outlets.find(o => o.id === outletId);
  if (outlet) {
    return { latitude: outlet.latitude, longitude: outlet.longitude };
  }
  return null;
};

// --- Delivery Actions ---





