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

import { getCachedData, setCachedData } from '@/lib/clientCache';

export const fetchOutlets = async (bypassCache = false): Promise<Outlet[]> => {
  const cacheKey = 'outlets';
  if (!bypassCache) {
    const cached = getCachedData<Outlet[]>(cacheKey, 10 * 60 * 1000);
    if (cached) return cached;
  }

  try {
    const snap = await Promise.race([
      getDocs(collection(db, OUTLETS_COL)),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]);
    const outlets: Outlet[] = [];
    snap.forEach((doc: any) => {
      outlets.push(doc.data() as Outlet);
    });
    const finalOutlets = outlets.length === 0 ? fallbackOutlets : outlets;
    setCachedData(cacheKey, finalOutlets);
    return finalOutlets;
  } catch (err) {
    console.error("Failed to fetch outlets from Firestore, falling back to fallbackOutlets: ", err);
    return fallbackOutlets;
  }
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





