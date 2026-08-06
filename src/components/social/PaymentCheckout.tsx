'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Wallet, 
  CreditCard, 
  Smartphone, 
  BadgeIndianRupee, 
  ShieldCheck,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { useStore, CricketBooking } from '@/stores/useStore';
import { addBooking } from '@/lib/dbService';

interface PaymentCheckoutProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function PaymentCheckout({ onNavigate }: PaymentCheckoutProps) {
  const { currentBooking, setCurrentBooking } = useStore();
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card' | 'netbanking' | 'counter'>('upi');
  const [isProcessing, setIsProcessing] = useState(false);

  React.useEffect(() => {
    if (!currentBooking) {
      onNavigate('book');
    }
  }, [currentBooking, onNavigate]);

  if (!currentBooking) return null;

  // Split calculations
  const totalAmount = currentBooking.price;
  const numSplit = currentBooking.splitFriends.length;

  const handlePay = async () => {
    setIsProcessing(true);

    // Simulate payment gateway load
    setTimeout(async () => {
      try {
        const confirmedBooking: CricketBooking = {
          ...currentBooking,
          bookingId: `ILARA-CRIC-${Math.floor(1000 + Math.random() * 9000)}`,
          paymentMethod: selectedMethod === 'upi' 
            ? 'UPI App' 
            : selectedMethod === 'card' 
              ? 'Credit Card' 
              : selectedMethod === 'netbanking'
                ? 'Netbanking'
                : 'Pay at Counter',
          totalPaid: 300,
          isConfirmed: true,
          createdAt: Date.now()
        };

        // Write to Firebase Firestore backend collection
        await addBooking(confirmedBooking);

        setIsProcessing(false);
        setCurrentBooking(confirmedBooking);
        onNavigate('confirmed');
      } catch (err) {
        setIsProcessing(false);
        console.error("Failed to confirm booking on backend:", err);
        alert("Failed to confirm your booking. Please try again.");
      }
    }, 2000);
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-44 md:pb-20 relative">
      
      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] bg-[#241A15]/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="animate-spin text-[#C3924F]" size={36} />
          <h3 className="text-base font-bold font-serif text-white mt-1">Processing Payment...</h3>
          <p className="text-[10px] text-zinc-400 font-mono">Securing booking & generating split links</p>
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

      {/* Invoice Details Card */}
      <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold font-serif text-[#241A15] mb-2 pb-2 border-b border-[#E8DFD3]/40">Payment Overview</h3>
        <div className="flex flex-col gap-1.5 font-mono text-[10px] text-[#66554A]">
          <div className="flex justify-between">
            <span>Total Booking Amount:</span>
            <span>₹{totalAmount}</span>
          </div>
          <div className="flex justify-between font-bold text-[#9A642C] border-t border-[#E8DFD3]/40 pt-1.5 mt-0.5">
            <span>Advance Payment (Pay Online Now):</span>
            <span>₹300</span>
          </div>
          <div className="flex justify-between text-zinc-500 font-bold">
            <span>Remaining Balance (Pay at Ground):</span>
            <span>₹{Math.max(0, totalAmount - 300)}</span>
          </div>
          {numSplit > 0 && (
            <div className="flex flex-col gap-1 text-[9px] text-[#66554A] mt-1 pt-1.5 border-t border-[#E8DFD3]/40">
              <div className="flex justify-between">
                <span>Split Friends ({numSplit}):</span>
                <span>{currentBooking.splitFriends.join(', ')}</span>
              </div>
              <p className="text-zinc-500 italic mt-0.5 text-[8px] leading-tight">
                * Split links will be generated for the total booking amount. The host pays ₹300 advance online.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Select Payment Method */}
      <section className="flex flex-col gap-2.5">
        <h4 className="text-xs font-bold font-serif text-[#241A15]">Select Payment Method</h4>
        <div className="flex flex-col gap-2.5">
          
          {/* UPI */}
          <button 
            onClick={() => setSelectedMethod('upi')}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
              selectedMethod === 'upi'
                ? 'bg-[#9A642C]/10 border-[#9A642C]'
                : 'bg-white border-[#E8DFD3] hover:border-[#C3924F]'
            }`}
          >
            <Smartphone className={`shrink-0 mt-0.5 ${selectedMethod === 'upi' ? 'text-[#9A642C]' : 'text-[#66554A]'}`} size={16} />
            <div>
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Instant UPI (GPay, PhonePe, Paytm)</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Pay securely using any active UPI app installed on your device.</p>
            </div>
          </button>

          {/* Cards */}
          <button 
            onClick={() => setSelectedMethod('card')}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
              selectedMethod === 'card'
                ? 'bg-[#9A642C]/10 border-[#9A642C]'
                : 'bg-white border-[#E8DFD3] hover:border-[#C3924F]'
            }`}
          >
            <CreditCard className={`shrink-0 mt-0.5 ${selectedMethod === 'card' ? 'text-[#9A642C]' : 'text-[#66554A]'}`} size={16} />
            <div>
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Credit or Debit Card</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Visa, Mastercard, RuPay cards supported. 3D secure verification.</p>
            </div>
          </button>

          {/* Netbanking */}
          <button 
            onClick={() => setSelectedMethod('netbanking')}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
              selectedMethod === 'netbanking'
                ? 'bg-[#9A642C]/10 border-[#9A642C]'
                : 'bg-white border-[#E8DFD3] hover:border-[#C3924F]'
            }`}
          >
            <Wallet className={`shrink-0 mt-0.5 ${selectedMethod === 'netbanking' ? 'text-[#9A642C]' : 'text-[#66554A]'}`} size={16} />
            <div>
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Net Banking</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Secure payment via all major Indian banking portals.</p>
            </div>
          </button>

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
              <h5 className="font-sans font-bold text-xs text-[#241A15]">Pay at Cafeteria Counter</h5>
              <p className="text-[9px] text-[#66554A] mt-0.5">Pay in cash or tap card at the register before entering the turf.</p>
            </div>
          </button>

        </div>
      </section>

      {/* QR Code section for UPI */}
      {selectedMethod === 'upi' && (
        <div className="bg-white border border-[#E8DFD3] rounded-2xl p-5 flex flex-col items-center gap-3.5 shadow-sm">
          <style>{`
            @keyframes scan {
              0% { transform: translateY(0); }
              50% { transform: translateY(112px); }
              100% { transform: translateY(0); }
            }
            .animate-scan {
              animation: scan 2s linear infinite;
            }
          `}</style>
          <div className="text-center">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#9A642C]">Scan to Pay Advance</h4>
            <p className="text-[8px] text-[#66554A] font-mono mt-0.5">Scan using GPay, PhonePe, Paytm, or any UPI App</p>
          </div>
          
          {/* QR Code Container */}
          <div className="relative p-3 bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl w-36 h-36 flex items-center justify-center overflow-hidden">
            {/* Animated scan bar */}
            <div className="absolute top-3 left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-[#C3924F] to-transparent animate-scan shadow-[0_0_8px_#C3924F] z-10" />
            
            {/* SVG Simulated QR code */}
            <svg width="108" height="108" viewBox="0 0 100 100" className="text-[#241A15]">
              {/* Outer corners */}
              <path d="M 0,0 H 30 V 10 H 10 V 30 H 0 Z" fill="currentColor" />
              <path d="M 70,0 H 100 V 30 H 90 V 10 H 70 Z" fill="currentColor" />
              <path d="M 0,70 H 10 V 90 H 30 V 100 H 0 Z" fill="currentColor" />
              <path d="M 70,100 H 90 V 90 H 100 V 70 H 90 V 80 H 80 V 90 H 70 Z" fill="currentColor" />
              {/* Corner squares */}
              <rect x="15" y="15" width="15" height="15" fill="currentColor" />
              <rect x="70" y="15" width="15" height="15" fill="currentColor" />
              <rect x="15" y="70" width="15" height="15" fill="currentColor" />
              {/* Middle mock squares */}
              <rect x="45" y="10" width="10" height="10" fill="currentColor" />
              <rect x="45" y="30" width="10" height="10" fill="currentColor" />
              <rect x="10" y="45" width="10" height="10" fill="currentColor" />
              <rect x="30" y="45" width="10" height="10" fill="currentColor" />
              <rect x="60" y="45" width="10" height="10" fill="currentColor" />
              <rect x="80" y="45" width="10" height="10" fill="currentColor" />
              <rect x="45" y="60" width="10" height="10" fill="currentColor" />
              <rect x="45" y="80" width="10" height="10" fill="currentColor" />
            </svg>
          </div>
          
          <div className="flex flex-col items-center text-center font-mono">
            <span className="text-xs font-black text-[#9A642C] bg-[#9A642C]/10 px-3 py-1 rounded-full">UPI ID: ilaraturf@oksbi</span>
            <span className="text-[7px] text-[#66554A] mt-1.5">Reference: ILARA-ADV-{currentBooking.bookingId.split('-')[1] || '001'}</span>
          </div>
        </div>
      )}

      {/* Security Info */}
      <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl p-3 flex items-start gap-2.5 mt-1 text-[#66554A] text-[9px] leading-relaxed font-mono">
        <ShieldCheck className="text-[#C3924F] shrink-0" size={14} />
        <div>
          <p className="font-bold text-[#241A15]">SSL Encrypted Gateway</p>
          <p className="mt-0.5">All transactions are secured with 256-bit encryption. Cancellation is free up to 2 hours before the session.</p>
        </div>
      </div>

      {/* Pay trigger action footer */}
      <div className="fixed bottom-[184px] left-4 right-4 z-40 bg-white/90 backdrop-blur-md border border-[#E8DFD3] px-4 py-3 flex items-center justify-between gap-4 max-w-md mx-auto rounded-2xl shadow-[0_8px_32px_rgba(36,26,21,0.08)] md:static md:w-full md:max-w-none md:p-0 md:bg-transparent md:border-none md:shadow-none">
        <div className="flex flex-col">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Advance Payment</span>
          <span className="text-base font-mono font-black text-[#9A642C]">₹300</span>
        </div>

        <button
          onClick={handlePay}
          className="py-3 px-6 rounded-lg bg-[#9A642C] hover:bg-[#805120] text-white font-mono text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-[#9A642C]/10 flex items-center gap-1 cursor-pointer"
        >
          <span>{selectedMethod === 'counter' ? 'Confirm Booking' : 'Pay ₹300 Online'}</span>
          <ChevronRight size={12} />
        </button>
      </div>

    </div>
  );
}
