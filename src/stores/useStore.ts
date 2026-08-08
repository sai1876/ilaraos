import { create } from 'zustand';
import { UserDocument, OrderDocument, MenuItem } from '@/lib/types';
import { queryCache } from '@/lib/queryCache';

export interface CartItem {
  id: string; // Internal cart ID
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  station: MenuItem['station'];
  modifiers?: string[]; // Selected customizations
}

export interface CricketBooking {
  bookingId: string;
  date: string; // e.g. "Today", "Thu 13"
  timeSlot: string; // e.g. "06:00 PM"
  duration: number; // hours
  turfName: string;
  price: number;
  addons?: { name: string; price: number; quantity: number }[];
  splitFriends?: string[];
  paymentMethod?: string;
  totalPaid?: number;
  isConfirmed: boolean;
  createdAt?: number;
  slotKeys?: string[];
  businessDate?: string;
  ticketToken?: string;
  remainingPaidStatus?: string;
  paymentStatus?: string;
  expiresAt?: number;
}

export interface SocialLobby {
  lobbyId: string;
  title: string;
  hostName: string;
  hostAvatar?: string;
  date: string;
  time: string;
  spotsTotal: number;
  players: string[]; // List of names
}

interface AppState {
  // Auth state
  user: { uid: string; phone: string } | null;
  userProfile: UserDocument | null;
  authLoading: boolean;
  setUser: (user: { uid: string; phone: string } | null) => void;
  setUserProfile: (profile: UserDocument | null) => void;
  setAuthLoading: (loading: boolean) => void;
  
  // Outlet state
  customerOutlet: string;
  setCustomerOutlet: (outlet: string) => void;
  
  // UI Theme (Weather / Occasion driven)
  theme: 'default' | 'scorching' | 'raining' | 'night' | 'exam' | 'fest' | 'valentines' | 'custom';
  setTheme: (theme: AppState['theme']) => void;

  // Category filter state
  activeCategory: string;
  setActiveCategory: (category: string) => void;
  
  // Cart state
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;

  // Real-time Cloud Sync
  activeOrders: OrderDocument[];
  setActiveOrders: (orders: OrderDocument[]) => void;

  // Tracker Modal UI State
  isTrackerOpen: boolean;
  setIsTrackerOpen: (open: boolean) => void;
  selectedTrackerOrderId: string | null;
  setSelectedTrackerOrderId: (id: string | null) => void;
  
  // Social & Box Cricket state
  myBookings: CricketBooking[];
  activeLobbies: SocialLobby[];
  currentBooking: CricketBooking | null;
  setCurrentBooking: (booking: CricketBooking | null) => void;
  addBooking: (booking: CricketBooking) => void;
  addLobby: (lobby: SocialLobby) => void;
  joinLobby: (lobbyId: string, player: string) => void;
  
  resetStore: () => void;
}

import { persist } from 'zustand/middleware';

// Default active lobbies on startup
const DEFAULT_LOBBIES: SocialLobby[] = [
  {
    lobbyId: "lobby-1",
    title: "5v5 Friendly Match",
    hostName: "Aryan Sharma",
    date: "Tomorrow",
    time: "06:00 PM",
    spotsTotal: 10,
    players: ["Aryan Sharma", "Karan Malhotra", "Riya Sen", "Vikram Rathore", "Neha Kapoor", "Siddharth Goel", "Ananya Pandey", "Kabir Roy"]
  },
  {
    lobbyId: "lobby-2",
    title: "Under-19 Net Practice",
    hostName: "Sneha Reddy",
    date: "Today",
    time: "05:00 PM",
    spotsTotal: 6,
    players: ["Sneha Reddy", "Amit Patel"]
  },
  {
    lobbyId: "lobby-3",
    title: "Casual Weekend Hitout",
    hostName: "Rohan Verma",
    date: "Saturday",
    time: "04:00 PM",
    spotsTotal: 8,
    players: ["Rohan Verma", "Priya Nair", "Manish Joshi"]
  }
];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      userProfile: null,
      authLoading: true,
      setUser: (user) => set({ user }),
      setUserProfile: (userProfile) => set({ userProfile }),
      setAuthLoading: (authLoading) => set({ authLoading }),
      
      customerOutlet: 'Main Outlet', // Default
      setCustomerOutlet: (customerOutlet) => set({ customerOutlet }),
      
      theme: 'default',
      setTheme: (theme) => set({ theme }),

      activeCategory: 'All',
      setActiveCategory: (activeCategory) => set({ activeCategory }),
      
      cart: [],
      addToCart: (item) => set((state) => {
        // Check if identical item (same itemId and modifiers) is already in the cart
        const existingIndex = state.cart.findIndex(
          (i) => i.menuItemId === item.menuItemId && 
          JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || [])
        );

        if (existingIndex > -1) {
          const updatedCart = [...state.cart];
          updatedCart[existingIndex].quantity += item.quantity;
          return { cart: updatedCart };
        }

        return {
          cart: [...state.cart, { ...item, id: Math.random().toString(36).substring(7) }]
        };
      }),
      removeFromCart: (id) => set((state) => ({
        cart: state.cart.filter((i) => i.id !== id)
      })),
      updateQuantity: (id, delta) => set((state) => ({
        cart: state.cart.map((item) => {
          if (item.id === id) {
            const newQuantity = Math.max(1, item.quantity + delta);
            return { ...item, quantity: newQuantity };
          }
          return item;
        })
      })),
      clearCart: () => set({ cart: [] }),
      setCart: (items) => set({ cart: items }),

      activeOrders: [],
      setActiveOrders: (activeOrders) => set({ activeOrders }),

      isTrackerOpen: false,
      setIsTrackerOpen: (isTrackerOpen) => set({ isTrackerOpen }),
      selectedTrackerOrderId: null,
      setSelectedTrackerOrderId: (selectedTrackerOrderId) => set({ selectedTrackerOrderId }),
      
      // Social Booking state initializers
      myBookings: [],
      activeLobbies: DEFAULT_LOBBIES,
      currentBooking: null,
      setCurrentBooking: (currentBooking) => set({ currentBooking }),
      addBooking: (booking) => set((state) => ({ myBookings: [booking, ...state.myBookings] })),
      addLobby: (lobby) => set((state) => ({ activeLobbies: [lobby, ...state.activeLobbies] })),
      joinLobby: (lobbyId, player) => set((state) => ({
        activeLobbies: state.activeLobbies.map((lobby) => {
          if (lobby.lobbyId === lobbyId && !lobby.players.includes(player) && lobby.players.length < lobby.spotsTotal) {
            return { ...lobby, players: [...lobby.players, player] };
          }
          return lobby;
        })
      })),
      
      resetStore: () => {
        queryCache.clearAll();
        return set({
          user: null,
          userProfile: null,
          authLoading: true,
          cart: [],
          activeOrders: [],
          selectedTrackerOrderId: null,
          isTrackerOpen: false,
          myBookings: [],
          activeLobbies: DEFAULT_LOBBIES,
          currentBooking: null
        });
      }
    }),
    {
      name: 'ilara-storage',
      partialize: (state) => ({ 
        cart: state.cart, 
        user: state.user, 
        userProfile: state.userProfile,
        theme: state.theme,
        customerOutlet: state.customerOutlet,
        myBookings: state.myBookings,
        activeLobbies: state.activeLobbies
      }),
    }
  )
);
