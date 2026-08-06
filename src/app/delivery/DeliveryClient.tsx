'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Package, CheckCircle, Navigation, Bike, Clock, ChevronRight, Phone, User, History, HelpCircle, Power, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Staff } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { markOrderAsDelivered } from '@/lib/dbService';
import { apiRequest } from '@/lib/apiClient';

const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false });

type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet';

type DeliveryAddress = string | {
  fullAddress?: string;
  lat?: number;
  lng?: number;
};

type DeliveryOrder = {
  order_id: string;
  display_order_code?: string;
  token_number?: string;
  status: 'dispatched' | 'out_for_delivery';
  order_type: 'delivery';
  delivery_address?: DeliveryAddress;
  delivery_coordinates?: { lat: number; lng: number };
  is_paid?: boolean;
  payment_status?: string;
  items: Array<{ item_id?: string; name?: string; quantity?: number }>;
  created_at: number;
  customer_phone?: string | null;
  payment_method?: PaymentMethod;
};

type DeliveryHistory = {
  order_id: string;
  display_order_code?: string;
  token_number?: string;
  created_at: number;
  completed_at?: number;
  item_count: number;
};

interface DeliveryFeed {
  rider: {
    id: string;
    employee_id: string;
    name: string;
    role: 'rider';
    outlet_id: string;
    status: 'active' | 'offline';
  };
  assignments: DeliveryOrder[];
  history: DeliveryHistory[];
}

function formatDeliveryAddress(address: DeliveryAddress | undefined): string {
  if (typeof address === 'string') return address;
  if (!address) return '';
  if (address.fullAddress) return address.fullAddress;
  if (typeof address.lat === 'number' && typeof address.lng === 'number') {
    return `Coordinates: ${address.lat.toFixed(6)}, ${address.lng.toFixed(6)}`;
  }
  return '';
}

export default function DeliveryClient() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  
  // Verification states
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Profile states
  const [showProfile, setShowProfile] = useState(false);
  const [riderDetails, setRiderDetails] = useState<Staff | null>(null);
  const [orderHistory, setOrderHistory] = useState<DeliveryHistory[]>([]);

  const loadFeed = useCallback(async (silent = false) => {
    if (!silent) setFeedLoading(true);
    try {
      const feed = await apiRequest<DeliveryFeed>('/api/operations/delivery');
      setOrders(feed.assignments);
      setOrderHistory(feed.history);
      setRiderDetails({
        id: feed.rider.id,
        employee_id: feed.rider.employee_id,
        name: feed.rider.name,
        role: 'rider',
        outlet: feed.rider.outlet_id,
        status: feed.rider.status,
        created_at: 0,
      });
      setFeedError(null);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Delivery feed unavailable');
    } finally {
      if (!silent) setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (initial: boolean) => {
      await loadFeed(!initial);
      if (active) timer = setTimeout(() => void poll(false), 5000);
    };
    void poll(true);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [loadFeed]);

  const availableOrders = orders.filter(o => o.status === 'dispatched');
  const activeDeliveries = orders.filter(o => o.status === 'out_for_delivery');
  const isDelivering = activeDeliveries.length > 0;

  // Broadcast location when delivering
  useEffect(() => {
    let watchId: number | undefined;
    let lastBroadcast = 0;
    let wakeLock: { release: () => Promise<void> } | null = null;
    
    if (isDelivering) {
      // 1. Request Screen Wake Lock to keep phone active while delivering
      if ('wakeLock' in navigator) {
        const wakeLockNavigator = navigator as Navigator & {
          wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        wakeLockNavigator.wakeLock.request('screen')
          .then(lock => { wakeLock = lock; })
          .catch(err => console.info('Wake Lock unavailable:', err));
      }

      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            // 2. Filter out highly inaccurate "ghost" spikes (e.g. cell tower fallback)
            // If the GPS accuracy radius is worse than 60 meters, ignore it to prevent the map marker from wildly jumping
            if (pos.coords.accuracy > 60) return;

            const now = Date.now();
            if (now - lastBroadcast > 5000) {
              lastBroadcast = now;
              try {
                await apiRequest('/api/operations/delivery', {
                  method: 'POST',
                  body: JSON.stringify({
                    action: 'location',
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                  }),
                });
              } catch (e) {
                console.error('Failed to broadcast location:', e);
              }
            }
          },
          (err) => console.error('Geolocation error:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }

    return () => {
      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (wakeLock) {
        wakeLock.release().catch(console.error);
      }
    };
  }, [isDelivering]);

  const toggleSelection = (orderId: string) => {
    const order = availableOrders.find(o => o.order_id === orderId);
    if (!order) return;
    
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(orderId)) {
      newSet.delete(orderId);
    } else {
      newSet.add(orderId);
    }
    setSelectedOrderIds(newSet);
  };

  const startBatchRoute = async () => {
    if (selectedOrderIds.size === 0) return;
    
    // Convert Set to Array
    const orderIds = Array.from(selectedOrderIds);
    const selectedOrders = availableOrders.filter(o => selectedOrderIds.has(o.order_id));
    
    try {
      setCommandBusy(true);
      await apiRequest('/api/operations/delivery', {
        method: 'POST',
        body: JSON.stringify({ action: 'start_route', order_ids: orderIds }),
      });
      setSelectedOrderIds(new Set());
      await loadFeed(true);
      
      // Open Google Maps
      if (selectedOrders.length > 0) {
        let mapsUrl = `https://www.google.com/maps/dir/?api=1`;
        
        // Use outlet location as origin ideally, but for now we let it use current location if omitted,
        // or just pass destination and waypoints
        const destination = selectedOrders[selectedOrders.length - 1];
        if (destination.delivery_coordinates) {
            mapsUrl += `&destination=${destination.delivery_coordinates.lat},${destination.delivery_coordinates.lng}`;
        } else {
            const destAddr = formatDeliveryAddress(destination.delivery_address);
            mapsUrl += `&destination=${encodeURIComponent(destAddr)}`;
        }

        if (selectedOrders.length > 1) {
          const waypoints = selectedOrders.slice(0, selectedOrders.length - 1).map(o => {
            if (o.delivery_coordinates) {
                return `${o.delivery_coordinates.lat},${o.delivery_coordinates.lng}`;
            }
            const ptAddr = formatDeliveryAddress(o.delivery_address);
            return encodeURIComponent(ptAddr);
          }).join('|');
          mapsUrl += `&waypoints=${waypoints}`;
        }
        
        window.open(mapsUrl, '_blank');
      }
      
    } catch (e) {
      console.error(e);
      setFeedError(e instanceof Error ? e.message : 'Failed to start route');
    } finally {
      setCommandBusy(false);
    }
  };

  const handleVerifyAndComplete = async (order: DeliveryOrder) => {
    if (!/^\d{4,6}$/.test(enteredOtp)) {
      setOtpError('Enter the customer delivery code.');
      return;
    }

    const alreadyPaid = order.is_paid === true || order.payment_status === 'paid';
    
    try {
      setCommandBusy(true);
      await markOrderAsDelivered(order.order_id, enteredOtp, alreadyPaid ? undefined : paymentMethod);
      setVerifyingOrderId(null);
      setEnteredOtp('');
      setOtpError(null);
      setPaymentMethod('cash');
      await loadFeed(true);
    } catch (e) {
      console.error(e);
      setOtpError(e instanceof Error ? e.message : 'Failed to mark order as delivered');
    } finally {
      setCommandBusy(false);
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleStatus = async () => {
    if (!riderDetails) return;
    
    if (riderDetails.status === 'active') {
      // Check if trying to go offline while having active or dispatched orders
      const hasActiveOrders = orders.some(o => 
        o.status === 'out_for_delivery' || o.status === 'dispatched'
      );
      if (hasActiveOrders) {
        alert("Cannot go offline while you have active or assigned deliveries!");
        return;
      }
    }
    
    try {
      const newStatus = riderDetails.status === 'active' ? 'offline' : 'active';
      setCommandBusy(true);
      await apiRequest('/api/operations/delivery', {
        method: 'POST',
        body: JSON.stringify({ action: 'availability', status: newStatus }),
      });
      await loadFeed(true);
    } catch (e) {
      console.error('Failed to update status', e);
      setFeedError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setCommandBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      useStore.getState().resetStore();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'logout' }),
      });
      await signOut(auth);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-[#060403] text-[#f7dec4] font-sans flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-10%] left-[-20%] w-[300px] h-[300px] bg-[#60A5FA]/10 rounded-full filter blur-[80px] pointer-events-none" />

      {/* Header */}
      <header className="bg-[#120a06]/80 backdrop-blur-xl border-b border-[#302117] p-6 flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 flex items-center justify-center">
            <Bike className="text-[#60A5FA]" size={20} />
          </div>
          <div>
            <h1 className="font-serif italic text-xl font-black text-[#60A5FA]">Rider Ops</h1>
            <p className="text-[#d4c4b0]/50 font-mono text-[10px] uppercase tracking-widest mt-0.5">Ilara Cafe Delivery Matrix</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowProfile(true)}
            aria-label="Open rider profile"
            className="flex items-center gap-1.5 text-[#d4c4b0]/60 hover:text-white transition-colors"
          >
            <User size={18} />
          </button>
          <button 
            onClick={handleLogout}
            className="text-[#d4c4b0]/40 font-mono text-[9px] uppercase tracking-widest hover:text-white"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 z-10 pb-32">
        {feedError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <p>{feedError}</p>
            <button onClick={() => void loadFeed()} className="mt-2 font-mono uppercase underline underline-offset-4">
              Retry
            </button>
          </div>
        )}
        {feedLoading ? (
          <div className="py-16 text-center font-mono text-xs uppercase tracking-widest text-[#d4c4b0]/50" aria-live="polite">
            Loading assigned deliveries...
          </div>
        ) : isDelivering ? (
          <div className="flex flex-col gap-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#d4c4b0]/50 mb-2">Active Route ({activeDeliveries.length})</h2>
            <AnimatePresence>
              {activeDeliveries.map(order => (
                <motion.div 
                  key={order.order_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-[#120a06] border border-[#60A5FA]/30 rounded-2xl p-4 flex flex-col gap-3"
                >
                  <div className="flex justify-between items-center border-b border-[#302117]/50 pb-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-white">#{order.order_id}</span>
                      <span className="ml-2 text-xs font-mono text-[#d4c4b0]/50">{order.items.length} Items</span>
                    </div>
                     <button 
                       onClick={() => {
                         if (order.delivery_coordinates) {
                           window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.delivery_coordinates.lat},${order.delivery_coordinates.lng}`, '_blank');
                         } else {
                           const queryAddr = formatDeliveryAddress(order.delivery_address);
                           window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryAddr)}`, '_blank');
                         }
                       }}
                       className="bg-[#60A5FA]/10 text-[#60A5FA] px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest font-bold"
                     >
                       <Navigation size={12} /> Map
                     </button>
                   </div>
                   
                   <div className="flex items-start gap-2 text-[#d4c4b0]">
                     <MapPin size={16} className="shrink-0 mt-0.5 text-[#60A5FA]" />
                     <p className="text-sm font-bold">
                       {formatDeliveryAddress(order.delivery_address)}
                     </p>
                  </div>

                  {verifyingOrderId === order.order_id ? (
                    <div className="bg-[#1b120c] border border-[#d4a354]/30 rounded-xl p-4 flex flex-col gap-3 mt-2">
                      <div className="text-[10px] font-mono text-[#d4c4b0]/70 uppercase tracking-widest text-center">Enter 4-Digit Customer OTP</div>
                      <input 
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        aria-label="Customer delivery code"
                        maxLength={6}
                        placeholder="••••"
                        value={enteredOtp}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setEnteredOtp(val);
                          setOtpError(null);
                        }}
                        className="bg-black/40 border border-[#302117] rounded-xl py-2 text-center text-xl font-mono tracking-[0.5em] text-[#d4a354] outline-none focus:border-[#d4a354]"
                      />
                      {!(order.is_paid === true || order.payment_status === 'paid') && (
                        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-widest text-[#d4c4b0]/70">
                          Payment collected by
                          <select
                            value={paymentMethod}
                            onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}
                            className="rounded-lg border border-[#302117] bg-black/40 px-3 py-2 text-sm text-white"
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="wallet">Wallet</option>
                          </select>
                        </label>
                      )}
                      {otpError && <div className="text-[#ef4444] text-[10px] font-mono text-center">{otpError}</div>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setVerifyingOrderId(null);
                            setEnteredOtp('');
                            setOtpError(null);
                          }}
                          className="flex-1 bg-[#302117] hover:bg-[#4a3324] text-white py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleVerifyAndComplete(order)}
                          disabled={commandBusy}
                          className="flex-[2] bg-[#10B981] hover:bg-[#059669] text-white py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest font-bold"
                        >
                          {commandBusy ? 'Verifying...' : 'Verify & Complete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      {order.customer_phone && (
                        <a 
                          href={`tel:${order.customer_phone}`}
                          className="flex-1 bg-[#302117] hover:bg-[#4a3324] text-white py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                          <Phone size={16} /> Call
                        </a>
                      )}
                      <button 
                        onClick={() => {
                          setVerifyingOrderId(order.order_id);
                          setEnteredOtp('');
                          setOtpError(null);
                          setPaymentMethod('cash');
                        }}
                        className="flex-[2] bg-[#10B981] hover:bg-[#059669] text-white py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <CheckCircle size={16} /> Delivered
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#d4c4b0]/50 mb-2">Assigned for Pickup</h2>
            
            {availableOrders.length === 0 ? (
              <div className="text-center py-10 text-[#d4c4b0]/30 font-mono text-sm uppercase tracking-widest flex flex-col items-center gap-3">
                <Package size={40} className="opacity-50" />
                No assigned deliveries
              </div>
            ) : (
              <>
                <MapComponent 
                  orders={availableOrders} 
                  selectedOrderIds={selectedOrderIds} 
                  onToggleSelection={toggleSelection} 
                />
                <div className="text-xs font-mono text-[#d4c4b0]/50 text-center">Select orders on the map to build your route</div>
                
                {availableOrders.map(order => {
                  const isSelected = selectedOrderIds.has(order.order_id);
                  if (!isSelected) return null; // Only show selected items in the list to reduce clutter since they use the map
                  
                  return (
                    <motion.button
                      type="button"
                      key={order.order_id}
                      onClick={() => toggleSelection(order.order_id)}
                      aria-pressed={isSelected}
                      className={`bg-[#070402] border-2 rounded-2xl p-4 flex flex-col gap-3 transition-all cursor-pointer ${
                        isSelected ? 'border-[#60A5FA] bg-[#60A5FA]/5' : 'border-[#302117] hover:border-[#60A5FA]/40'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? 'border-[#60A5FA] bg-[#60A5FA]' : 'border-[#302117]'
                          }`}>
                            {isSelected && <CheckCircle size={12} className="text-[#070402]" />}
                          </div>
                          <span className="font-mono text-sm font-bold text-white tracking-tight">#{order.order_id}</span>
                        </div>
                        <span className="text-xs font-mono text-[#d4c4b0]/50 flex items-center gap-1">
                          <Clock size={12} /> {formatTime(order.created_at)}
                        </span>
                      </div>
                      
                      <div className="pl-7 flex items-start gap-2 text-[#d4c4b0]/80">
                        <MapPin size={14} className="shrink-0 mt-0.5 text-[#60A5FA]/70" />
                        <div>
                          <p className="text-sm font-bold">
                            {formatDeliveryAddress(order.delivery_address)}
                          </p>
                          <p className="text-[10px] font-mono text-[#d4c4b0]/40 uppercase tracking-widest mt-1">{order.items.length} Items to carry</p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button for Batch Start */}
      {!isDelivering && selectedOrderIds.size > 0 && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#060403] via-[#060403] to-transparent z-20"
        >
          <div className="max-w-md mx-auto">
            <button 
              onClick={startBatchRoute}
              disabled={commandBusy}
              className="w-full bg-[#60A5FA] hover:bg-[#3B82F6] text-[#0A0604] py-4 rounded-2xl font-mono text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(96,165,250,0.3)] transition-all"
            >
              {commandBusy ? 'Starting Route...' : `Start Route & Navigate (${selectedOrderIds.size})`} <ChevronRight size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Profile Drawer */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Rider profile"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-[#060403] z-50 flex flex-col overflow-hidden"
          >
            <div className="bg-[#120a06]/80 backdrop-blur-xl border-b border-[#302117] p-6 flex justify-between items-center shrink-0">
              <h2 className="font-serif italic text-xl font-black text-white">Rider Profile</h2>
              <button 
                onClick={() => setShowProfile(false)}
                aria-label="Close rider profile"
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
              {/* Profile Card */}
              {riderDetails && (
                <div className="bg-[#120a06] border border-[#60A5FA]/30 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#60A5FA]/5 rounded-bl-full pointer-events-none" />
                  
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">{riderDetails.name}</h3>
                      <p className="text-[#d4c4b0]/50 font-mono text-xs mt-1">ID: {riderDetails.employee_id}</p>
                      <p className="text-[#60A5FA]/80 font-mono text-xs mt-1 uppercase tracking-widest">{riderDetails.outlet}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${
                      riderDetails.status === 'active' ? 'bg-[#10B981]/10 border-[#10B981] text-[#10B981]' : 'bg-red-500/10 border-red-500/50 text-red-500/50'
                    }`}>
                      <Power size={24} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#302117]/50 flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-widest text-[#d4c4b0]/70">Status</span>
                    <button
                      onClick={toggleStatus}
                      disabled={commandBusy}
                      aria-label={riderDetails.status === 'active' ? 'Go offline' : 'Go online'}
                      aria-pressed={riderDetails.status === 'active'}
                      className={`relative w-14 h-8 rounded-full transition-colors duration-300 ${
                        riderDetails.status === 'active' ? 'bg-[#10B981]' : 'bg-[#302117]'
                      }`}
                    >
                      <motion.div
                        animate={{ x: riderDetails.status === 'active' ? 26 : 4 }}
                        className="absolute top-1 left-0 w-6 h-6 bg-white rounded-full shadow-md"
                      />
                    </button>
                  </div>
                  {riderDetails.status === 'offline' && (
                    <p className="text-red-400/80 text-[10px] font-mono text-right">You are offline. You won&apos;t receive new orders.</p>
                  )}
                </div>
              )}

              {/* Order History */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#d4c4b0]/70 pb-2 border-b border-[#302117]">
                  <History size={16} />
                  <h4 className="font-mono text-xs uppercase tracking-widest font-bold">Recent Deliveries</h4>
                </div>
                
                {feedLoading ? (
                  <div className="text-center py-6 text-[#d4c4b0]/30 font-mono text-xs animate-pulse">Loading history...</div>
                ) : orderHistory.length === 0 ? (
                  <div className="text-center py-6 text-[#d4c4b0]/30 font-mono text-xs">No completed deliveries yet.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {orderHistory.map(order => (
                      <div key={order.order_id} className="bg-[#120a06] border border-[#302117] rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <div className="font-mono text-xs font-bold text-white">#{order.order_id}</div>
                          <div className="text-[10px] font-mono text-[#d4c4b0]/50 mt-1">
                            {new Date(order.completed_at || order.created_at).toLocaleDateString()} • {formatTime(order.completed_at || order.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#10B981] font-mono text-xs flex items-center gap-1 justify-end"><CheckCircle size={12} /> Delivered</div>
                          <div className="text-[10px] font-mono text-[#d4c4b0]/40 mt-1">{order.item_count} items</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Help Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#d4c4b0]/70 pb-2 border-b border-[#302117]">
                  <HelpCircle size={16} />
                  <h4 className="font-mono text-xs uppercase tracking-widest font-bold">Help & Support</h4>
                </div>
                <div className="bg-[#120a06] border border-[#302117] rounded-xl p-4 space-y-4">
                  <div>
                    <h5 className="text-white text-sm font-bold">Need assistance?</h5>
                    <p className="text-[#d4c4b0]/60 text-xs mt-1 leading-relaxed">
                      If you&apos;re facing issues with an active delivery or the app, contact your manager immediately.
                    </p>
                  </div>
                  <a href="tel:+919999999999" className="block w-full bg-[#302117] hover:bg-[#4a3324] text-white py-3 rounded-lg font-mono text-xs uppercase tracking-widest font-bold text-center transition-colors">
                    Call Manager
                  </a>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
