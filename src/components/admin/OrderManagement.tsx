'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power, Send, AlertTriangle, CheckCircle, Clock, MapPin, Coffee, ShoppingBag, Truck } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, limit, onSnapshot, doc } from 'firebase/firestore';
import { OrderDocument } from '@/lib/types';
import { isActiveOrderStatus, isCompletedOrderStatus } from '@/lib/orderUtils';
import { secureUpdateRushMode } from '@/app/_actions/secureDbActions';

interface OrderManagementProps {
  outletId?: string;
  userRole?: string;
}

export default function OrderManagement({ outletId, userRole }: OrderManagementProps) {
  const [isRushMode, setIsRushMode] = useState(false);
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [_loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<'active' | 'completed'>('active');
  const [paymentMethods, setPaymentMethods] = useState<Record<string, 'cash' | 'upi' | 'card'>>({});

  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  const playOrderChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880.00, now + 0.12); // A5
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now); // D6
      osc2.frequency.setValueAtTime(1760.00, now + 0.12); // A6
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.error("Audio playback error: ", e);
    }
  };

  // 1. Listen to Rush Mode state in Firestore config
  useEffect(() => {
    const configRef = doc(db, 'config', 'store_settings');
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsRushMode(!!docSnap.data().rush_mode_active);
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed to load store settings: ", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Listen to real orders in real-time
  useEffect(() => {
    const isGlobal = userRole === 'admin' || userRole === 'owner';
    const q = query(
      collection(db, 'orders'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetchedOrders: OrderDocument[] = [];
      snapshot.forEach((docSnap) => {
        const order = docSnap.data() as OrderDocument;
        if (isActiveOrderStatus(order.status) || isCompletedOrderStatus(order.status)) {
          fetchedOrders.push(order);
        }
      });

      if (!isGlobal && outletId) {
        const scoped = fetchedOrders.filter(o => (o as any).outlet_id === outletId || (o as any).outlet === outletId || o.hatch === outletId);
        if (scoped.length > 0) fetchedOrders = scoped;
      }
      
      // Sort in memory by created_at descending (newest first)
      fetchedOrders.sort((a, b) => b.created_at - a.created_at);

      // Play chime for brand new orders (avoid initial load trigger)
      if (prevOrderIdsRef.current.size > 0) {
        const hasNewOrder = fetchedOrders.some(
          o => !prevOrderIdsRef.current.has(o.order_id) && Date.now() - o.created_at < 60000
        );
        if (hasNewOrder) {
          playOrderChime();
        }
      }
      prevOrderIdsRef.current = new Set(fetchedOrders.map(o => o.order_id));
      setOrders(fetchedOrders);
    }, (err) => {
      console.error("Failed to stream active orders: ", err);
    });

    return () => unsubscribe();
  }, []);

  // 3. Toggle Rush Mode state in Firestore
  const toggleRushMode = async () => {
    const nextVal = !isRushMode;
    setIsRushMode(nextVal);
    try {
      await secureUpdateRushMode(nextVal);
    } catch (e: any) {
      console.error("Failed to update rush mode status in database: ", e);
      setIsRushMode(!nextVal); // Revert state on error
      alert(e.message || "Failed to update rush mode status");
    }
  };

  const pushToKDS = async (orderId: string) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");

      const res = await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ 
          order_id: orderId, 
          rush_held: false, 
          next_status: 'preparing' 
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to push order to KDS");
      }
    } catch (e: any) {
      console.error("Failed to push held order to KDS: ", e);
      alert(e.message || "Failed to push order to KDS");
    }
  };

  // 5. Collect Amount & Mark Completed
  const markCompleted = async (orderId: string) => {
    const method = paymentMethods[orderId] || 'cash';
    try {
      let user = auth.currentUser;
      if (!user) {
        await new Promise<void>((resolve) => {
          const unsub = auth.onAuthStateChanged(() => { unsub(); resolve(); });
        });
        user = auth.currentUser;
      }
      if (!user) throw new Error("Authentication required");
      const idToken = await user.getIdToken();

      const res = await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ 
          order_id: orderId, 
          next_status: 'completed',
          payment_status: 'paid',
          payment_method: method
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to mark order completed");
      }
    } catch (e: any) {
      console.error("Failed to mark order completed: ", e);
      alert(e.message || "Failed to mark order completed");
    }
  };

  const setOrderPaymentMethod = (orderId: string, method: 'cash' | 'upi' | 'card') => {
    setPaymentMethods(prev => ({ ...prev, [orderId]: method }));
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-6 w-full text-[#1b1c17]">
      {/* Header and Rush Mode Toggle */}
      <div className="bg-card border border-border shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-3xl p-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-[-30%] right-[-10%] w-48 h-48 bg-[#e8621a]/5 rounded-full filter blur-xl pointer-events-none" />
        <div>
          <h2 className="font-serif italic text-2xl text-foreground">Order Management</h2>
          <p className="text-xs font-mono text-muted-foreground/60 uppercase tracking-widest mt-0.5">Control Kitchen Inflow & Rush Queues</p>
        </div>

        <button 
          onClick={toggleRushMode}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-widest font-bold transition-all border cursor-pointer ${
            isRushMode 
              ? 'bg-red-50 text-red-600 border-red-200/50 shadow-sm animate-pulse' 
              : 'bg-white text-muted-foreground border-border hover:border-amber-500/40 hover:text-foreground shadow-sm'
          }`}
        >
          <Power size={14} />
          {isRushMode ? 'Rush Mode ON' : 'Rush Mode OFF'}
        </button>
      </div>

      {isRushMode && (
        <div className="bg-red-50 border border-red-200/50 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-600 shrink-0" />
          <div>
            <h4 className="text-red-700 text-sm font-bold">Rush Mode is Active</h4>
            <p className="text-xs text-red-600/80 mt-0.5">New customer orders will be held in the queue below. You must manually push them to release them to KDS display boards.</p>
          </div>
        </div>
      )}

      {/* Tab Switcher & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Live Order Inflow (Last 12 Hours)</h3>
        
        <div className="flex gap-1.5 bg-[#f5f4ec] p-1 border border-border rounded-xl w-fit">
          <button
            onClick={() => setViewTab('active')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
              viewTab === 'active'
                ? 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active Queue ({orders.filter(o => isActiveOrderStatus(o.status)).length})
          </button>
          <button
            onClick={() => setViewTab('completed')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
              viewTab === 'completed'
                ? 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Completed ({orders.filter(o => isCompletedOrderStatus(o.status)).length})
          </button>
        </div>
      </div>
      
      {orders.filter(o => viewTab === 'active' ? isActiveOrderStatus(o.status) : isCompletedOrderStatus(o.status)).length === 0 ? (
        <div className="text-center py-16 bg-card border border-border shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-3xl flex flex-col items-center gap-3">
          <ShoppingBag size={32} className="text-muted-foreground/20" />
          <p className="font-mono text-xs text-muted-foreground/50 uppercase tracking-wider">
            {viewTab === 'active' ? 'No active orders in the queue' : 'No completed orders in the queue'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {orders
              .filter(o => viewTab === 'active' ? isActiveOrderStatus(o.status) : isCompletedOrderStatus(o.status))
              .map(order => {
              const isHeld = order.rush_held === true;
              return (
                <motion.div 
                  key={order.order_id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  className={`bg-card border ${isHeld ? 'border-red-300 bg-red-50/20' : 'border-border'} shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-2xl p-5 flex flex-col gap-4 relative`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`bg-foreground/5 text-foreground py-1 rounded-lg font-mono font-bold tracking-wider ${
                        order.order_type === 'delivery' ? 'px-2 text-[10px]' : 'px-2.5 text-xs'
                      }`}>
                        #{order.order_type === 'delivery' ? order.order_id : order.token_number}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Clock size={10} />
                        {formatTime(order.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded ${
                        order.order_type === 'delivery' 
                          ? 'bg-blue-500/10 text-blue-600' 
                          : order.order_type === 'pickup' 
                          ? 'bg-emerald-500/10 text-emerald-600' 
                          : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {order.order_type}
                      </span>

                      {isHeld ? (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      ) : (
                        <CheckCircle size={14} className="text-emerald-600" />
                      )}
                    </div>
                  </div>

                  {/* Order Items Contents */}
                  <div className="font-mono text-xs text-muted-foreground flex flex-col gap-2 bg-[#fbf9f1] p-3 rounded-xl border border-border mt-1">
                    <span className="text-[9px] uppercase tracking-widest text-[#855300] font-bold flex items-center gap-1">
                      <Coffee size={10} /> Order Contents
                    </span>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-foreground font-semibold text-xs">
                        <span>{item.name}</span>
                        <span className="bg-[#ffddb8]/40 text-[#855300] border border-amber-200/50 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-widest">
                          x{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Hand-off counter or coordinates detail */}
                  {order.order_type === 'delivery' && order.delivery_address && (
                    <div className="flex items-start gap-1.5 font-mono text-[9px] text-muted-foreground border-t border-border/20 pt-2.5">
                      <MapPin size={10} className="text-[#855300] shrink-0 mt-0.5" />
                      <span 
                        className="truncate" 
                        title={
                          typeof order.delivery_address === 'string'
                            ? order.delivery_address
                            : (order.delivery_address as any)?.fullAddress ||
                              (typeof (order.delivery_address as any)?.lat === 'number'
                                ? `Coordinates: ${(order.delivery_address as any).lat.toFixed(6)}, ${typeof (order.delivery_address as any).lng === 'number' ? (order.delivery_address as any).lng.toFixed(6) : ''}`
                                : '')
                        }
                      >
                        {
                          typeof order.delivery_address === 'string'
                            ? order.delivery_address
                            : (order.delivery_address as any)?.fullAddress ||
                              (typeof (order.delivery_address as any)?.lat === 'number'
                                ? `Coordinates: ${(order.delivery_address as any).lat.toFixed(6)}, ${typeof (order.delivery_address as any).lng === 'number' ? (order.delivery_address as any).lng.toFixed(6) : ''}`
                                : '')
                        }
                      </span>
                    </div>
                  )}

                  {order.order_type === 'delivery' && order.otp && (
                    <div className="flex justify-between items-center font-mono text-[9px] text-muted-foreground border-t border-border/20 pt-2.5">
                      <span>DELIVERY OTP</span>
                      <span className="text-[#855300] font-bold tracking-wider">{order.otp}</span>
                    </div>
                  )}

                  {order.order_type !== 'delivery' && order.hatch && (
                    <div className="flex justify-between items-center font-mono text-[9px] text-muted-foreground border-t border-border/20 pt-2.5">
                      <span>HAND-OFF POINT</span>
                      <span className="text-[#855300] font-bold uppercase">{order.hatch} Hatch</span>
                    </div>
                  )}

                  {/* Operational Action Button */}
                  <div className="flex gap-2 mt-2">
                    {isHeld ? (
                      <button 
                        onClick={() => pushToKDS(order.order_id)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Send size={12} /> 
                        Push to KDS
                      </button>
                    ) : order.status === 'ready' ? (
                      <>
                        {/* Payment method selector for non-delivery or force-complete */}
                        <div className="flex gap-1 w-full">
                          {(['cash', 'upi', 'card'] as const).map(m => (
                            <button
                              key={m}
                              onClick={() => setOrderPaymentMethod(order.order_id, m)}
                              className={`flex-1 py-1.5 rounded-lg font-mono text-[9px] uppercase tracking-wider font-bold border transition-all cursor-pointer ${
                                (paymentMethods[order.order_id] || 'cash') === m
                                  ? 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50'
                                  : 'bg-[#f5f4ec] text-muted-foreground border-border hover:border-amber-300/50'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        {order.order_type === 'delivery' ? (
                          <div className="flex gap-2 w-full">
                            <button 
                              onClick={() => window.location.href='?tab=dispatch'}
                              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                            >
                              <Truck size={12} /> 
                              Dispatch
                            </button>
                            <button 
                              onClick={() => markCompleted(order.order_id)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                              title="Force complete without rider"
                            >
                              <CheckCircle size={12} /> 
                              Complete
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => markCompleted(order.order_id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                          >
                            <CheckCircle size={12} /> 
                            Collect & Handover
                          </button>
                        )}
                      </>
                    ) : order.status === 'dispatched' || order.status === 'out_for_delivery' ? (
                      <button 
                        onClick={() => markCompleted(order.order_id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <CheckCircle size={12} /> 
                        Force Complete ({order.status === 'dispatched' ? 'Dispatched' : 'Out'})
                      </button>
                    ) : order.status === 'completed' ? (
                      <div className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-700 py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5">
                        <CheckCircle size={12} /> 
                        Completed & Paid
                      </div>
                    ) : (
                      <button 
                        disabled
                        className="flex-1 bg-[#eae8e0] text-muted-foreground/40 py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-not-allowed"
                      >
                        <Send size={12} /> 
                        {`In Prep: ${order.status}`}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
