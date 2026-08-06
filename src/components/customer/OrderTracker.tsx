'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Flame, Sparkles, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { OrderDocument } from '@/lib/types';
import dynamic from 'next/dynamic';

const CustomerDeliveryMap = dynamic(() => import('./CustomerDeliveryMap'), { ssr: false });

export default function OrderTracker() {
  const { activeOrders } = useStore();
  const [expanded, setExpanded] = useState(false);

  const activeOrder = activeOrders.length > 0 ? activeOrders[0] : null;

  if (activeOrders.length === 0 || !activeOrder) return null;

  // Map state to progress percentage and sub-copy
  const getStatusMapping = (status: OrderDocument['status']) => {
    switch (status) {
      case 'confirmed':
        return {
          step: 0,
          percent: 15,
          title: 'Order Confirmed',
          icon: <ShoppingBag className="text-[#B89C48]" size={20} />,
          desc: 'Your escape request has been received. Queueing at prep station...',
        };
      
      case 'preparing':
        return {
          step: 1,
          percent: 50,
          title: 'Preparing Refreshments',
          icon: <Flame className="text-amber-500 animate-pulse" size={20} />,
          desc: 'Chefs are crafting your culinary retreat inside the mist-cooled kitchen.',
        };
      case 'ready':
        return {
          step: 2,
          percent: 85,
          title: activeOrder.order_type === 'delivery' ? 'Prepared & Awaiting Rider' : 'Ready for Pickup!',
          icon: <Sparkles className="text-emerald-500 animate-bounce" size={20} />,
          desc: activeOrder.order_type === 'delivery'
            ? `Your order is freshly prepared and awaiting dispatch. A rider will pick it up shortly! 🛵`
            : activeOrder.hatch 
            ? `Collect your ice cold sips and bites at the ${activeOrder.hatch} Hatch! 🍹`
            : 'Your order is ready! Collect it from the counter.',
        };
      // Handled by fulfillment_status check (legacy switch)\n      case 'out_for_delivery' as any:
        return {
          step: 2,
          percent: 85,
          title: 'Out for Delivery',
          icon: <Sparkles className="text-blue-400 animate-pulse" size={20} />,
          desc: 'Rider is carrying your refreshments to your campus coordinate!',
        };
      // Handled by fulfillment_status check (legacy switch)\n      case 'delivered' as any:
        return {
          step: 3,
          percent: 100,
          title: 'Delivered',
          icon: <CheckCircle2 className="text-blue-500" size={20} />,
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

  const statusInfo = getStatusMapping(activeOrder.status);

  return (
    <div className="w-full px-4 max-w-[800px] mx-auto mb-8 mt-10 relative z-40">
      <motion.div
        layout
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[24px] border border-[#e8e0d8] shadow-[0_8px_30px_rgba(83,68,52,0.06)] overflow-hidden relative"
      >
        <div className="relative z-10">
          {/* Main Brief Card */}
          <div 
            onClick={() => setExpanded(!expanded)}
            className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-[#fbf9f1]/50 transition-colors"
          >
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="shrink-0 h-12 px-3.5 rounded-2xl bg-[#fff8e6] border border-[#f59e0b]/30 flex items-center justify-center font-mono font-black text-[#855300] text-base shadow-sm">
                #{activeOrder.order_type === 'delivery' ? activeOrder.order_id : activeOrder.token_number}
              </div>
              <div className="flex flex-col justify-center">
                <span className="font-mono text-[10px] md:text-xs tracking-widest uppercase text-[#855300] font-bold whitespace-nowrap mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" /> Live Order Tracking
                </span>
                <h4 className="font-serif italic text-2xl md:text-3xl text-[#1b1c17] font-bold">
                  {statusInfo.title}
                </h4>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto border-t border-[#e8e0d8] pt-3 md:pt-0 md:border-0">
              <div className="flex items-center gap-2">
                {activeOrder.order_type === 'delivery' && activeOrder.otp && (
                  <span className="font-mono text-xs font-bold text-[#855300] bg-[#fff8e6] px-3 py-1.5 rounded-full border border-[#f59e0b]/30 flex items-center gap-1.5">
                    <span className="text-[#867461]/80">OTP:</span> {activeOrder.otp}
                  </span>
                )}
                <span className="font-mono text-[10px] tracking-wider font-bold uppercase text-[#534434] bg-[#f5f4ec] px-3 py-1.5 rounded-full border border-[#d8c3ad]/55">
                  {activeOrder.order_type}
                </span>
              </div>
              <motion.div 
                animate={{ rotate: expanded ? 180 : 0 }}
                className="text-[#867461] bg-[#f5f4ec] hover:bg-[#e8e0d8] p-2 rounded-full flex items-center justify-center w-7 h-7 text-xs font-black transition-colors"
              >
                ▼
              </motion.div>
            </div>
          </div>

          {/* Progress Bar Strip (Inset for clean rounded styling) */}
          <div className="px-5 pb-4">
            <div className="h-1.5 bg-[#f5f4ec] w-full rounded-full relative overflow-hidden">
              <motion.div 
                animate={{ width: `${statusInfo.percent}%` }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="h-full bg-gradient-to-r from-[#f59e0b] to-[#855300] rounded-full absolute left-0 top-0"
              />
            </div>
          </div>

          {/* Detailed Expandable Area */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-[#e8e0d8] overflow-hidden"
              >
                <div className="p-6 space-y-6">
                  {/* Visual Status Step Nodes */}
                  <div className="flex justify-between items-center relative py-4">
                    {/* Connector line */}
                    <div className="absolute left-4 right-4 h-0.5 bg-[#e8e0d8] z-0" />
                    
                    {/* Status Steps */}
                    {['Ordered', 'Preparing', activeOrder.order_type === 'delivery' ? 'On Way' : 'Ready'].map((name, idx) => {
                      const isActive = statusInfo.step >= idx;
                      const isCurrent = statusInfo.step === idx;
                      return (
                        <div key={name} className="flex flex-col items-center z-10">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                            isCurrent 
                              ? 'bg-[#f59e0b] border-[#f59e0b] text-[#1b1c17] shadow-md'
                              : isActive 
                              ? 'bg-white border-[#f59e0b] text-[#855300] font-bold'
                              : 'bg-[#f5f4ec] border-[#d8c3ad] text-[#867461]/40'
                          }`}>
                            {idx === 0 && '🛒'}
                            {idx === 1 && '🔥'}
                            {idx === 2 && (activeOrder.order_type === 'delivery' ? '🚴' : '🥤')}
                          </div>
                          <span className={`text-[9px] font-mono uppercase tracking-widest mt-2 ${
                            isCurrent ? 'text-[#855300] font-bold' : 'text-[#867461]'
                          }`}>
                            {name}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Subtext description */}
                  <div className="bg-[#fff8e6] border border-[#f59e0b]/20 p-4 rounded-2xl flex gap-3 items-start">
                    <div className="shrink-0 mt-0.5">{statusInfo.icon}</div>
                    <p className="text-xs text-[#855300] font-medium leading-relaxed">{statusInfo.desc}</p>
                  </div>

                  {/* OTP block for delivery orders */}
                  {activeOrder.order_type === 'delivery' && activeOrder.otp && (
                    <div className="bg-[#fff8e6] border border-[#f59e0b]/20 p-5 rounded-2xl flex flex-col items-center justify-center gap-2 text-center">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-[#855300] font-bold">Delivery Verification OTP</span>
                      <span className="font-mono text-3xl font-black tracking-[0.25em] text-[#855300] pl-[0.25em]">{activeOrder.otp}</span>
                      <p className="text-xs text-[#867461]">Share this 4-digit code with your rider to complete delivery.</p>
                    </div>
                  )}

                  {/* Live Tracking Map */}
                  {activeOrder.order_type === 'delivery' && activeOrder.fulfillment_status === 'out_for_delivery' && (
                    <div className="mb-4">
                      <CustomerDeliveryMap 
                        orderId={activeOrder.order_id}
                        deliveryLocation={activeOrder.delivery_coordinates} 
                      />
                    </div>
                  )}

                  {/* Order Details Checklist */}
                  <div className="space-y-3">
                    <h5 className="font-mono text-[10px] uppercase tracking-widest text-[#534434] font-bold">Order Checklist</h5>
                    <div className="space-y-2">
                      {activeOrder.items.map((item) => (
                        <div key={item.item_id} className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-[#e8e0d8] text-xs">
                          <div className="flex-1 pr-4">
                            <span className="text-[#1b1c17] font-bold">{item.name}</span>
                            <span className="text-[#855300] font-mono font-bold ml-2">×{item.quantity}</span>
                            {/* Modifiers List */}
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.modifiers.map(mod => (
                                  <span key={mod} className="text-[8px] font-mono bg-[#fff8e6] border border-[#f59e0b]/20 px-2 py-0.5 rounded-md text-[#855300] font-bold">
                                    {mod}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          {/* Prep Status Indicator */}
                          <div className="flex items-center">
                            <span className={`text-[9px] font-mono uppercase tracking-wider ${
                              item.item_status === 'ready' 
                                ? 'text-emerald-600 font-bold' 
                                : item.item_status === 'preparing' 
                                ? 'text-amber-600 animate-pulse font-semibold' 
                                : 'text-[#867461]/60'
                            }`}>
                              {item.item_status === 'ready' ? 'Ready' : item.item_status === 'preparing' ? 'Preparing' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Counter Meta */}
                  {activeOrder.hatch && (
                    <div className="flex justify-between items-center text-xs font-mono border-t border-[#e8e0d8] pt-4">
                      <span className="text-[#867461]">Hand-off Point</span>
                      <span className="text-[#855300] font-bold uppercase">{activeOrder.hatch} Hatch</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
