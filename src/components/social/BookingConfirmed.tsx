'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Check, 
  Share2, 
  ChevronRight
} from 'lucide-react';
import { useStore } from '@/stores/useStore';

interface BookingConfirmedProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function BookingConfirmed({ onNavigate }: BookingConfirmedProps) {
  const { currentBooking } = useStore();
  const [copiedLink, setCopiedLink] = useState(false);

  React.useEffect(() => {
    if (!currentBooking) {
      onNavigate('book');
    }
  }, [currentBooking, onNavigate]);

  if (!currentBooking) return null;

  const handleCopyLink = () => {
    setCopiedLink(true);
    navigator.clipboard?.writeText?.(`https://ilara.cafe/social/lobby/join-match?id=${currentBooking.bookingId}`);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const hasSplits = currentBooking.splitFriends && currentBooking.splitFriends.length > 0;
  const numSplit = currentBooking.splitFriends?.length || 0;
  const splitAmount = Math.round(currentBooking.price / (numSplit + 1));

  // Generate a basic SVG QR Code
  const qrSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-24 h-24 text-[#241A15]">
      <rect width="100" height="100" fill="none" stroke="currentColor" strokeWidth="2"/>
      <rect x="4" y="4" width="24" height="24" fill="currentColor"/>
      <rect x="8" y="8" width="16" height="16" fill="white"/>
      <rect x="11" y="11" width="10" height="10" fill="currentColor"/>

      <rect x="72" y="4" width="24" height="24" fill="currentColor"/>
      <rect x="76" y="8" width="16" height="16" fill="white"/>
      <rect x="79" y="11" width="10" height="10" fill="currentColor"/>

      <rect x="4" y="72" width="24" height="24" fill="currentColor"/>
      <rect x="8" y="76" width="16" height="16" fill="white"/>
      <rect x="11" y="79" width="10" height="10" fill="currentColor"/>

      <rect x="36" y="8" width="6" height="6" fill="currentColor"/>
      <rect x="46" y="14" width="12" height="6" fill="currentColor"/>
      <rect x="36" y="24" width="6" height="12" fill="currentColor"/>
      
      <rect x="8" y="36" width="6" height="6" fill="currentColor"/>
      <rect x="14" y="46" width="12" height="12" fill="currentColor"/>
      <rect x="24" y="36" width="6" height="6" fill="currentColor"/>

      <rect x="36" y="42" width="18" height="6" fill="currentColor"/>
      <rect x="42" y="52" width="6" height="12" fill="currentColor"/>
      <rect x="52" y="48" width="12" height="6" fill="currentColor"/>

      <rect x="72" y="36" width="12" height="6" fill="currentColor"/>
      <rect x="80" y="48" width="16" height="12" fill="currentColor"/>
      
      <rect x="36" y="72" width="6" height="12" fill="currentColor"/>
      <rect x="46" y="80" width="18" height="16" fill="currentColor"/>
      <rect x="72" y="72" width="12" height="6" fill="currentColor"/>
      <rect x="80" y="82" width="8" height="8" fill="currentColor"/>
    </svg>
  );

  return (
    <div className="w-full flex flex-col items-center gap-5 pb-16 max-w-sm mx-auto">
      
      {/* Animated Check Circle */}
      <div className="flex flex-col items-center text-center mt-3">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-md"
        >
          <Check size={28} className="stroke-[3]" />
        </motion.div>
        <h3 className="text-lg font-bold font-serif text-[#241A15] mt-3">Booking Confirmed!</h3>
        <p className="text-[10px] text-[#66554A] font-mono mt-0.5">Ticket ID: {currentBooking.bookingId}</p>
      </div>

      {/* Ticket Details Container */}
      <div className="w-full bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col items-center text-center">
        {/* Ticket perforation circles */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-background border-r border-[#E8DFD3] rounded-r-full" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-background border-l border-[#E8DFD3] rounded-l-full" />

        <div className="w-full pb-3 border-b border-[#E8DFD3]/60 mb-4 flex flex-col items-center">
          <p className="text-[8px] font-mono font-black uppercase tracking-wider text-[#9A642C] mb-1">Pass & Verify at Turf</p>
          {qrSvg}
          <p className="text-[8px] text-[#66554A] font-mono mt-1.5">Scan QR code at register counter</p>
        </div>

        <div className="w-full flex flex-col gap-2.5 text-left text-[10px]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-mono font-bold uppercase text-[#66554A] text-[8px]">Venue</span>
              <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.turfName}</p>
            </div>
            <div>
              <span className="font-mono font-bold uppercase text-[#66554A] text-[8px]">Date & Time</span>
              <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.date}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-[#E8DFD3]/40">
            <div>
              <span className="font-mono font-bold uppercase text-[#66554A] text-[8px]">Duration</span>
              <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.duration} Hr ({currentBooking.timeSlot})</p>
            </div>
            <div>
              <span className="font-mono font-bold uppercase text-[#66554A] text-[8px]">Paid via</span>
              <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.paymentMethod}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 font-mono text-[9px] pt-1">
            <div className="flex justify-between">
              <span>Total Price:</span>
              <span className="font-bold text-[#241A15]">₹{currentBooking.price}</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>Advance Paid Online:</span>
              <span>₹300</span>
            </div>
            <div className="flex justify-between text-zinc-500 font-bold">
              <span>Remaining at Venue:</span>
              <span>₹{Math.max(0, currentBooking.price - 300)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Split status */}
      {hasSplits && (
        <div className="w-full bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm text-[10px] font-mono text-[#66554A]">
          <p className="font-bold text-[#241A15] mb-1">Split Payment Status</p>
          <p className="text-[10px] leading-relaxed mb-2.5">
            Requests of ₹{splitAmount} sent to: <strong>{currentBooking.splitFriends?.join(', ')}</strong>.
          </p>
          
          <button 
            onClick={handleCopyLink}
            className="w-full py-2 rounded-lg border border-[#C3924F]/30 bg-white hover:bg-[#FAF7F2] font-sans font-bold text-[#9A642C] text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            {copiedLink ? (
              <span>Link Copied!</span>
            ) : (
              <>
                <Share2 size={12} />
                <span>Share Match Link</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="w-full flex flex-col gap-2">
        <button
          onClick={() => onNavigate('activities')}
          className="w-full py-3.5 rounded-lg bg-[#9A642C] hover:bg-[#805120] text-white font-mono text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all shadow-md shadow-[#9A642C]/10 flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>Go to Activities</span>
          <ChevronRight size={12} />
        </button>

        <button
          onClick={() => onNavigate('hub')}
          className="w-full py-3.5 rounded-lg bg-white border border-[#E8DFD3] text-[#241A15] hover:bg-[#FAF7F2] font-mono text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
        >
          Return to Social Hub
        </button>
      </div>

    </div>
  );
}
