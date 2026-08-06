'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Sparkles, 
  Check, 
  Plus, 
  Minus,
  Mail,
  UserCheck,
  Users,
  ChevronRight,
  Info
} from 'lucide-react';
import { useStore, CricketBooking } from '@/stores/useStore';

interface BookingDetailsProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

const ADDON_LIST = [
  { id: 'kit', name: 'Professional Cricket Kit', description: '2 Kashmir willow bats, pads, gloves, helmets', price: 250 },
  { id: 'water', name: 'Hydration Pack', description: '6 bottles of chilled mineral water', price: 90 },
  { id: 'energy', name: 'Energy Drink Pack', description: '4 cans of energy drinks', price: 180 }
];

const FRIEND_LIST = [
  "Aryan Sharma",
  "Sneha Reddy",
  "Amit Patel",
  "Rohan Verma",
  "Riya Sen",
  "Karan Malhotra",
  "Manish Joshi",
  "Priya Nair"
];

export default function BookingDetails({ onNavigate }: BookingDetailsProps) {
  const { currentBooking, setCurrentBooking, userProfile } = useStore();

  // If no current booking, redirect back
  React.useEffect(() => {
    if (!currentBooking) {
      onNavigate('book');
    }
  }, [currentBooking, onNavigate]);

  const [addons, setAddons] = useState<{ [key: string]: number }>({ kit: 0, water: 0, energy: 0 });
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(!!userProfile?.student_email);
  const [showEmailError, setShowEmailError] = useState(false);

  if (!currentBooking) return null;

  const handleQtyChange = (id: string, delta: number) => {
    setAddons(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta)
    }));
  };

  const toggleFriend = (name: string) => {
    setSelectedFriends(prev => 
      prev.includes(name) 
        ? prev.filter(f => f !== name) 
        : [...prev, name]
    );
  };

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    const isStudent = email.endsWith('.edu') || email.endsWith('.ac.in') || email.endsWith('.edu.in');
    
    if (isStudent) {
      setIsEmailVerified(true);
      setShowEmailError(false);
    } else {
      setShowEmailError(true);
    }
  };

  // Calculations
  const basePrice = currentBooking.price;
  const addonsTotal = ADDON_LIST.reduce((sum, item) => sum + (addons[item.id] || 0) * item.price, 0);
  const subtotal = basePrice + addonsTotal;
  
  // Student discount: 15% off
  const discount = isEmailVerified ? Math.round(subtotal * 0.15) : 0;
  const grandTotal = subtotal - discount;

  const handleProceed = () => {
    const finalAddons = ADDON_LIST
      .filter(item => addons[item.id] > 0)
      .map(item => ({
        name: item.name,
        price: item.price,
        quantity: addons[item.id]
      }));

    const updatedBooking: CricketBooking = {
      ...currentBooking,
      addons: finalAddons,
      splitFriends: selectedFriends,
      totalPrice: grandTotal,
      price: grandTotal
    } as any;

    setCurrentBooking(updatedBooking);
    onNavigate('checkout');
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-44 md:pb-20">
      
      {/* Header */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => onNavigate('book')}
          className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#241A15] hover:bg-[#FAF7F2] active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-bold font-serif text-[#241A15]">Booking Details</h2>
      </div>

      {/* Summary Card */}
      <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold font-serif text-[#241A15] mb-2.5 pb-2 border-b border-[#E8DFD3]/40">Session Summary</h3>
        <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[10px] font-mono text-[#66554A]">
          <div>
            <p className="font-bold text-[8px] uppercase tracking-wider text-[#9A642C]/80">Court</p>
            <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.turfName}</p>
          </div>
          <div>
            <p className="font-bold text-[8px] uppercase tracking-wider text-[#9A642C]/80">Date</p>
            <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.date}</p>
          </div>
          <div>
            <p className="font-bold text-[8px] uppercase tracking-wider text-[#9A642C]/80">Time</p>
            <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.timeSlot}</p>
          </div>
          <div>
            <p className="font-bold text-[8px] uppercase tracking-wider text-[#9A642C]/80">Duration</p>
            <p className="font-sans font-bold text-[#241A15] text-xs">{currentBooking.duration} Hr</p>
          </div>
        </div>
      </div>

      {/* Add-ons Section */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-bold font-serif text-[#241A15]">Optional Add-ons</h4>
        <div className="flex flex-col gap-2.5">
          {ADDON_LIST.map((item) => {
            const qty = addons[item.id] || 0;
            return (
              <div 
                key={item.id}
                className="bg-white border border-[#E8DFD3] rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex-1">
                  <h5 className="font-sans font-bold text-xs text-[#241A15]">{item.name}</h5>
                  <p className="text-[9px] text-[#66554A] mt-0.5 leading-relaxed">{item.description}</p>
                  <span className="inline-block mt-1 font-mono text-xs font-bold text-[#9A642C]">₹{item.price}</span>
                </div>
                
                {/* Qty selectors */}
                <div className="flex items-center gap-2 bg-[#FAF7F2] border border-[#E8DFD3] rounded-lg p-0.5 shrink-0">
                  <button 
                    onClick={() => handleQtyChange(item.id, -1)}
                    className="w-6 h-6 rounded hover:bg-[#F3ECE3] flex items-center justify-center text-[#241A15] transition-colors cursor-pointer"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono text-xs font-bold w-4 text-center">{qty}</span>
                  <button 
                    onClick={() => handleQtyChange(item.id, 1)}
                    className="w-6 h-6 rounded hover:bg-[#F3ECE3] flex items-center justify-center text-[#241A15] transition-colors cursor-pointer"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Student Discount Verification */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-bold font-serif text-[#241A15] flex items-center gap-1">
          <span>Student Verification</span>
          <Sparkles size={12} className="text-[#C3924F]" />
        </h4>
        
        {isEmailVerified ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 flex items-center gap-2.5">
            <UserCheck className="text-emerald-600 shrink-0" size={16} />
            <div>
              <p className="text-xs font-bold">15% Student Discount Applied</p>
              <p className="text-[9px] text-emerald-700 mt-0.5">Verified via college email account.</p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#E8DFD3] rounded-xl p-3">
            <p className="text-[10px] text-[#66554A] mb-2 leading-relaxed">
              Verify your college email (`.edu` or `.ac.in`) to unlock a 15% discount.
            </p>
            <form onSubmit={handleVerifyEmail} className="flex gap-2">
              <div className="relative flex-1">
                <input 
                  type="email"
                  required
                  placeholder="name@college.edu"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] focus:border-[#9A642C] focus:ring-0 text-xs outline-none text-[#241A15]"
                />
                <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#66554A]/60" />
              </div>
              <button 
                type="submit"
                className="bg-[#9A642C] hover:bg-[#805120] text-white px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
              >
                Verify
              </button>
            </form>
            {showEmailError && (
              <p className="text-[9px] text-red-500 font-medium mt-1 flex items-center gap-1">
                <Info size={9} />
                <span>Must be a valid .edu or .ac.in student email.</span>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Split payment friend list selection */}
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-bold font-serif text-[#241A15] flex items-center gap-1.5">
          <span>Split Payment</span>
          <Users size={12} className="text-[#C3924F]" />
        </h4>
        <p className="text-[10px] text-[#66554A] leading-relaxed">
          Select friends from your list. We'll send them a payment request link when you confirm.
        </p>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1.5 pt-0.5">
          {FRIEND_LIST.map((name) => {
            const isSelected = selectedFriends.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggleFriend(name)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl border text-[10px] font-sans font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-[#9A642C] border-[#9A642C] text-white shadow-sm'
                    : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                }`}
              >
                <span>{name}</span>
                {isSelected && <Check size={10} />}
              </button>
            );
          })}
        </div>

        {selectedFriends.length > 0 && (
          <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl p-3 text-[10px] font-mono text-[#66554A] mt-1.5">
            <p className="font-bold text-[#241A15]">Split Breakdown</p>
            <div className="flex justify-between mt-1.5 pt-1.5 border-t border-[#E8DFD3]/40">
              <span>You pay ({Math.round(100 / (selectedFriends.length + 1))}%):</span>
              <span className="font-bold text-[#9A642C]">₹{Math.round(grandTotal / (selectedFriends.length + 1))}</span>
            </div>
            <div className="flex justify-between mt-0.5 text-[9px]">
              <span>{selectedFriends.length} friends pay (₹{Math.round(grandTotal / (selectedFriends.length + 1))} each):</span>
              <span className="font-bold">₹{Math.round(grandTotal / (selectedFriends.length + 1)) * selectedFriends.length}</span>
            </div>
          </div>
        )}
      </section>

      {/* Pricing Summary */}
      <section className="bg-white border border-[#E8DFD3] rounded-2xl p-4 shadow-sm mt-1">
        <h4 className="text-[9px] font-mono font-black uppercase tracking-wider text-[#66554A] mb-2">Invoice Summary</h4>
        <div className="flex flex-col gap-1.5 font-mono text-[10px] text-[#66554A]">
          <div className="flex justify-between">
            <span>Base price ({currentBooking.duration} Hr):</span>
            <span>₹{basePrice}</span>
          </div>
          <div className="flex justify-between">
            <span>Add-ons:</span>
            <span>₹{addonsTotal}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>Student Discount (15%):</span>
              <span>-₹{discount}</span>
            </div>
          )}
          <div className="flex justify-between text-xs font-bold text-[#241A15] border-t border-[#E8DFD3]/40 pt-2.5 mt-1">
            <span>Grand Total:</span>
            <span className="text-[#9A642C] text-sm">₹{grandTotal}</span>
          </div>
          <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-dashed border-[#E8DFD3]">
            <div className="flex justify-between text-[#9A642C] font-bold">
              <span>Advance Payment (Pay Now):</span>
              <span>₹300</span>
            </div>
            <div className="flex justify-between text-zinc-500 font-bold">
              <span>Remaining Balance (Pay at Turf):</span>
              <span>₹{Math.max(0, grandTotal - 300)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Action Footer */}
      <div className="fixed bottom-[184px] left-4 right-4 z-40 bg-white/90 backdrop-blur-md border border-[#E8DFD3] px-4 py-3 flex items-center justify-between gap-4 max-w-md mx-auto rounded-2xl shadow-[0_8px_32px_rgba(36,26,21,0.08)] md:static md:w-full md:max-w-none md:p-0 md:bg-transparent md:border-none md:shadow-none">
        <div className="flex flex-col">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Advance Payment</span>
          <span className="text-base font-mono font-black text-[#9A642C]">₹300</span>
        </div>

        <button
          onClick={handleProceed}
          className="py-3 px-6 rounded-lg bg-[#9A642C] hover:bg-[#805120] text-white font-mono text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-[#9A642C]/10 flex items-center gap-1 cursor-pointer"
        >
          <span>Select Payment</span>
          <ChevronRight size={12} />
        </button>
      </div>

    </div>
  );
}
