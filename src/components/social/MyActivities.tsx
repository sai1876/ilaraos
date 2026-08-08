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
  CreditCard,
  RefreshCw,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { 
  fetchMyCricketBookings, 
  cancelCricketBooking 
} from '@/features/cricket/cricketService';

interface MyActivitiesProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function MyActivities({ onNavigate }: MyActivitiesProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [selectedQrBooking, setSelectedQrBooking] = useState<any | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [bookingsData, setBookingsData] = useState<{
    upcoming: any[];
    past: any[];
    cancelled: any[];
  }>({
    upcoming: [],
    past: [],
    cancelled: [],
  });

  const loadBookings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchMyCricketBookings();
      setBookingsData({
        upcoming: data.upcoming || [],
        past: data.past || [],
        cancelled: data.cancelled || [],
      });
    } catch (err: any) {
      console.error('Failed to load user cricket bookings:', err);
      setErrorMsg(err.message || 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking session?')) return;
    setCancellingId(bookingId);
    try {
      await cancelCricketBooking(bookingId, 'User requested cancellation');
      await loadBookings();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  };

  const currentList = bookingsData[activeTab] || [];

  return (
    <div className="w-full flex flex-col gap-5 pb-20 relative font-sans no-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('hub')}
            className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#241A15] hover:bg-[#FAF7F2] active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-base font-bold font-serif text-[#241A15]">My Activities</h2>
        </div>
        <button
          onClick={() => loadBookings()}
          className="w-8 h-8 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center text-[#66554A] hover:bg-[#FAF7F2] transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-[#FAF7F2] border border-[#E8DFD3] p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'upcoming'
              ? 'bg-[#9A642C] text-white shadow-sm'
              : 'text-[#66554A] hover:text-[#241A15]'
          }`}
        >
          Upcoming ({bookingsData.upcoming.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'past'
              ? 'bg-[#9A642C] text-white shadow-sm'
              : 'text-[#66554A] hover:text-[#241A15]'
          }`}
        >
          Past ({bookingsData.past.length})
        </button>
        <button
          onClick={() => setActiveTab('cancelled')}
          className={`flex-1 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'cancelled'
              ? 'bg-[#9A642C] text-white shadow-sm'
              : 'text-[#66554A] hover:text-[#241A15]'
          }`}
        >
          Cancelled ({bookingsData.cancelled.length})
        </button>
      </div>

      {/* Bookings List */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#66554A]">
            <RefreshCw size={24} className="animate-spin text-[#9A642C]" />
            <span className="text-xs font-mono">Loading your bookings…</span>
          </div>
        ) : currentList.length === 0 ? (
          <div className="bg-white border border-[#E8DFD3] rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2.5">
            <div className="text-2xl">📭</div>
            <h4 className="font-serif font-bold text-xs text-[#241A15]">No {activeTab} bookings</h4>
            <p className="text-[10px] text-[#66554A] max-w-xs leading-normal">
              {activeTab === 'upcoming' ? "You don't have any upcoming cricket sessions." : "No past sessions found."}
            </p>
            {activeTab === 'upcoming' && (
              <button 
                onClick={() => onNavigate('book')}
                className="mt-1.5 bg-[#9A642C] text-white px-4 py-2 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-[#805120] transition-colors cursor-pointer"
              >
                Book Cricket Slot
              </button>
            )}
          </div>
        ) : (
          currentList.map((booking) => {
            const isUpcoming = activeTab === 'upcoming';
            const isCancelled = booking.status === 'cancelled';
            const totalRupees = (booking.total_paise || 0) / 100;
            const paidRupees = (booking.paid_paise || 0) / 100;

            return (
              <div 
                key={booking.booking_id || booking.booking_reference}
                className="bg-white border border-[#E8DFD3] rounded-2xl p-4 shadow-sm flex flex-col gap-3.5"
              >
                {/* Title */}
                <div className="flex justify-between items-start pb-2 border-b border-[#E8DFD3]/60">
                  <div>
                    <h4 className="font-sans font-bold text-xs text-[#241A15]">Ilara Turf 1 (Main Pitch)</h4>
                    <span className="text-[9px] font-mono text-[#66554A]">{booking.booking_reference || booking.booking_id}</span>
                  </div>
                  <span className={`text-[8px] font-mono font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                    isCancelled
                      ? 'text-red-600 bg-red-50 border-red-200'
                      : isUpcoming
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                      : 'text-zinc-600 bg-zinc-50 border-zinc-200'
                  }`}>
                    {isCancelled ? <XCircle size={10} /> : <CheckCircle2 size={10} />}
                    <span>{booking.status}</span>
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-[#66554A] font-mono">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="text-[#C3924F]" />
                    <span>{booking.business_date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} className="text-[#C3924F]" />
                    <span>{booking.display_time || 'Session'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-[#C3924F]" />
                    <span>Asia/Kolkata</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={11} className="text-[#C3924F]" />
                    <span>{booking.payment_status}</span>
                  </div>
                </div>

                {/* Payment Breakdown */}
                <div className="bg-[#FAF7F2] rounded-xl p-3 border border-[#E8DFD3]/60 flex flex-col gap-1.5 text-[10px] font-mono">
                  <div className="flex justify-between text-[#66554A]">
                    <span>Total Session Cost:</span>
                    <span className="font-bold text-[#241A15]">₹{totalRupees}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Paid Amount:</span>
                    <span className="font-bold">₹{paidRupees}</span>
                  </div>
                  {totalRupees - paidRupees > 0 && (
                    <div className="flex justify-between items-center text-amber-700 pt-0.5 border-t border-[#E8DFD3]/40 font-bold">
                      <span>Balance at Venue Register:</span>
                      <span>₹{totalRupees - paidRupees}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {!isCancelled && (
                    <button
                      onClick={() => setSelectedQrBooking(booking)}
                      className="flex-1 py-2.5 rounded-xl border border-[#C3924F]/30 hover:bg-[#FAF7F2] font-sans font-bold text-[#9A642C] text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <QrCode size={12} />
                      <span>Ticket Pass</span>
                    </button>
                  )}

                  {isUpcoming && (
                    <button
                      disabled={cancellingId === booking.booking_id}
                      onClick={() => handleCancelBooking(booking.booking_id)}
                      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-sans font-bold text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {cancellingId === booking.booking_id ? 'Cancelling…' : 'Cancel Session'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Signed QR Ticket Pass Modal */}
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

            <h3 className="font-serif font-bold text-sm text-[#241A15] mt-1">Official Ticket Pass</h3>
            <p className="text-[9px] font-mono text-[#66554A] mb-3">{selectedQrBooking.booking_reference}</p>

            <div className="border border-[#E8DFD3] p-3 rounded-2xl bg-white shadow-inner mb-3 flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                  `/api/cricket/tickets/verify?token=${selectedQrBooking.ticket_token}`
                )}`}
                alt="Signed QR Verification Ticket"
                className="w-36 h-36"
              />
            </div>

            <div className="w-full bg-[#FAF7F2] border border-[#E8DFD3] p-3 rounded-xl text-left text-[10px] font-mono text-[#66554A] flex flex-col gap-1">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-bold text-[#241A15]">{selectedQrBooking.business_date}</span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="font-bold text-[#241A15]">{selectedQrBooking.display_time}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment:</span>
                <span className="font-bold text-emerald-700">{selectedQrBooking.payment_status}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
