'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Star, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useStore } from '@/stores/useStore';
import { 
  fetchCricketAvailability, 
  createCricketHold,
  CricketAvailabilityResponse 
} from '@/features/cricket/cricketService';
import { getBookingHorizonDates } from '@/features/cricket/cricketTime';

interface BookCricketProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function BookCricket({ onNavigate }: BookCricketProps) {
  const { setCurrentBooking } = useStore();
  
  // Available dates (Today + next 7 days = 8 dates total)
  const horizonDates = getBookingHorizonDates(7);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const selectedDate = horizonDates[selectedDateIndex];

  // API Availability state
  const [availData, setAvailData] = useState<CricketAvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [isHolding, setIsHolding] = useState(false);

  // Load server availability whenever date changes or every 30 seconds
  const loadAvailability = async (isSilent = false) => {
    if (!isSilent) setLoadingAvail(true);
    setErrorMsg(null);
    try {
      const data = await fetchCricketAvailability(selectedDate.dateStr);
      setAvailData(data);
    } catch (err: any) {
      console.error('Failed to load cricket availability:', err);
      setErrorMsg(err.message || 'Failed to load live slot availability');
    } finally {
      if (!isSilent) setLoadingAvail(false);
    }
  };

  useEffect(() => {
    setSelectedSlots([]);
    loadAvailability();

    const interval = setInterval(() => {
      loadAvailability(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedDateIndex]);

  const handleSlotClick = (slotKey: string) => {
    setErrorMsg(null);
    if (selectedSlots.includes(slotKey)) {
      setSelectedSlots(selectedSlots.filter((k) => k !== slotKey));
      return;
    }

    // Check consecutive constraint
    if (selectedSlots.length > 0 && availData) {
      const allSlots = availData.slots;
      const proposedKeys = [...selectedSlots, slotKey];
      const proposedSlots = allSlots
        .filter((s) => proposedKeys.includes(s.slotKey))
        .sort((a, b) => a.startAt - b.startAt);

      let isConsecutive = true;
      for (let i = 0; i < proposedSlots.length - 1; i++) {
        if (proposedSlots[i + 1].startAt !== proposedSlots[i].endAt) {
          isConsecutive = false;
          break;
        }
      }

      if (!isConsecutive) {
        setErrorMsg('Please choose consecutive time slots for a single booking session.');
        return;
      }
    }

    setSelectedSlots([...selectedSlots, slotKey]);
  };

  const handleProceed = async () => {
    if (selectedSlots.length === 0) return;
    setIsHolding(true);
    setErrorMsg(null);

    try {
      const holdRes = await createCricketHold(selectedSlots, selectedDate.dateStr);
      if (holdRes.success) {
        const sortedSlots = availData?.slots
          .filter((s) => selectedSlots.includes(s.slotKey))
          .sort((a, b) => a.startAt - b.startAt) || [];

        const displayTimeString = sortedSlots.length > 0
          ? `${sortedSlots[0].displayStart} - ${sortedSlots[sortedSlots.length - 1].displayEnd}`
          : 'Selected Session';

        setCurrentBooking({
          bookingId: holdRes.holdId,
          date: selectedDate.label,
          timeSlot: displayTimeString,
          duration: selectedSlots.length,
          turfName: 'Ilara Turf 1 (Main Pitch)',
          price: holdRes.totalPaise / 100,
          totalPaid: 0,
          isConfirmed: false,
          remainingPaidStatus: 'unpaid',
          slotKeys: holdRes.slotKeys,
          businessDate: selectedDate.dateStr,
          expiresAt: holdRes.expiresAt,
        });

        onNavigate('details');
      }
    } catch (err: any) {
      console.error('Failed to hold slots:', err);
      if (err.message?.includes('SLOT_CONFLICT')) {
        setErrorMsg('That slot was just reserved or booked by someone else. Updating slots...');
      } else {
        setErrorMsg(err.message || 'Could not reserve slots. Please try again.');
      }
      loadAvailability();
    } finally {
      setIsHolding(false);
    }
  };

  const currentSlots = availData?.slots || [];
  const basePriceRupees = (availData?.config?.base_price_paise || 80000) / 100;
  const totalPriceRupees = selectedSlots.length * basePriceRupees;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#241A15] pb-24 font-sans no-scrollbar">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#FFFDFC]/95 backdrop-blur-md border-b border-[#E8DFD3] px-4 py-3.5 flex items-center justify-between shadow-sm">
        <button 
          onClick={() => onNavigate('hub')}
          className="w-9 h-9 rounded-full bg-[#F3ECE3] flex items-center justify-center text-[#66554A] hover:bg-[#E8DFD3] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-center">
          <h1 className="font-serif text-lg font-bold text-[#241A15] tracking-tight">Box Cricket Booking</h1>
          <p className="text-[10px] text-[#66554A] font-mono">Asia/Kolkata Authoritative Time</p>
        </div>
        <button 
          onClick={() => loadAvailability()}
          className="w-9 h-9 rounded-full bg-[#F3ECE3] flex items-center justify-center text-[#66554A] hover:bg-[#E8DFD3] transition-colors"
          title="Refresh availability"
        >
          <RefreshCw size={16} className={loadingAvail ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-6">
        {/* Venue Info Card */}
        <div className="bg-[#FFFDFC] rounded-3xl border border-[#E8DFD3] p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#9A642C] bg-[#9A642C]/10 px-2.5 py-1 rounded-full border border-[#9A642C]/20">
                Premium Floodlit Pitch
              </span>
              <h2 className="font-serif text-xl font-bold text-[#241A15] mt-2">Ilara Turf 1 (Main Pitch)</h2>
            </div>
            <div className="flex items-center gap-1 bg-[#F3ECE3] px-2.5 py-1 rounded-full text-xs font-bold text-[#9A642C]">
              <Star size={12} className="fill-[#9A642C] text-[#9A642C]" />
              <span>4.9</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-[#66554A] mt-1">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-[#9A642C] shrink-0" />
              <span>Ilara Campus Venue • Court 1</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[#9A642C] shrink-0" />
              <span>{availData?.config?.opening_time || '06:00'} - {availData?.config?.closing_time || '23:00'} IST</span>
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[#66554A] uppercase tracking-wider px-1 flex justify-between">
            <span>Select Date</span>
            <span className="text-[10px] text-[#9A642C] capitalize font-mono">Today + 7 Days Horizon</span>
          </label>
          
          <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar">
            {horizonDates.map((item, idx) => {
              const isSelected = selectedDateIndex === idx;
              return (
                <button
                  key={item.dateStr}
                  onClick={() => setSelectedDateIndex(idx)}
                  className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-2xl border transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#9A642C] border-[#9A642C] text-white shadow-md scale-[1.02]'
                      : 'bg-[#FFFDFC] border-[#E8DFD3] text-[#241A15] hover:border-[#9A642C]/50'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/80' : 'text-[#66554A]'}`}>
                    {item.label}
                  </span>
                  <span className="text-xs font-mono font-bold mt-1">
                    {item.dateStr.slice(5)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slot Grid */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <label className="text-xs font-bold text-[#66554A] uppercase tracking-wider">
              Available Slots ({availData?.slotsLeft ?? 0} Left)
            </label>
            <span className="text-xs font-mono font-bold text-[#2F6B54]">
              ₹{basePriceRupees}/hr
            </span>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loadingAvail ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#66554A]">
              <RefreshCw size={24} className="animate-spin text-[#9A642C]" />
              <span className="text-xs font-mono">Fetching live slot availability…</span>
            </div>
          ) : currentSlots.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#66554A] bg-[#FFFDFC] rounded-2xl border border-[#E8DFD3]">
              No operational slots for this date.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {currentSlots.map((slot) => {
                const isSelected = selectedSlots.includes(slot.slotKey);
                const isAvailable = slot.status === 'available';

                return (
                  <button
                    key={slot.slotKey}
                    disabled={!isAvailable}
                    onClick={() => handleSlotClick(slot.slotKey)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs font-mono transition-all duration-200 ${
                      !isAvailable
                        ? 'bg-[#F3ECE3]/60 border-[#E8DFD3] text-[#66554A]/40 cursor-not-allowed opacity-60'
                        : isSelected
                        ? 'bg-[#2F6B54] border-[#2F6B54] text-white font-bold shadow-md'
                        : 'bg-[#FFFDFC] border-[#E8DFD3] text-[#241A15] hover:border-[#2F6B54]/50'
                    }`}
                  >
                    <span>{slot.displayStart}</span>
                    {!isAvailable ? (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#66554A]/10 text-[#66554A]">
                        {slot.status === 'past' ? 'Past' : slot.status === 'booked' ? 'Booked' : 'Unavailable'}
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold ${isSelected ? 'text-white' : 'text-[#2F6B54]'}`}>
                        ₹{slot.pricePaise / 100}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Action Bar */}
      {selectedSlots.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-[#FFFDFC]/95 backdrop-blur-md border-t border-[#E8DFD3] p-4 z-40 shadow-lg">
          <div className="max-w-md mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] text-[#66554A] uppercase tracking-wider font-bold">
                {selectedSlots.length} {selectedSlots.length === 1 ? 'Hour' : 'Hours'} Selected
              </div>
              <div className="text-lg font-serif font-bold text-[#241A15]">
                ₹{totalPriceRupees}
              </div>
            </div>

            <button
              onClick={handleProceed}
              disabled={isHolding}
              className="bg-[#2F6B54] hover:bg-[#204a3a] text-white px-6 py-3.5 rounded-2xl font-sans font-bold text-xs uppercase tracking-widest transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {isHolding ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Reserving…</span>
                </>
              ) : (
                <span>Proceed to Details</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
