'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Navigation, 
  Star, 
  Lock
} from 'lucide-react';
import { useStore, CricketBooking } from '@/stores/useStore';
import { streamCricketConfig, streamBookings } from '@/lib/dbService';
import { CricketConfig } from '@/features/cricket/cricketService';
import { generateHourlyTimeSlots } from '@/features/cricket/timeSlots';

interface BookCricketProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export const ALL_TIME_SLOTS = generateHourlyTimeSlots();

export default function BookCricket({ onNavigate }: BookCricketProps) {
  const { setCurrentBooking } = useStore();
  
  // Settings & bookings from Firebase
  const [config, setConfig] = useState<CricketConfig>({
    basePrice: 800,
    openingTime: "06:00 AM",
    closingTime: "11:00 PM",
    blockedSlots: []
  });
  
  const [dbBookings, setDbBookings] = useState<CricketBooking[]>([]);

  // Local selection states
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);

  // Sync settings and bookings
  useEffect(() => {
    const unsubConfig = streamCricketConfig((data) => {
      setConfig(data);
    });

    const unsubBookings = streamBookings((data) => {
      setDbBookings(data);
    });

    return () => {
      unsubConfig();
      unsubBookings();
    };
  }, []);

  // Generate next 7 days starting from today
  const getDates = () => {
    const list = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const current = new Date();
      current.setDate(today.getDate() + i);
      const isToday = i === 0;
      
      const label = isToday ? "Today" : days[current.getDay()];
      const dayNum = current.getDate();
      const dateStr = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const fullDateStr = `${label} (${dateStr})`;

      // Count open slots (total slots minus blocked/booked slots)
      let openSlotsCount = 0;
      ALL_TIME_SLOTS.forEach(slot => {
        const blockKey = `${dateStr}:${slot}`;
        const isBlocked = config.blockedSlots.includes(blockKey);
        const isBooked = dbBookings.some(b => b.date === dateStr && b.timeSlot === slot && b.isConfirmed);
        if (!isBlocked && !isBooked) openSlotsCount++;
      });

      list.push({
        label,
        dayNum,
        dateStr,
        fullDateStr,
        slotsLeft: openSlotsCount
      });
    }
    return list;
  };

  const dates = getDates();
  const currentSelectedDateStr = dates[selectedDateIndex]?.dateStr;

  const handleProceed = () => {
    if (selectedSlots.length === 0) return;

    const basePrice = config.basePrice;
    const totalBasePrice = basePrice * selectedSlots.length;
    const slotsString = selectedSlots.join(", ");
    
    const newBooking: CricketBooking = {
      bookingId: `bk-${Date.now()}`,
      date: currentSelectedDateStr,
      timeSlot: slotsString,
      duration: selectedSlots.length,
      turfName: "Ilara Box Cricket",
      price: totalBasePrice,
      addons: [],
      splitFriends: [],
      paymentMethod: '',
      totalPaid: totalBasePrice,
      isConfirmed: false,
      createdAt: Date.now()
    };

    setCurrentBooking(newBooking);
    onNavigate('details');
  };

  const isPeakHour = (slot: string) => {
    const startTime = slot.split(' - ')[0];
    const hour = parseInt(startTime.split(':')[0]);
    const isPM = startTime.endsWith('PM');
    return isPM && (hour >= 5 && hour !== 12);
  };

  // Group slots
  const getCategorizedSlots = () => {
    const morning = [];
    const afternoon = [];
    const evening = [];

    for (const slot of ALL_TIME_SLOTS) {
      const startTime = slot.split(' - ')[0];
      const isPM = startTime.endsWith('PM');
      const hour = parseInt(startTime.split(':')[0]);

      if (!isPM) {
        morning.push(slot);
      } else if (hour === 12 || hour < 4) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    }

    return { morning, afternoon, evening };
  };

  const { morning, afternoon, evening } = getCategorizedSlots();

  const getSlotState = (slot: string) => {
    const blockKey = `${currentSelectedDateStr}:${slot}`;
    const isBlocked = config.blockedSlots.includes(blockKey);
    const isBooked = dbBookings.some(
      b => b.date === currentSelectedDateStr && b.timeSlot.split(', ').includes(slot) && b.isConfirmed
    );
    return { isBlocked, isBooked };
  };

  const toggleSlot = (slot: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot);
      } else {
        const newSlots = [...prev, slot];
        return newSlots.sort((a, b) => ALL_TIME_SLOTS.indexOf(a) - ALL_TIME_SLOTS.indexOf(b));
      }
    });
  };

  const formatSelectedSlots = () => {
    if (selectedSlots.length === 0) return 'Total Share';
    if (selectedSlots.length === 1) return selectedSlots[0];
    
    // Check if consecutive
    let isConsecutive = true;
    for (let i = 1; i < selectedSlots.length; i++) {
      const prevIndex = ALL_TIME_SLOTS.indexOf(selectedSlots[i - 1]);
      const currIndex = ALL_TIME_SLOTS.indexOf(selectedSlots[i]);
      if (currIndex !== prevIndex + 1) {
        isConsecutive = false;
        break;
      }
    }
    
    if (isConsecutive) {
      const firstSlot = selectedSlots[0];
      const lastSlot = selectedSlots[selectedSlots.length - 1];
      const startTime = firstSlot.split(" - ")[0];
      const endTime = lastSlot.split(" - ")[1];
      return `${startTime} - ${endTime}`;
    } else {
      return `${selectedSlots.length} Slots Selected`;
    }
  };

  // Filter out any selected slots that became booked or blocked in real-time
  useEffect(() => {
    if (selectedSlots.length > 0) {
      setSelectedSlots(prev => prev.filter(slot => {
        const { isBlocked, isBooked } = getSlotState(slot);
        return !isBlocked && !isBooked;
      }));
    }
  }, [dbBookings, config.blockedSlots]);

  return (
    <div className="w-full flex flex-col gap-5 pb-44 md:pb-20">
      
      {/* Header Bar */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => onNavigate('hub')}
          className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#241A15] hover:bg-[#FAF7F2] active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-bold font-serif text-[#241A15]">Book Box Cricket</h2>
      </div>

      {/* Turf Hero Details Card */}
      <section className="flex flex-col gap-3">
        <div className="w-full h-36 md:h-48 rounded-2xl overflow-hidden relative border border-[#E8DFD3] shadow-sm bg-zinc-900">
          <img 
            className="w-full h-full object-cover" 
            alt="Ilara Box Cricket" 
            src="/images/cafe_hero.jpg"
            onError={(e) => {
              e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#9A642C"/><text x="50%" y="50%" fill="white" font-size="36" font-weight="bold" text-anchor="middle">Ilara Box Cricket</text></svg>')}`;
            }}
          />
          <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-0.5 flex items-center gap-1 text-[10px] font-mono font-black text-[#241A15] shadow border border-[#E8DFD3]">
            <Star size={10} className="fill-[#C3924F] text-[#C3924F]" />
            <span>4.8</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-bold font-serif text-[#241A15]">Ilara Box Cricket</h3>
            <span className="text-sm font-mono font-black text-[#9A642C]">₹{config.basePrice}/hr</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#66554A] font-medium">
            <MapPin size={12} className="text-[#C3924F]" />
            <span>Beside Ilara Cafeteria, North Campus</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex items-center gap-1 bg-white border border-[#E8DFD3] px-2.5 py-1 rounded-full text-[9px] font-mono font-bold text-[#66554A]">
              <Clock size={10} className="text-[#C3924F]" />
              <span>{config.openingTime} - {config.closingTime}</span>
            </div>
            <a 
              href="https://maps.google.com" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-1 bg-[#FAF7F2] hover:bg-[#F3ECE3] border border-[#C3924F]/30 px-2.5 py-1 rounded-full text-[9px] font-mono font-bold text-[#9A642C] transition-colors"
            >
              <Navigation size={10} />
              <span>Directions</span>
            </a>
          </div>
        </div>
      </section>

      {/* Date Scroll Picker */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-bold font-serif text-[#241A15]">Select Date</h4>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1.5">
          {dates.map((d, idx) => {
            const isActive = selectedDateIndex === idx;
            const isAlmostFull = d.slotsLeft <= 3 && d.slotsLeft > 0;
            const isFullyBooked = d.slotsLeft === 0;
            
            return (
              <button
                key={idx}
                onClick={() => { setSelectedDateIndex(idx); setSelectedSlots([]); }}
                className={`flex-shrink-0 w-20 flex flex-col items-center justify-center p-3 rounded-xl transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[#9A642C] border-[#9A642C] text-white shadow-md shadow-[#9A642C]/10'
                    : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                } relative`}
              >
                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${isActive ? 'text-white/80' : 'text-[#66554A]'}`}>
                  {d.label}
                </span>
                <span className="text-base font-bold font-mono my-0.5">{d.dayNum}</span>
                <span className={`text-[8px] font-mono font-bold ${
                  isActive 
                    ? 'text-white/90' 
                    : isFullyBooked
                      ? 'text-zinc-400'
                      : isAlmostFull 
                        ? 'text-red-500' 
                        : 'text-emerald-600'
                }`}>
                  {isFullyBooked ? 'Full' : `${d.slotsLeft} slots`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Time Slots Selector */}
      <section className="flex flex-col gap-4">
        <h4 className="text-xs font-bold font-serif text-[#241A15]">Select Time</h4>

        {/* Morning slots */}
        <div className="flex flex-col gap-2">
          <h5 className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#66554A]">🌅 Morning Slots</h5>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {morning.map((slot) => {
              const { isBlocked, isBooked } = getSlotState(slot);
              const isUnavailable = isBlocked || isBooked;
              const isSelected = selectedSlots.includes(slot);
              
              return (
                <button
                  key={slot}
                  disabled={isUnavailable}
                  onClick={() => toggleSlot(slot)}
                  className={`py-2 px-1 rounded-lg text-center font-mono text-[10px] font-bold transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-[#9A642C] border-[#9A642C] text-white font-black shadow-sm'
                      : isUnavailable
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed flex items-center justify-center gap-1'
                        : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center gap-0.5">
                      {isUnavailable && <Lock size={8} />}
                      <span className="text-[9px] font-bold">{slot.split(" - ")[0]}</span>
                    </div>
                    <span className={`text-[7px] font-medium ${isSelected ? 'text-white/60' : 'text-[#66554A]/60'}`}>to {slot.split(" - ")[1]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Afternoon slots */}
        <div className="flex flex-col gap-2">
          <h5 className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#66554A]">☀️ Afternoon Slots</h5>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {afternoon.map((slot) => {
              const { isBlocked, isBooked } = getSlotState(slot);
              const isUnavailable = isBlocked || isBooked;
              const isSelected = selectedSlots.includes(slot);
              
              return (
                <button
                  key={slot}
                  disabled={isUnavailable}
                  onClick={() => toggleSlot(slot)}
                  className={`py-2 px-1 rounded-lg text-center font-mono text-[10px] font-bold transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-[#9A642C] border-[#9A642C] text-white font-black shadow-sm'
                      : isUnavailable
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed flex items-center justify-center gap-1'
                        : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center gap-0.5">
                      {isUnavailable && <Lock size={8} />}
                      <span className="text-[9px] font-bold">{slot.split(" - ")[0]}</span>
                    </div>
                    <span className={`text-[7px] font-medium ${isSelected ? 'text-white/60' : 'text-[#66554A]/60'}`}>to {slot.split(" - ")[1]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Evening slots */}
        <div className="flex flex-col gap-2">
          <h5 className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#66554A]">🌙 Evening Slots (Peak)</h5>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {evening.map((slot) => {
              const { isBlocked, isBooked } = getSlotState(slot);
              const isUnavailable = isBlocked || isBooked;
              const isSelected = selectedSlots.includes(slot);
              const isPeak = isPeakHour(slot);
              
              return (
                <button
                  key={slot}
                  disabled={isUnavailable}
                  onClick={() => toggleSlot(slot)}
                  className={`py-1.5 px-1 rounded-lg text-center font-mono text-[10px] font-bold transition-all border relative flex flex-col items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-[#9A642C] border-[#9A642C] text-white font-black shadow-sm'
                      : isUnavailable
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed flex items-center justify-center gap-1'
                        : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center gap-0.5">
                      {isUnavailable && <Lock size={8} />}
                      <span className="text-[9px] font-bold">{slot.split(" - ")[0]}</span>
                    </div>
                    <span className={`text-[7px] font-medium ${isSelected ? 'text-white/60' : 'text-[#66554A]/60'}`}>to {slot.split(" - ")[1]}</span>
                    {isPeak && !isUnavailable && (
                      <span className={`text-[6px] font-mono font-bold uppercase tracking-wider mt-0.5 ${isSelected ? 'text-white/80' : 'text-[#C3924F]'}`}>Peak</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Floating Bottom Booking Action Bar */}
      <div className="fixed bottom-[184px] left-4 right-4 z-40 bg-white/90 backdrop-blur-md border border-[#E8DFD3] px-4 py-3 flex items-center justify-between gap-4 max-w-md mx-auto rounded-2xl shadow-[0_8px_32px_rgba(36,26,21,0.08)] md:static md:w-full md:max-w-none md:p-0 md:bg-transparent md:border-none md:shadow-none">
        <div className="flex flex-col">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#66554A]">
            {formatSelectedSlots()}
          </span>
          <span className="text-base font-mono font-black text-[#9A642C]">
            ₹{config.basePrice * selectedSlots.length}
          </span>
        </div>

        <button
          disabled={selectedSlots.length === 0}
          onClick={handleProceed}
          className={`py-3 px-6 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
            selectedSlots.length > 0
              ? 'bg-[#9A642C] hover:bg-[#805120] text-white active:scale-95 shadow-md shadow-[#9A642C]/10'
              : 'bg-zinc-100 border border-zinc-200 text-zinc-400 cursor-not-allowed'
          }`}
        >
          Confirm details
        </button>
      </div>

    </div>
  );
}
