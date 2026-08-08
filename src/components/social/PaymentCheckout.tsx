'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Smartphone, 
  BadgeIndianRupee, 
  ShieldCheck,
  Loader2,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { useStore, CricketBooking } from '@/stores/useStore';
import { confirmCricketBooking } from '@/features/cricket/cricketService';

interface PaymentCheckoutProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function PaymentCheckout({ onNavigate }: PaymentCheckoutProps) {
  const { currentBooking, setCurrentBooking, userProfile } = useStore();
  const [selectedMethod, setSelectedMethod] = useState<'counter' | 'demo_online'>('counter');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (!currentBooking) {
      onNavigate('book');
    }
  }, [currentBooking, onNavigate]);

  if (!currentBooking) return null;

  const totalAmountRupees = currentBooking.price;
  const slotKeys = currentBooking.slotKeys || [];

  const handlePay = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const isDemo = selectedMethod === 'demo_online';
      const res = await confirmCricketBooking({
        holdId: currentBooking.bookingId,
        slot_keys: slotKeys,
        date: currentBooking.businessDate || '',
        customer_name: userProfile?.name || 'Patron',
        customer_phone: userProfile?.phone || '',
        payment_option: isDemo ? 'demo_online' : 'pay_at_venue',
      });

      if (res.success) {
        const confirmedBooking: CricketBooking = {
          ...currentBooking,
          bookingId: res.bookingReference,
          paymentMethod: isDemo ? 'DEMO Payment (Online)' : 'Pay at Venue Counter',
          totalPaid: res.booking.paid_paise / 100,
          isConfirmed: true,
          ticketToken: res.ticketToken,
          createdAt: res.booking.created_at,
          paymentStatus: res.booking.payment_status,
        };

        setCurrentBooking(confirmedBooking);
        onNavigate('confirmed');
      }
    } catch (err: any) {
      console.error('Failed to confirm booking on server:', err);
      if (err.message?.includes('SLOT_CONFLICT')) {
        setErrorMsg('That slot was just booked by another user. Please pick an open slot.');
      } else {
        setErrorMsg(err.message || 'Failed to confirm booking. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-44 md:pb-20 relative">
      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] bg-[#241A15]/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="animate-spin text-[#C3924F]" size={36} />
          <h3 className="text-base font-bold font-serif text-white mt-1">Securing Booking…</h3>
          <p className="text-[10px] text-zinc-400 font-mono">Verifying lock & issuing ticket token</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => onNavigate('details')}
          className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#241A15] hover:bg-[#FAF7F2] active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-bold font-serif text-[#241A15]">Checkout</h2>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Invoice Details Card */}
      <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold font-serif text-[#241A15] mb-2 pb-2 border-b border-[#E8DFD3]/40">Payment Truth Overview</h3>
        <div className="flex flex-col gap-1.5 font-mono text-[10px] text-[#66554A]">
          <div className="flex justify-between">
            <span>Total Session Price:</span>
            <span className="font-bold text-[#241A15]">₹{totalAmountRupees}</span>
          </div>
          <div className="flex justify-between">
            <span>Venue:</span>
            <span>Ilara Turf 1 (Main Pitch)</span>
          </div>
          <div className="flex justify-between">
            <span>Session Slot:</span>
            <span>{currentBooking.timeSlot}</span>
          </div>
        </div>
      </div>

      {/* Select Payment Method */}
      <section className="flex flex-col gap-2.5">
        <h4 className="text-xs font-bold font-serif text-[#241A15]">Select Payment Method</h4>
        <div className="flex flex-col gap-2.5">
          {/* Pay at Counter */}
          <button 
            onClick={() => setSelectedMethod('counter')}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
              selectedMethod === 'counter'
                ? 'bg-[#9A642C]/10 border-[#9A642C]'
                : 'bg-white border-[#E8DFD3] hover:border-[#C3924F]'
            }`}
          >
            <BadgeIndianRupee className={`shrink-0 mt-0.5 ${selectedMethod === 'counter' ? 'text-[#9A642C]' : 'text-[#66554A]'}`} size={16} />
            <div>
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Pay at Turf Register</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Reserve slot now. Pay cash or tap card at the register before entry.</p>
            </div>
          </button>

          {/* DEMO Online Payment */}
          <button 
            onClick={() => setSelectedMethod('demo_online')}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
              selectedMethod === 'demo_online'
                ? 'bg-[#9A642C]/10 border-[#9A642C]'
                : 'bg-white border-[#E8DFD3] hover:border-[#C3924F]'
            }`}
          >
            <Smartphone className={`shrink-0 mt-0.5 ${selectedMethod === 'demo_online' ? 'text-[#9A642C]' : 'text-[#66554A]'}`} size={16} />
            <div>
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Demo Online Payment (Simulated)</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Simulate instant online payment for testing.</p>
            </div>
          </button>
        </div>
      </section>

      {/* Security Info */}
      <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl p-3 flex items-start gap-2.5 mt-1 text-[#66554A] text-[9px] leading-relaxed font-mono">
        <ShieldCheck className="text-[#C3924F] shrink-0" size={14} />
        <div>
          <p className="font-bold text-[#241A15]">Server Authoritative Double-Booking Protection</p>
          <p className="mt-0.5">Slots are locked using Firestore transactions to guarantee zero duplicate bookings.</p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="fixed bottom-[184px] left-4 right-4 z-40 bg-white/90 backdrop-blur-md border border-[#E8DFD3] px-4 py-3 flex items-center justify-between gap-4 max-w-md mx-auto rounded-2xl shadow-[0_8px_32px_rgba(36,26,21,0.08)] md:static md:w-full md:max-w-none md:p-0 md:bg-transparent md:border-none md:shadow-none">
        <div className="flex flex-col">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Total Price</span>
          <span className="text-base font-mono font-black text-[#9A642C]">₹{totalAmountRupees}</span>
        </div>

        <button
          onClick={handlePay}
          disabled={isProcessing}
          className="py-3 px-6 rounded-lg bg-[#2F6B54] hover:bg-[#204a3a] text-white font-mono text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <span>{selectedMethod === 'counter' ? 'Reserve & Pay at Venue' : 'Simulate Demo Payment'}</span>
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
