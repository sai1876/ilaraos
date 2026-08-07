'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, Flame,  Utensils, Coffee, AlertTriangle } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { OrderDocument, OrderItem } from '@/lib/types';
import KDSProfileModal from '@/components/kds/KDSProfileModal';
import { User } from 'lucide-react';
import { canAccessKdsStation } from '@/lib/auth/roles';
import { useStore } from '@/store/useStore';

function getNextKdsStatus(status: string): string | null {
  if (status === 'ordered') return 'preparing';
  if (status === 'preparing') return 'ready';
  return null;
}

interface KDSClientProps {
  role: string;
  staffDetails: any;
}

export default function KDSClient({ role, staffDetails }: KDSClientProps) {
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Connection & Lock states
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'>('connecting');
  const [pendingMutations, setPendingMutations] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // 1. Update current local time periodically to refresh elapsed minutes ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Track online/offline states
  useEffect(() => {
    const handleOnline = () => setConnectionState('reconnecting');
    const handleOffline = () => setConnectionState('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      setConnectionState('offline');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Map KDS Roles to MenuItem Station fields
  const isAllowedItem = (item: OrderItem) => {
    return canAccessKdsStation(role, item.station);
  };

  // 3. Listen to real orders in the last 12 hours from Firestore in real-time
  useEffect(() => {
    const timeLimit = Date.now() - 12 * 60 * 60 * 1000;
    const isGlobal = role === 'owner' || role === 'admin';
    const outletId = staffDetails?.outlet_id || staffDetails?.outletId;

    if (!isGlobal && !outletId) {
      setConnectionState('error');
      showToast('Staff outlet is not configured', 'error');
      return;
    }

    console.log(`[KDS] Listening to collection: 'orders', Outlet: ${outletId}, Filter: created_at >= ${timeLimit}`);
    
    let q;
    if (isGlobal) {
      q = query(
        collection(db, 'orders'),
        where('status', 'in', ['confirmed', 'preparing']),
        where('created_at', '>=', timeLimit),
        limit(150)
      );
    } else {
      q = query(
        collection(db, 'orders'),
        where('outlet_id', '==', outletId),
        where('status', 'in', ['confirmed', 'preparing']),
        where('created_at', '>=', timeLimit),
        limit(150)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`[KDS] Received snapshot size: ${snapshot.size}`);
      setConnectionState('live');
      const fetchedOrders: OrderDocument[] = [];
      snapshot.forEach((docSnap) => {
        const order = docSnap.data() as OrderDocument;
        if (order.rush_held !== true) {
          fetchedOrders.push(order);
        }
      });
      
      fetchedOrders.sort((a, b) => a.created_at - b.created_at);
      setOrders(fetchedOrders);
    }, (err) => {
      console.error("[KDS] Failed to stream kitchen KDS orders. Permission Error?", err);
      setConnectionState('error');
      showToast('Failed to connect to KDS database', 'error');
    });

    return () => unsubscribe();
  }, [role, staffDetails?.outlet_id, staffDetails?.outletId]);

  // Filter KDS tickets to show:
  // - Only active preparing/ready orders (exclude completed/cancelled)
  // - Only orders that have items matching the current station
  // - Only items for this station that are NOT yet ready (item_status != 'ready')
  const filteredOrders = orders.map(order => {
    const stationItems = order.items.filter(item => isAllowedItem(item) && item.item_status !== 'ready');
    return { 
      ...order, 
      items: stationItems,
      elapsed_mins: Math.max(0, Math.floor((nowTime - order.created_at) / (60 * 1000)))
    };
  }).filter(order => 
    order.items.length > 0 && 
    (order.status === 'confirmed' || order.status === 'preparing')
  );

  const completedOrders = orders.filter(order => 
    order.items.some(item => isAllowedItem(item) && item.item_status === 'ready')
  ).sort((a, b) => b.created_at - a.created_at);

  const getRoleIcon = () => {
    switch(role) {
      case 'deep_fryer': return <Flame className="text-[#e8621a]" />;
      case 'grill_fryer': return <Utensils className="text-[#f8bc51]" />;
      case 'biryani_master': return <Utensils className="text-[#10B981]" />;
      case 'brewer': return <Coffee className="text-[#60A5FA]" />;
      default: return <AlertTriangle className="text-[#f8bc51]" />;
    }
  };

  const getRoleTitle = () => {
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  // Toggle KDS item status via API
  const toggleItemReady = async (orderId: string, itemId: string, currentStatus: string) => {
    if (pendingMutations[itemId]) return;
    setPendingMutations(prev => ({ ...prev, [itemId]: true }));

    const rawOrder = orders.find(o => o.order_id === orderId);
    if (!rawOrder) {
      setPendingMutations(prev => ({ ...prev, [itemId]: false }));
      return;
    }

    const itemIndex = rawOrder.items.findIndex(i => i.item_id === itemId);
    if (itemIndex === -1) {
      setPendingMutations(prev => ({ ...prev, [itemId]: false }));
      return;
    }

    const nextStatus = getNextKdsStatus(currentStatus);
    if (!nextStatus) {
      setPendingMutations(prev => ({ ...prev, [itemId]: false }));
      return;
    }
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      showToast("Authentication required. Please refresh.", "error");
      setPendingMutations(prev => ({ ...prev, [itemId]: false }));
      return;
    }

    try {
      const res = await fetch('/api/orders/update-kds-item-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          order_id: orderId,
          item_index: itemIndex,
          item_id: itemId,
          item_status: nextStatus
        })
      });

      if (!res.ok) {
        if (res.status === 409) {
          showToast('Order changed in background, refresh KDS', 'error');
        } else {
          const json = await res.json();
          showToast(json.error || 'Failed to update item status', 'error');
        }
        return;
      }

      await fetch('/api/orders/recalculate-kds-order-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ order_id: orderId })
      });
      
      showToast('Item status updated', 'success');
    } catch (e) {
      console.error("Failed to toggle item ready status: ", e);
      showToast('Failed to update status', 'error');
    } finally {
      setPendingMutations(prev => ({ ...prev, [itemId]: false }));
    }
  };

  // Bump station ticket via API atomically
  const handleBumpTicket = async (orderId: string) => {
    if (pendingMutations[orderId]) return;
    setPendingMutations(prev => ({ ...prev, [orderId]: true }));

    const rawOrder = orders.find(o => o.order_id === orderId);
    if (!rawOrder) {
      setPendingMutations(prev => ({ ...prev, [orderId]: false }));
      return;
    }

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      showToast("Authentication required. Please refresh.", "error");
      setPendingMutations(prev => ({ ...prev, [orderId]: false }));
      return;
    }

    try {
      const res = await fetch('/api/orders/bump-station-items', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          order_id: orderId
        })
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to bump ticket');
      }

      showToast('Ticket bumped successfully', 'success');
    } catch (e: any) {
      console.error("Failed to bump station KDS ticket: ", e);
      showToast(e.message || 'Ticket bump failed', 'error');
    } finally {
      setPendingMutations(prev => ({ ...prev, [orderId]: false }));
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
    <div className="min-h-screen bg-[#FAF7F2] text-[#241A15] font-sans p-6 overflow-hidden flex flex-col">
      {/* KDS Header */}
      <header className="bg-[#FFFDFC]/90 backdrop-blur-xl border border-[#E8DFD3] rounded-3xl p-6 flex justify-between items-center mb-6 shrink-0 shadow-[0_4px_20px_rgba(36,26,21,0.04)]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F3ECE3] border border-[#E8DFD3] flex items-center justify-center">
            {getRoleIcon()}
          </div>
          <div>
            <h1 className="font-sans text-3xl font-black text-[#9A642C] uppercase tracking-wide">
              {getRoleTitle()} Station
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${
                connectionState === 'live' ? 'bg-[#2F6B54] animate-pulse' :
                connectionState === 'offline' ? 'bg-[#B42318]' :
                connectionState === 'error' ? 'bg-[#A15C17]' : 'bg-[#C3924F] animate-ping'
              }`} />
              <p className="text-[#66554A] font-mono text-xs uppercase tracking-widest">
                Kitchen Feed • {connectionState.toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-6 items-center">
          <div className="text-right font-mono">
            <p className="text-[#66554A]/60 text-[10px] uppercase tracking-widest">Active Tickets</p>
            <p className="text-2xl font-bold text-[#241A15]">{filteredOrders.length}</p>
          </div>
          <div className="w-px h-10 bg-[#E8DFD3]" />
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="bg-[#F3ECE3] hover:bg-[#E8DFD3] text-[#9A642C] px-4 py-3 rounded-xl font-mono text-[10px] uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-2"
          >
            <User size={14} /> Profile
          </button>
          <button 
            onClick={handleLogout}
            className="bg-[#F3ECE3] hover:bg-[#E8DFD3] text-[#66554A] px-4 py-3 rounded-xl font-mono text-[10px] uppercase tracking-widest transition-colors cursor-pointer"
          >
            Exit Station
          </button>
        </div>
      </header>

      {/* Ticket Grid */}
      <div className="flex-1 overflow-x-auto flex gap-6 pb-4 ticket-scroll">
        <AnimatePresence mode="popLayout">
          {connectionState === 'connecting' ? (
            <motion.div 
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center justify-center text-[#66554A]/50 font-mono text-sm uppercase tracking-widest"
            >
              <div className="w-10 h-10 border-4 border-[#E8DFD3] border-t-[#9A642C] rounded-full animate-spin mb-4" />
              Connecting to Kitchen Feed...
            </motion.div>
          ) : connectionState === 'offline' ? (
            <motion.div 
              key="offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center justify-center text-[#B42318] font-mono text-sm uppercase tracking-widest"
            >
              <AlertTriangle size={48} className="mb-4 text-[#B42318]" />
              Offline — Reconnect Internet
            </motion.div>
          ) : connectionState === 'error' ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center justify-center text-[#A15C17] font-mono text-sm uppercase tracking-widest"
            >
              <AlertTriangle size={48} className="mb-4 text-[#A15C17]" />
              Permission / Connection Error
            </motion.div>
          ) : filteredOrders.length === 0 ? (
            <motion.div 
              key="clear"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center justify-center text-[#66554A]/40 font-mono text-sm uppercase tracking-widest"
            >
              <CheckCircle size={48} className="mb-4 opacity-50 text-[#2F6B54]" />
              No Active Tickets For Your Station
            </motion.div>
          ) : (
            filteredOrders.map(order => {
              const canBumpTicket = !pendingMutations[order.order_id];
              const isUrgent = order.elapsed_mins >= 10;
              const allStationItemsReady = order.items.filter(i => isAllowedItem(i)).every(i => i.item_status === 'ready');
              const isNew = Date.now() - order.created_at < 10000;

              return (
                <motion.div
                  key={order.order_id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, x: 20 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    x: 0,
                    backgroundColor: isNew ? ["#FAF7F2", "#F3ECE3", "#FFFDFC"] : "#FFFDFC"
                  }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  transition={{ 
                    backgroundColor: { duration: 0.3, ease: "easeInOut" },
                    default: { type: 'spring', stiffness: 350, damping: 30 }
                  }}
                  className={`w-[350px] shrink-0 border-2 rounded-3xl overflow-hidden flex flex-col transition-all duration-200 ${
                    allStationItemsReady ? 'border-[#2F6B54]/30 opacity-70 bg-[#FFFDFC]' : 
                    isUrgent ? 'border-[#B42318]/60 shadow-[0_0_30px_rgba(180,35,24,0.08)] bg-[#FFFDFC]' : 'border-[#E8DFD3] bg-[#FFFDFC]'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className={`p-5 border-b flex justify-between items-start ${
                    isUrgent ? 'bg-[#B42318]/5 border-[#B42318]/10' : 'bg-[#F3ECE3]/40 border-[#E8DFD3]'
                  }`}>
                    <div>
                      <h2 className={`font-black text-[#241A15] font-mono tracking-tight ${
                        order.order_type === 'delivery' ? 'text-lg' : 'text-3xl'
                      }`}>
                        #{order.order_type === 'delivery' ? order.order_id : order.token_number}
                      </h2>
                      <span className={`text-[10px] uppercase font-mono tracking-widest font-bold px-2 py-0.5 rounded mt-2 inline-block ${
                        order.order_type === 'dine-in' ? 'bg-[#9A642C]/10 text-[#9A642C]' :
                        order.order_type === 'delivery' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {order.order_type}
                      </span>
                    </div>
                    <div className={`text-right font-mono ${isUrgent ? 'text-[#B42318] animate-pulse' : 'text-[#66554A]'}`}>
                      <div className="flex items-center gap-1.5 justify-end text-xl font-bold">
                        <Clock size={16} />
                        {order.elapsed_mins}m
                      </div>
                      <div className="text-[10px] uppercase tracking-widest mt-1 opacity-70">Elapsed</div>
                    </div>
                  </div>

                  {/* Ticket Items */}
                  <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-2 bg-[#FFFDFC]">
                    {order.items.map(item => (
                      <button
                        key={item.item_id}
                        onClick={() => toggleItemReady(order.order_id, item.item_id, item.item_status)}
                        disabled={pendingMutations[item.item_id]}
                        className={`w-full text-left p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer min-h-[52px] ${
                          item.item_status === 'preparing' 
                            ? 'bg-[#2F6B54]/10 border border-[#2F6B54]/20 opacity-90' 
                            : 'bg-[#F3ECE3]/40 border border-[#E8DFD3] hover:border-[#9A642C]/40'
                        } disabled:opacity-50`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          item.item_status === 'preparing' ? 'bg-[#2F6B54] text-white' : 'bg-[#E8DFD3] text-[#9A642C]'
                        }`}>
                          {item.item_status === 'preparing' ? <Utensils size={16} /> : `${item.quantity}x`}
                        </div>
                        <div className="flex-1">
                          <p className={`font-bold leading-tight ${item.item_status === 'preparing' ? 'text-[#2F6B54]' : 'text-[#241A15] text-lg'}`}>
                            {item.name}
                          </p>
                          <p className="text-[#66554A]/60 text-[10px] font-mono uppercase tracking-widest mt-1">
                            {item.station || 'GENERAL'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Bump Action */}
                  <div className="p-4 border-t border-[#E8DFD3] bg-[#F3ECE3]/20">
                    <button 
                      onClick={() => handleBumpTicket(order.order_id)}
                      disabled={!canBumpTicket}
                      className="w-full py-4 rounded-xl font-mono text-sm uppercase tracking-widest font-bold transition-all disabled:opacity-30 disabled:bg-[#E8DFD3] disabled:text-[#66554A] bg-[#2F6B54] text-white hover:bg-[#204a3a] cursor-pointer min-h-[48px]"
                    >
                      {pendingMutations[order.order_id] ? 'Bumping...' : 'Bump Ticket'}
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .ticket-scroll::-webkit-scrollbar {
          height: 12px;
        }
        .ticket-scroll::-webkit-scrollbar-track {
          background: #F3ECE3;
          border-radius: 10px;
        }
        .ticket-scroll::-webkit-scrollbar-thumb {
          background: #9A642C;
          border-radius: 10px;
        }
        .ticket-scroll::-webkit-scrollbar-thumb:hover {
          background: #C3924F;
        }
      `}} />

      <KDSProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        role={role}
        completedOrders={completedOrders}
        staffDetails={staffDetails}
      />

      {/* Toast Notifications */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 border font-mono uppercase text-xs tracking-widest ${
              toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              toastMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-[#B42318]' :
              'bg-[#FFFDFC] border-[#E8DFD3] text-[#9A642C]'
            }`}
          >
            <span>{toastMsg.type === 'success' ? '✓' : toastMsg.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toastMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
