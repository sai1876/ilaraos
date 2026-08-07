'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { OrderDocument, UserDocument } from '@/lib/types';
import { History, Search, RefreshCw, Filter, Calendar, X, User, MapPin, Clock, DollarSign, ChefHat, CheckCircle } from 'lucide-react';

interface OrderHistoryProps {
  outletId?: string;
  userRole?: string;
}

export default function OrderHistory({ outletId, userRole }: OrderHistoryProps) {
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [selectedOrder, setselectedOrder] = useState<OrderDocument | null>(null);
  const [customerProfile, setCustomerProfile] = useState<UserDocument | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [reasonModalOrder, setReasonModalOrder] = useState<OrderDocument | null>(null);
  const [forceReason, setForceReason] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCompleteOrder = async (orderId: string, reason?: string) => {
    try {
      setIsCompleting(true);
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
          next_status: 'completed',
          payment_status: 'paid',
          payment_method: 'cash',
          ...(reason ? { reason } : {})
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to mark order completed");
      }
      
      // Update local state to reflect completion instantly without closing modal or waiting for fetch
      setselectedOrder(prev => prev ? { ...prev, status: 'completed' } : null);
      
      // Also update the order in the list
      setOrders(prevOrders => prevOrders.map(o => o.order_id === orderId ? { ...o, status: 'completed' } : o));
      
    } catch (e: any) {
      console.error("Failed to mark order completed: ", e);
      alert(e.message || "Failed to mark order completed");
    } finally {
      setIsCompleting(false);
    }
  };

  useEffect(() => {
    if (selectedOrder?.user_id) {
      const fetchUser = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', selectedOrder.user_id));
          if (userDoc.exists()) {
            setCustomerProfile(userDoc.data() as UserDocument);
          } else {
            setCustomerProfile(null);
          }
        } catch (e) {
          console.error(e);
          setCustomerProfile(null);
        }
      };
      fetchUser();
    } else {
      setCustomerProfile(null);
    }
  }, [selectedOrder]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const isGlobal = userRole === 'admin' || userRole === 'owner';
      const q = query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(100));
      const snap = await getDocs(q);
      let fetched = snap.docs.map(doc => doc.data() as OrderDocument);
      
      if (!isGlobal && outletId) {
        const scoped = fetched.filter(o => (o as any).outlet_id === outletId || (o as any).outlet === outletId || o.hatch === outletId);
        if (scoped.length > 0) fetched = scoped;
      }
      
      setOrders(fetched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const formatTime = (ts: number) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString([], { 
      month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  // Simple client-side filtering
  const filteredOrders = orders.filter(order => {
    // Status match
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    
    // Date match (simplistic)
    if (dateFilter === 'today') {
      const today = new Date().setHours(0,0,0,0);
      if (order.created_at < today) return false;
    } else if (dateFilter === 'week') {
      const week = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
      if (order.created_at < week) return false;
    }

    // Search term (token or user_id or ID)
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!order.token_number?.toLowerCase().includes(s) &&
          !order.order_id?.toLowerCase().includes(s) &&
          !order.user_id?.toLowerCase().includes(s)) {
        return false;
      }
    }
    
    return true;
  });

  return (
    <div className="w-full flex flex-col gap-6 font-sans">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-serif italic font-black text-[#855300] flex items-center gap-2">
          <History size={24} />
          Order History
        </h2>
        <p className="text-xs font-mono uppercase tracking-widest text-[#534434]/50">
          Global Telemetry of Past Transactions
        </p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between bg-[#f5f4ec] border border-[#d8c3ad] p-4 rounded-2xl">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#534434]/40" size={16} />
            <input 
              type="text" 
              placeholder="Search Token or Order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#d8c3ad] rounded-xl pl-10 pr-4 py-2 text-sm text-[#534434] focus:outline-none focus:border-[#855300] transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <div className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 flex items-center gap-2">
            <Filter size={14} className="text-[#534434]/40" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm text-[#534434] focus:outline-none font-mono uppercase tracking-wider cursor-pointer"
            >
              <option className="bg-white text-[#534434]" value="all">All Status</option>
              <option className="bg-white text-[#534434]" value="delivered">Delivered</option>
              <option className="bg-white text-[#534434]" value="completed">Completed</option>
              <option className="bg-white text-[#534434]" value="rejected">Rejected</option>
              <option className="bg-white text-[#534434]" value="pending">Pending</option>
              <option className="bg-white text-[#534434]" value="preparing">Preparing</option>
              <option className="bg-white text-[#534434]" value="ready">Ready</option>
              <option className="bg-white text-[#534434]" value="out_for_delivery">Out for Delivery</option>
            </select>
          </div>
          
          <div className="bg-white border border-[#d8c3ad] rounded-xl px-3 py-2 flex items-center gap-2">
            <Calendar size={14} className="text-[#534434]/40" />
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-sm text-[#534434] focus:outline-none font-mono uppercase tracking-wider cursor-pointer"
            >
              <option className="bg-white text-[#534434]" value="all">All Time</option>
              <option className="bg-white text-[#534434]" value="today">Today</option>
              <option className="bg-white text-[#534434]" value="week">Past 7 Days</option>
            </select>
          </div>

          <button 
            onClick={fetchOrders}
            className="bg-[#f5f4ec] hover:bg-[#855300]/10 border border-[#d8c3ad] hover:border-[#855300]/50 rounded-xl px-3 flex items-center justify-center transition-colors cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-[#855300]" : "text-[#534434]"} />
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#d8c3ad] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#faf8f2] border-b border-[#d8c3ad]">
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Token</th>
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Date/Time</th>
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Type</th>
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Amount</th>
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Status</th>
                <th className="p-4 text-xs font-mono uppercase tracking-widest text-[#534434]/60">Items</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#534434]/40 font-mono text-sm">
                    <RefreshCw className="animate-spin mx-auto mb-2 text-[#855300]" size={24} />
                    Loading telemetry...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#534434]/40 font-mono text-sm">
                    No records found matching criteria
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr 
                    key={order.order_id} 
                    onClick={() => setselectedOrder(order)}
                    className="border-b border-[#d8c3ad]/40 hover:bg-[#faf8f2] transition-colors cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="font-mono font-bold text-[#534434] text-lg">#{order.token_number}</div>
                      <div className="font-mono text-[9px] text-[#534434]/40 uppercase tracking-widest">{order.order_id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-4 text-sm text-[#534434]/80">{formatTime(order.created_at)}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-1 rounded text-[10px] font-mono uppercase font-bold tracking-wider ${
                        order.order_type === 'delivery' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        order.order_type === 'dine-in' ? 'bg-pink-50 text-pink-700 border border-pink-200' :
                        'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {order.order_type}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-[#534434]"><span className="font-sans">₹</span>{order.gross_amount}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-1 rounded text-[10px] font-mono uppercase font-bold tracking-wider ${
                        order.status === 'completed' || order.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        order.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-200' :
                        'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-[#534434]/80">
                      {order.items?.length || 0} items
                      <div className="text-[10px] text-[#534434]/50 truncate max-w-[150px]">
                        {order.items?.map(i => i.name).join(', ')}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <style dangerouslySetInnerHTML={{ __html: `
          body { overflow: hidden !important; }
          main, main > div { overflow: hidden !important; }
          .modal-scrollbar {
            overflow-y: auto !important;
          }
          .modal-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .modal-scrollbar::-webkit-scrollbar-track {
            background: #faf8f2;
            border-radius: 10px;
          }
          .modal-scrollbar::-webkit-scrollbar-thumb {
            background: #d8c3ad;
            border-radius: 10px;
          }
        `}} />
      )}

      {mounted && typeof document !== 'undefined' && createPortal(
        <>
          {/* Order Details Modal */}
          <AnimatePresence>
            {selectedOrder && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden"
                onClick={() => setselectedOrder(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white border border-[#d8c3ad] rounded-3xl max-w-3xl w-full shadow-2xl relative text-[#534434] flex flex-col max-h-[85vh] overflow-hidden"
                >
                  {/* Sticky Header */}
                  <div className="p-6 md:p-8 pb-4 border-b border-[#d8c3ad]/30 relative shrink-0">
                    <button 
                      onClick={() => setselectedOrder(null)}
                      className="absolute top-6 right-6 text-[#534434]/60 hover:text-[#855300] transition-colors bg-[#faf8f2] p-2 rounded-full hover:bg-[#f5f4ec]"
                    >
                      <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 pr-10">
                      <div className="p-3 bg-[#855300]/10 rounded-2xl border border-[#855300]/20 text-[#855300]">
                        <History size={24} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-serif italic text-[#855300] font-black">Order Details</h3>
                        <p className="font-mono text-[10px] text-[#855300]/70 tracking-widest uppercase">Token #{selectedOrder.token_number} • ID {selectedOrder.order_id}</p>
                      </div>
                      
                      {/* Manager Action: Complete Order */}
                      {['pending', 'accepted', 'preparing', 'ready', 'dispatched', 'out_for_delivery'].includes(selectedOrder.status) && (
                        <button 
                          onClick={() => {
                            if (['pending', 'accepted', 'preparing'].includes(selectedOrder.status)) {
                              setReasonModalOrder(selectedOrder);
                              setForceReason('');
                            } else {
                              handleCompleteOrder(selectedOrder.order_id);
                            }
                          }}
                          disabled={isCompleting}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#f5f4ec] disabled:text-[#534434]/40 text-white px-4 py-2.5 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                        >
                          {isCompleting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} 
                          Force Complete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scrollable Body */}
                  <div className="p-6 md:p-8 pt-6 overflow-y-auto modal-scrollbar flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Customer Details */}
                    <div className="bg-[#faf8f2] border border-[#d8c3ad]/60 rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#534434] mb-2 border-b border-[#d8c3ad]/40 pb-2">
                        <User size={16} className="text-[#855300]" />
                        <span className="font-mono text-xs uppercase tracking-widest font-bold">Customer Profile</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 font-mono text-xs">
                        <div className="text-[#534434]/50 uppercase">UID</div>
                        <div className="text-[#534434] truncate" title={selectedOrder.user_id}>{selectedOrder.user_id.slice(0, 8)}...</div>
                        
                        <div className="text-[#534434]/50 uppercase">Name</div>
                        <div className="text-[#534434] truncate" title={customerProfile?.name || 'Unknown'}>{customerProfile?.name || 'Unknown'}</div>
                        
                        <div className="text-[#534434]/50 uppercase">Phone</div>
                        <div className="text-[#534434]">{customerProfile?.phone || '+91 -'}</div>
                      </div>
                    </div>

                    {/* Timing & Management */}
                    <div className="bg-[#faf8f2] border border-[#d8c3ad]/60 rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#534434] mb-2 border-b border-[#d8c3ad]/40 pb-2">
                        <Clock size={16} className="text-[#855300]" />
                        <span className="font-mono text-xs uppercase tracking-widest font-bold">Timeline & Ops</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 font-mono text-xs">
                        <div className="text-[#534434]/50 uppercase">Taken At</div>
                        <div className="text-[#534434]">{formatTime(selectedOrder.created_at)}</div>
                        
                        <div className="text-[#534434]/50 uppercase">Completed At</div>
                        <div className="text-[#534434]">{selectedOrder.completed_at ? formatTime(selectedOrder.completed_at) : 'Pending'}</div>
                        
                        <div className="text-[#534434]/50 uppercase">Manager</div>
                        <div className="text-[#855300] font-bold">{selectedOrder.hatch ? `Mgr. ${selectedOrder.hatch.split(' ')[0]}` : 'Ramesh K.'}</div>
                      </div>
                    </div>

                    {/* Order Items & Chefs */}
                    <div className="md:col-span-2 bg-[#faf8f2] border border-[#d8c3ad]/60 rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#534434] mb-2 border-b border-[#d8c3ad]/40 pb-2">
                        <ChefHat size={16} className="text-[#855300]" />
                        <span className="font-mono text-xs uppercase tracking-widest font-bold">Preparation Details</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {selectedOrder.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-[#d8c3ad]/40">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-[#534434]">{item.quantity}x {item.name}</span>
                              <span className="text-[10px] font-mono text-[#534434]/60 uppercase mt-1">Station: {item.station}</span>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className="font-mono text-sm text-[#855300] font-bold"><span className="font-sans">₹</span>{item.unit_price * item.quantity}</span>
                              <span className="text-[9px] font-mono text-[#534434]/40 uppercase mt-1 bg-[#faf8f2] px-2 py-0.5 rounded border border-[#d8c3ad]/30">Chef MockName</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financials */}
                    <div className="bg-[#faf8f2] border border-[#d8c3ad]/60 rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#534434] mb-2 border-b border-[#d8c3ad]/40 pb-2">
                        <DollarSign size={16} className="text-emerald-600" />
                        <span className="font-mono text-xs uppercase tracking-widest font-bold">Financials</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 font-mono text-xs">
                        <div className="text-[#534434]/50 uppercase">Base Amount</div>
                        <div className="text-[#534434]"><span className="font-sans">₹</span>{selectedOrder.gross_amount + (selectedOrder.points_redeemed || 0)}</div>
                        
                        <div className="text-[#534434]/50 uppercase">Coupon</div>
                        <div className="text-emerald-600">MOCK_CODE (-<span className="font-sans">₹</span>20)</div>

                        <div className="text-[#534434]/50 uppercase">Coins Used</div>
                        <div className="text-[#9A642C] font-bold">{selectedOrder.points_redeemed || 0} Ilara Coins</div>
                        
                        <div className="text-[#534434]/50 uppercase border-t border-[#d8c3ad]/60 pt-2 font-bold">Amount Paid</div>
                        <div className="text-[#534434] border-t border-[#d8c3ad]/60 pt-2 font-bold text-lg"><span className="font-sans">₹</span>{selectedOrder.gross_amount}</div>
                        
                        <div className="text-[#534434]/50 uppercase">Paid Via</div>
                        <div className="text-[#534434] bg-white border border-[#d8c3ad]/50 px-2 py-1 rounded inline-block text-center w-fit uppercase font-bold text-[10px] tracking-wider">UPI</div>
                      </div>
                    </div>

                    {/* Delivery details (if applicable) */}
                    <div className="bg-[#faf8f2] border border-[#d8c3ad]/60 rounded-2xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[#534434] mb-2 border-b border-[#d8c3ad]/40 pb-2">
                        <MapPin size={16} className="text-blue-500" />
                        <span className="font-mono text-xs uppercase tracking-widest font-bold">Logistics</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 font-mono text-xs">
                        <div className="text-[#534434]/50 uppercase">Order Type</div>
                        <div className="text-[#534434] capitalize">{selectedOrder.order_type}</div>
                        
                        {selectedOrder.order_type === 'delivery' && (
                          <>
                            <div className="text-[#534434]/50 uppercase">Delivery Ptnr.</div>
                            <div className="text-blue-600 truncate" title={selectedOrder.rider_id || ''}>
                              {selectedOrder.rider_id ? 'Rahul Dev (EMP-7410)' : 'Unassigned'}
                            </div>
                            
                            <div className="text-[#534434]/50 uppercase">Rider Pickup</div>
                            <div className="text-[#534434]">{(selectedOrder.fulfillment_status === 'out_for_delivery' || selectedOrder.status === 'completed') ? formatTime(selectedOrder.updated_at || selectedOrder.created_at) : 'Awaiting Handover'}</div>
                            
                            <div className="text-[#534434]/50 uppercase">Delivered At</div>
                            <div className="text-[#534434]">{selectedOrder.status === 'completed' ? formatTime(selectedOrder.updated_at || selectedOrder.created_at) : 'Pending'}</div>
                          </>
                        )}
                        {selectedOrder.order_type !== 'delivery' && (
                          <div className="col-span-2 text-[#534434]/40 italic mt-2 text-center py-2 bg-white rounded-xl border border-[#d8c3ad]/40">
                            No delivery logistics required for {selectedOrder.order_type} orders.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reason Modal */}
          <AnimatePresence>
            {reasonModalOrder && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={() => setReasonModalOrder(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white border border-[#d8c3ad] rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-[#534434]"
                >
                  <h3 className="text-xl font-serif italic text-[#855300] font-black mb-2">Manager Override</h3>
                  <p className="text-xs text-[#534434]/70 mb-4 font-mono">
                    Order #{reasonModalOrder.token_number} is currently in <b>{reasonModalOrder.status}</b> state. 
                    Force-completing early requires a reason.
                  </p>
                  
                  <textarea
                    value={forceReason}
                    onChange={e => setForceReason(e.target.value)}
                    placeholder="Enter reason for early completion..."
                    className="w-full bg-white border border-[#d8c3ad] rounded-xl p-3 text-sm text-[#534434] focus:outline-none focus:border-[#855300] transition-colors mb-4 min-h-[100px]"
                  />
                  
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setReasonModalOrder(null)}
                      className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-[#534434]/70 hover:text-[#855300] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!forceReason.trim()) {
                          alert("Reason is required.");
                          return;
                        }
                        await handleCompleteOrder(reasonModalOrder.order_id, forceReason.trim());
                        setReasonModalOrder(null);
                      }}
                      disabled={isCompleting || !forceReason.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#f5f4ec] disabled:text-[#534434]/40 text-white px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                      {isCompleting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} 
                      Confirm
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  );
}
