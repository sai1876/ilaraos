'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Flame, Sparkles, CheckCircle2, X, MapPin, ArrowRight, Clock3 } from 'lucide-react';
import { isActiveOrderStatus } from '@/lib/orderUtils';
import { useStore } from '@/store/useStore';
import { OrderDocument } from '@/lib/types';
import dynamic from 'next/dynamic';

const CustomerDeliveryMap = dynamic(() => import('./CustomerDeliveryMap'), { ssr: false });

function formatDeliveryAddress(address: unknown): string {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return '';
  const value = address as { fullAddress?: unknown; lat?: unknown; lng?: unknown };
  if (typeof value.fullAddress === 'string') return value.fullAddress;
  if (typeof value.lat === 'number' && typeof value.lng === 'number') {
    return `Coordinates: ${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`;
  }
  return '';
}

export default function FloatingOrderTracker({ showNavigation = false }: { showNavigation?: boolean }) {
  const { 
    activeOrders, 
    isTrackerOpen: isOpen,
    setIsTrackerOpen: setIsOpen,
    selectedTrackerOrderId: selectedTrackingOrderId,
    setSelectedTrackerOrderId: setSelectedTrackingOrderId
  } = useStore();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const activeTrackableOrders = useMemo(() => activeOrders.filter(o => isActiveOrderStatus(o.status)), [activeOrders]);
  
  const activeOrder = selectedTrackingOrderId 
    ? activeTrackableOrders.find(o => o.order_id === selectedTrackingOrderId) || null
    : (activeTrackableOrders.length === 1 ? activeTrackableOrders[0] : null);

  useEffect(() => {
    if (selectedTrackingOrderId && !activeTrackableOrders.find(o => o.order_id === selectedTrackingOrderId)) {
      setIsOpen(false);
      setSelectedTrackingOrderId(null);
    }
    if (activeTrackableOrders.length === 0) {
      setIsOpen(false);
      setIsSelectorOpen(false);
    }
  }, [activeTrackableOrders, selectedTrackingOrderId, setIsOpen, setSelectedTrackingOrderId]);

  // If tracker is opened globally but there are multiple active orders and no specific ID selected:
  useEffect(() => {
    const isMultiple = activeTrackableOrders.length > 1;
    if (isOpen && isMultiple && !selectedTrackingOrderId) {
      setIsSelectorOpen(true);
      setIsOpen(false);
    }
  }, [isOpen, activeTrackableOrders.length, selectedTrackingOrderId, setIsOpen]);

  const displayOrder = activeOrder || activeTrackableOrders[0];

  if (activeTrackableOrders.length === 0 || !displayOrder) return null;

  // Map state to progress percentage and sub-copy
  const getStatusMapping = (order: OrderDocument) => {
    switch (order.status) {
      case 'confirmed':
        return {
          step: 0,
          percent: 15,
          title: 'Order Confirmed',
          icon: <ShoppingBag className="text-[var(--primary)]" size={20} />,
          desc: 'Your order request has been received. Queueing at prep station...',
        };
      
      case 'preparing':
        return {
          step: 1,
          percent: 50,
          title: 'Preparing Refreshments',
          icon: <Flame className="text-amber-500 animate-pulse" size={20} />,
          desc: 'Our chefs are crafting your culinary retreat inside the kitchen.',
        };
      case 'ready':
        return {
          step: 2,
          percent: 85,
          title: order.order_type === 'delivery' ? 'Prepared & Awaiting Rider' : 'Ready for Pickup!',
          icon: <Sparkles className="text-emerald-500 animate-bounce" size={20} />,
          desc: order.order_type === 'delivery'
            ? `Your order is freshly prepared and awaiting dispatch. A rider will pick it up shortly! 🛵`
            : order.hatch 
            ? `Collect your ice cold sips and bites at the ${order.hatch} Hatch! 🍹`
            : 'Your order is ready! Collect it from the counter.',
        };
      case 'dispatched':
      case 'out_for_delivery':
        return {
          step: 2,
          percent: 85,
          title: 'Out for Delivery',
          icon: <Sparkles className="text-blue-400 animate-pulse" size={20} />,
          desc: 'Rider is carrying your refreshments to your campus coordinate!',
        };
      case 'delivered':
        return {
          step: 3,
          percent: 100,
          title: 'Delivered',
          icon: <CheckCircle2 className="text-[#22c55e]" size={20} />,
          desc: 'Vibes restored. Leave the classroom stress behind!',
        };
      default:
        return {
          step: 0,
          percent: 0,
          title: 'Processing',
          icon: <ShoppingBag size={20} />,
          desc: 'Initialising ticket...',
        };
    }
  };

  const statusInfo = getStatusMapping(displayOrder);
  const modalStatusInfo = activeOrder ? getStatusMapping(activeOrder) : statusInfo;



  return (
    <>

      {/* Selector Modal */}
      <AnimatePresence>
        {isSelectorOpen && (
          <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSelectorOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-md bg-white border border-[#e8e0d8] rounded-3xl overflow-hidden z-10 shadow-2xl pb-4 sm:pb-0"
            >
              <div className="p-5 border-b border-[#e8e0d8] flex justify-between items-center bg-[#fdfcf7]">
                <h3 className="font-serif italic text-lg text-[#1b1c17] font-bold">Select Order to Track</h3>
                <button onClick={() => setIsSelectorOpen(false)} className="text-[#867461] hover:text-[#1b1c17] transition-colors p-1">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto no-scrollbar">
                {activeTrackableOrders.map(order => (
                  <button
                    key={order.order_id}
                    onClick={() => {
                      setSelectedTrackingOrderId(order.order_id);
                      setIsSelectorOpen(false);
                      setIsOpen(true);
                    }}
                    className="w-full text-left bg-white border border-[#e8e0d8] hover:border-[#d8c3ad] rounded-2xl p-4 transition-all group flex items-center justify-between hover:bg-[#fbf9f1]/30 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-[#1b1c17] font-bold">
                          #{order.order_type === 'delivery' ? order.order_id : order.token_number}
                        </span>
                        <span className="text-[9px] font-mono font-bold uppercase bg-[#f5f4ec] text-[#534434] px-2 py-0.5 rounded border border-[#d8c3ad]/40 whitespace-nowrap shrink-0">
                          {order.order_type}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#867461] font-mono uppercase tracking-wider font-semibold">
                        {order.status === 'ready' ? 'Ready' : order.status === 'preparing' ? 'Preparing' : order.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                        {' • '}₹{order.gross_amount}
                      </div>
                    </div>
                    <div className="text-[#855300] font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      Track &rarr;
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Detailed Panel Modal */}
      <AnimatePresence>
        {isOpen && activeOrder && (
          <div className="fixed inset-0 z-[99999] flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-[#211a14]/70 backdrop-blur-md"
            />

            {/* Modal Body Container */}
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative z-10 flex max-h-[92dvh] w-full max-w-[540px] flex-col overflow-hidden rounded-t-[32px] border border-[#e8dfd3] bg-[#fffdfa] text-[#1b1c17] shadow-[0_32px_90px_rgba(33,26,20,0.30)] sm:rounded-[32px]"
            >
              {/* Top Banner Accent */}
              <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#e99700] via-[#f8c45b] to-[#9a642c]" />

              {/* Close Button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-5 top-5 z-20 rounded-full border border-white/15 bg-white/10 p-2 text-white/75 transition-all hover:bg-white/20 hover:text-white"
                aria-label="Close order tracker"
              >
                <X size={18} />
              </button>

              <div className="min-h-0 overflow-y-auto no-scrollbar">
                {/* Header info - Grid System for Full Information */}
                <div className="relative overflow-hidden bg-[#2a211b] px-5 pb-6 pt-7 sm:px-7">
                  <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full border border-[#f6cf80]/15" />
                  <div className="pointer-events-none absolute -bottom-20 right-16 h-36 w-36 rounded-full bg-[#9a642c]/20 blur-2xl" />
                  <div className="relative grid grid-cols-[auto_1fr] items-center gap-4 pr-10">
                  <div className="flex h-14 shrink-0 items-center justify-center rounded-2xl border border-[#f8cf79]/35 bg-[#fff8e6] px-3.5 font-mono text-base font-black text-[#7c4b0b] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                    #{activeOrder.order_type === 'delivery' ? activeOrder.order_id : activeOrder.token_number}
                  </div>
                  <div>
                    <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#f2c56f]">Live order status</span>
                    <h3 className="mt-1 font-serif text-[25px] font-bold leading-none text-[#fffdfa]">{modalStatusInfo.title}</h3>
                    <span className="mt-2 inline-flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                      <Clock3 size={11} /> Updating live
                    </span>
                  </div>
                  </div>
                </div>

              <div className="space-y-5 p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#806e60]">Fulfilment</span>
                  <span className="rounded-full border border-[#e9c47e]/50 bg-[#fff5db] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#89530e]">
                    {activeOrder.order_type.replace('-', ' ')}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="rounded-[24px] border border-[#eadfce] bg-[#fff8eb] p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#805a32]">Order journey</span>
                    <span className="font-mono text-[10px] font-bold text-[#9a642c]">{modalStatusInfo.percent}%</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#eadfce]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${modalStatusInfo.percent}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ef9900] to-[#9a642c]"
                    />
                  </div>
                  
                  {/* Progress Node Labels */}
                  <div className="relative mt-5 flex items-center justify-between">
                    <div className="absolute left-5 right-5 top-5 h-px bg-[#dfcdb4]" />
                    {['Ordered', 'Preparing', activeOrder.order_type === 'delivery' ? 'On Way' : 'Ready'].map((name, idx) => {
                      const isActive = modalStatusInfo.step >= idx;
                      const isCurrent = modalStatusInfo.step === idx;
                      return (
                        <div key={name} className="flex flex-col items-center z-10">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm transition-all ${
                            isCurrent
                              ? 'border-[#e99700] bg-[#e99700] text-white shadow-[0_5px_14px_rgba(233,151,0,0.30)]'
                              : isActive
                              ? 'border-[#c9914d] bg-[#fffdfa] text-[#855300] font-bold'
                              : 'border-[#dfcdb4] bg-[#fffaf1] text-[#bba992]'
                          }`}>
                            {idx === 0 && '🛒'}
                            {idx === 1 && '🔥'}
                            {idx === 2 && (activeOrder.order_type === 'delivery' ? '🚴' : '🥤')}
                          </div>
                          <span className={`mt-2 text-center font-mono text-[8px] uppercase tracking-[0.12em] ${
                            isCurrent ? 'font-bold text-[#855300]' : 'text-[#8a796a]'
                          }`}>
                            {name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detail Description */}
                <div className="flex gap-3 rounded-2xl border border-[#f0d69c] bg-[#fff5d9] p-4">
                  <div className="mt-0.5 shrink-0 rounded-xl bg-white/60 p-2">{modalStatusInfo.icon}</div>
                  <div>
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a642c]">What happens next</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-[#714a1a]">{modalStatusInfo.desc}</p>
                  </div>
                </div>

                {/* OTP block for delivery orders */}
                {activeOrder.order_type === 'delivery' && activeOrder.otp && (
                  <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#f0d69c] bg-[#fff5d9] p-4 text-center">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#855300] font-bold">Delivery Verification OTP</span>
                    <span className="font-mono text-3xl font-black tracking-[0.25em] text-[#855300] pl-[0.25em]">{activeOrder.otp}</span>
                    <p className="text-[11px] text-[#867461]">Share this code with your delivery partner to verify your order.</p>
                  </div>
                )}

                {/* Live Tracking Map */}
                {showNavigation && activeOrder.order_type === 'delivery' && activeOrder.fulfillment_status === 'out_for_delivery' && (
                  <div className="mb-6">
                    <CustomerDeliveryMap 
                      orderId={activeOrder.order_id}
                      deliveryLocation={activeOrder.delivery_coordinates} 
                    />
                  </div>
                )}

                {/* Checklist / Order Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#534434]">Order summary</h4>
                    <span className="font-mono text-[9px] text-[#8a796a]">{activeOrder.items.length} item{activeOrder.items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1 no-scrollbar">
                    {activeOrder.items.map((item) => (
                      <div key={item.item_id} className="flex items-center justify-between rounded-2xl border border-[#eadfce] bg-white p-3.5 text-xs shadow-[0_4px_14px_rgba(74,52,32,0.03)]">
                        <div className="flex-1 pr-3">
                          <span className="text-[#1b1c17] font-bold">{item.name}</span>
                          <span className="text-[#855300] font-mono font-bold ml-2">×{item.quantity}</span>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.modifiers.map((mod) => (
                              <span key={mod} className="rounded-md border border-[#f0d69c] bg-[#fff7e3] px-2 py-0.5 font-mono text-[8px] font-bold text-[#855300]">
                                  {mod}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center">
                          <span className={`rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-wider ${
                            item.item_status === 'ready' 
                              ? 'bg-emerald-50 text-emerald-700 font-bold' 
                              : item.item_status === 'preparing' 
                              ? 'bg-amber-50 text-amber-700 animate-pulse font-semibold' 
                              : 'bg-[#f7f2eb] text-[#867461]'
                          }`}>
                            {item.item_status === 'ready' ? 'Ready' : item.item_status === 'preparing' ? 'Preparing' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hand-off counter/address point */}
                {activeOrder.order_type === 'delivery' && activeOrder.delivery_address && (
                  <div className="flex flex-col gap-1.5 rounded-2xl border border-[#eadfce] bg-[#fffdfa] p-4">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#867461]">Rider coordinate address</span>
                    <div className="flex items-start gap-2 text-xs text-[#1b1c17]/90">
                      <MapPin size={14} className="text-[#855300] shrink-0 mt-0.5" />
                      <span>
                        {formatDeliveryAddress(activeOrder.delivery_address)}
                      </span>
                    </div>
                  </div>
                )}

                {activeOrder.order_type !== 'delivery' && activeOrder.hatch && (
                  <div className="flex items-center justify-between rounded-2xl border border-[#eadfce] bg-[#fffdfa] p-4 text-xs font-mono">
                    <span className="text-[9px] uppercase tracking-widest text-[#867461]">Hand-off point</span>
                    <span className="font-bold uppercase text-[#855300]">{activeOrder.hatch} Hatch</span>
                  </div>
                )}

                {/* Confirm tracking button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="group flex w-full items-center justify-between rounded-2xl bg-[#9a642c] px-5 py-4 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(154,100,44,0.24)] transition-all hover:bg-[#805020] active:scale-[0.98]"
                >
                  <span>Return to cafe</span>
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
