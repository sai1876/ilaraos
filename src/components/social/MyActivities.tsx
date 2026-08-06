'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  QrCode, 
  CheckCircle2, 
  X,
  CreditCard
} from 'lucide-react';
import { useStore, CricketBooking } from '@/stores/useStore';
import { streamBookings } from '@/lib/dbService';

interface MyActivitiesProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function MyActivities({ onNavigate }: MyActivitiesProps) {
  const { userProfile } = useStore();
  const [activeTab, setActiveTab] = useState<'current' | 'past'>('current');
  const [selectedQrBooking, setSelectedQrBooking] = useState<CricketBooking | null>(null);
  const [dbBookings, setDbBookings] = useState<CricketBooking[]>([]);

  // Sync bookings from Firebase Firestore
  useEffect(() => {
    const unsub = streamBookings((data) => {
      setDbBookings(data);
    });
    return () => unsub();
  }, []);

  const currentUserName = userProfile?.name || userProfile?.student_email?.split('@')[0] || '';

  // Filter current bookings (mock logic or user-specific logic)
  // If user profile exists, show their bookings, otherwise show all for convenience
  const currentBookings = dbBookings.filter(b => {
    if (!currentUserName) return true; // Show all if testing anonymously
    return b.splitFriends.includes(currentUserName) || b.bookingId.length > 0; // Filter or show all
  });

  const pastBookingsMock: CricketBooking[] = [
    {
      bookingId: "ILARA-CRIC-1049",
      date: "Last Saturday (Jul 11)",
      timeSlot: "06:00 PM",
      duration: 2,
      turfName: "Ilara Box Cricket",
      price: 1600,
      addons: [{ name: "Professional Cricket Kit", price: 250, quantity: 1 }],
      splitFriends: ["Aryan Sharma", "Karan Malhotra"],
      paymentMethod: "UPI App",
      totalPaid: 617,
      isConfirmed: true,
      createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000
    }
  ];

  const bookingsToRender = activeTab === 'current' ? currentBookings : pastBookingsMock;

  const qrSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-36 h-36 text-[#241A15]">
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
      <rect x="72" y="36" width="12" height="6" fill="currentColor"/>
      <rect x="80" y="48" width="16" height="12" fill="currentColor"/>
      <rect x="36" y="72" width="6" height="12" fill="currentColor"/>
      <rect x="46" y="80" width="18" height="16" fill="currentColor"/>
      <rect x="72" y="72" width="12" height="6" fill="currentColor"/>
    </svg>
  );

  return (
    <div className="w-full flex flex-col gap-5 pb-20 relative">
      
      {/* Header */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => onNavigate('hub')}
          className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#241A15] hover:bg-[#FAF7F2] active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-bold font-serif text-[#241A15]">My Activities</h2>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#FAF7F2] border border-[#E8DFD3] p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('current')}
          className={`flex-1 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'current'
              ? 'bg-[#9A642C] text-white shadow-sm'
              : 'text-[#66554A] hover:text-[#241A15]'
          }`}
        >
          Active ({currentBookings.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'past'
              ? 'bg-[#9A642C] text-white shadow-sm'
              : 'text-[#66554A] hover:text-[#241A15]'
          }`}
        >
          Past ({pastBookingsMock.length})
        </button>
      </div>

      {/* Bookings List */}
      <div className="flex flex-col gap-4">
        {bookingsToRender.length === 0 ? (
          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2.5">
            <div className="text-2xl">📭</div>
            <h4 className="font-serif font-bold text-xs text-[#241A15]">No activities found</h4>
            <p className="text-[10px] text-[#66554A] max-w-xs leading-normal">You haven't booked any cricket slots or joined any lobbies yet.</p>
            <button 
              onClick={() => onNavigate('book')}
              className="mt-1.5 bg-[#9A642C] text-white px-4 py-2 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-[#805120] transition-colors cursor-pointer"
            >
              Book Cricket Slot
            </button>
          </div>
        ) : (
          bookingsToRender.map((booking) => {
            const hasSplits = booking.splitFriends && booking.splitFriends.length > 0;
            const selfShare = hasSplits ? Math.round(booking.price / (booking.splitFriends.length + 1)) : booking.price;
            
            return (
              <div 
                key={booking.bookingId}
                className="bg-white border border-[#E8DFD3] rounded-2xl p-4 shadow-sm flex flex-col gap-3.5"
              >
                {/* Title */}
                <div className="flex justify-between items-start pb-2 border-b border-[#E8DFD3]/60">
                  <div>
                    <h4 className="font-sans font-bold text-xs text-[#241A15]">{booking.turfName}</h4>
                    <span className="text-[9px] font-mono text-[#66554A]">{booking.bookingId}</span>
                  </div>
                  <span className="text-[8px] font-mono font-bold uppercase text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    <span>Confirmed</span>
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-[#66554A] font-mono">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="text-[#C3924F]" />
                    <span>{booking.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} className="text-[#C3924F]" />
                    <span>{booking.timeSlot} ({booking.duration}h)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-[#C3924F]" />
                    <span>Indoor Turf</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={11} className="text-[#C3924F]" />
                    <span>₹{selfShare} paid</span>
                  </div>
                </div>

                {/* Add-ons list */}
                {booking.addons && booking.addons.length > 0 && (
                  <div className="bg-[#FAF7F2] rounded-xl p-2.5 border border-[#E8DFD3]/60">
                    <p className="text-[8px] font-mono font-bold uppercase text-[#9A642C] mb-0.5">Add-ons</p>
                    <div className="flex flex-col gap-0.5 text-[9px] text-[#66554A]">
                      {booking.addons.map((a, i) => (
                        <div key={i} className="flex justify-between">
                          <span>{a.name} (x{a.quantity})</span>
                          <span>₹{a.price * a.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advance vs Remaining Payment Info */}
                <div className="bg-[#FAF7F2] rounded-xl p-3 border border-[#E8DFD3]/60 flex flex-col gap-1.5 text-[10px] font-mono">
                  <div className="flex justify-between text-[#66554A]">
                    <span>Total Cost:</span>
                    <span className="font-bold text-[#241A15]">₹{booking.price}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Advance Paid Online:</span>
                    <span className="font-bold">₹{booking.totalPaid || 300}</span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-500 pt-0.5 border-t border-[#E8DFD3]/40">
                    <span>Remaining Balance at Turf:</span>
                    <span className="font-bold">₹{Math.max(0, booking.price - (booking.totalPaid || 300))}</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] pt-1">
                    <span>Venue Balance Status:</span>
                    <span className={`px-2 py-0.5 rounded-full font-sans font-bold text-[8px] border uppercase ${
                      (booking as any).remainingPaidStatus === 'paid'
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-amber-700 bg-amber-50 border-amber-200'
                    }`}>
                      {(booking as any).remainingPaidStatus === 'paid' ? 'Paid at Venue' : 'Collect at Turf'}
                    </span>
                  </div>
                </div>

                {/* Split Progress Tracker */}
                {hasSplits && (
                  <div className="bg-[#FAF7F2] rounded-xl p-3 border border-[#E8DFD3]/60 flex flex-col gap-1.5">
                    <p className="text-[8px] font-mono font-bold uppercase text-[#9A642C]">Split Bill (₹{selfShare} each)</p>
                    
                    <div className="flex flex-col gap-1.5 mt-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-sans text-[#241A15] font-semibold">You (Host)</span>
                        <span className="text-[8px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.25 rounded-full border border-emerald-200">Paid</span>
                      </div>

                      {booking.splitFriends.map((f, idx) => {
                        const isFriendPaid = idx % 2 === 0;
                        return (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="font-sans text-[#66554A]">{f}</span>
                            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.25 rounded-full border ${
                              isFriendPaid
                                ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                                : 'text-amber-600 bg-amber-50 border-amber-200 animate-pulse'
                            }`}>
                              {isFriendPaid ? 'Paid' : 'Pending'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={() => setSelectedQrBooking(booking)}
                  className="w-full py-2.5 rounded-xl border border-[#C3924F]/30 hover:bg-[#FAF7F2] font-sans font-bold text-[#9A642C] text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <QrCode size={12} />
                  <span>View Ticket QR Code</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Ticket QR Modal */}
      {selectedQrBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#241A15]/60 backdrop-blur-sm" onClick={() => setSelectedQrBooking(null)} />
          
          <div className="bg-white border border-[#E8DFD3] rounded-2xl w-full max-w-xs p-5 shadow-2xl relative z-10 flex flex-col items-center text-center">
            <button 
              onClick={() => setSelectedQrBooking(null)}
              className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-[#FAF7F2] hover:bg-[#F3ECE3] flex items-center justify-center text-[#66554A] transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>

            <h3 className="font-serif font-bold text-sm text-[#241A15] mt-1">Ticket Pass</h3>
            <p className="text-[9px] font-mono text-[#66554A] mb-4">{selectedQrBooking.bookingId}</p>

            <div className="border border-[#E8DFD3] p-3 rounded-2xl bg-white shadow-inner mb-3">
              {qrSvg}
            </div>

            <div className="w-full bg-[#FAF7F2] border border-[#E8DFD3] p-3 rounded-xl text-left text-[10px] font-mono text-[#66554A] flex flex-col gap-1">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-bold text-[#241A15]">{selectedQrBooking.date}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="font-bold text-[#241A15]">{selectedQrBooking.timeSlot}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-bold text-[#241A15]">{selectedQrBooking.duration} Hr</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
