import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  arrayUnion 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CRICKET_BOOKINGS_COL, CRICKET_LOBBIES_COL } from '@/lib/firebase/collections';
import { CricketBooking, SocialLobby } from '@/stores/useStore';

export interface CricketConfig {
  basePrice: number;
  openingTime: string;
  closingTime: string;
  blockedSlots: string[]; // List of dateKey:timeSlot (e.g. "Jul 16:07:00 PM")
}

/**
 * Stream Box Cricket owner settings (pricing, hours, blocked slots)
 */
export const streamCricketConfig = (callback: (config: CricketConfig) => void) => {
  return onSnapshot(doc(db, "config", "cricket_settings"), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as CricketConfig);
    } else {
      callback({
        basePrice: 800,
        openingTime: "06:00 AM",
        closingTime: "11:00 PM",
        blockedSlots: []
      });
    }
  }, (err) => {
    console.error("Failed to stream cricket config: ", err);
  });
};

/**
 * Save Box Cricket owner settings
 */
export const saveCricketConfig = async (config: Partial<CricketConfig>): Promise<void> => {
  const docRef = doc(db, "config", "cricket_settings");
  await setDoc(docRef, config, { merge: true });
};

/**
 * Stream all cricket bookings
 */
export const streamBookings = (callback: (bookings: CricketBooking[]) => void) => {
  const q = query(collection(db, CRICKET_BOOKINGS_COL), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const list: CricketBooking[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as CricketBooking);
    });
    callback(list);
  }, (err) => {
    console.error("Failed to stream bookings: ", err);
  });
};

/**
 * Stream all social match lobbies
 */
export const streamLobbies = (callback: (lobbies: SocialLobby[]) => void) => {
  const q = query(collection(db, CRICKET_LOBBIES_COL), orderBy("lobbyId", "desc"));
  return onSnapshot(q, (snapshot) => {
    const list: SocialLobby[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as SocialLobby);
    });
    callback(list);
  }, (err) => {
    console.error("Failed to stream lobbies: ", err);
  });
};

/**
 * Add a new cricket booking
 */
export const addBooking = async (booking: CricketBooking): Promise<void> => {
  const docRef = doc(db, CRICKET_BOOKINGS_COL, booking.bookingId);
  await setDoc(docRef, booking);
};

/**
 * Add a new social lobby
 */
export const addLobby = async (lobby: SocialLobby): Promise<void> => {
  const docRef = doc(db, CRICKET_LOBBIES_COL, lobby.lobbyId);
  await setDoc(docRef, lobby);
};

/**
 * Join an existing social match lobby
 */
export const joinLobby = async (lobbyId: string, playerName: string): Promise<void> => {
  const docRef = doc(db, CRICKET_LOBBIES_COL, lobbyId);
  await updateDoc(docRef, {
    players: arrayUnion(playerName)
  });
};

/**
 * Delete a cricket booking
 */
export const deleteBooking = async (bookingId: string): Promise<void> => {
  await deleteDoc(doc(db, CRICKET_BOOKINGS_COL, bookingId));
};

/**
 * Delete a social match lobby
 */
export const deleteLobby = async (lobbyId: string): Promise<void> => {
  await deleteDoc(doc(db, CRICKET_LOBBIES_COL, lobbyId));
};

/**
 * Update remaining payment status for a booking
 */
export const updateBookingRemainingPayment = async (bookingId: string, status: 'paid' | 'unpaid'): Promise<void> => {
  const docRef = doc(db, CRICKET_BOOKINGS_COL, bookingId);
  await updateDoc(docRef, {
    remainingPaidStatus: status
  });
};
