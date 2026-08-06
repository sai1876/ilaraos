'use client';

import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Lock, 
  Unlock, 
  Save, 
  Trash2, 
  Check
} from 'lucide-react';
import { 
  streamCricketConfig, 
  saveCricketConfig, 
  streamBookings, 
  deleteBooking,
  streamLobbies,
  deleteLobby,
  updateBookingRemainingPayment
} from '@/lib/dbService';
import { CricketConfig } from '@/features/cricket/cricketService';
import { generateHourlyTimeSlots } from '@/features/cricket/timeSlots';
import { CricketBooking, SocialLobby } from '@/stores/useStore';

const TIME_SLOTS = generateHourlyTimeSlots();

export default function CricketManagement() {
  const [config, setConfig] = useState<CricketConfig>({
    basePrice: 800,
    openingTime: "06:00 AM",
    closingTime: "11:00 PM",
    blockedSlots: []
  });
  
  const [bookings, setBookings] = useState<CricketBooking[]>([]);
  const [lobbies, setLobbies] = useState<SocialLobby[]>([]);
  
  // Local edit states
  const [priceInput, setPriceInput] = useState(800);
  const [openTimeInput, setOpenTimeInput] = useState("06:00 AM");
  const [closeTimeInput, setCloseTimeInput] = useState("11:00 PM");
  
  // Slot blocking state
  const [blockDate, setBlockDate] = useState(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync settings
  useEffect(() => {
    const unsubConfig = streamCricketConfig((data) => {
      setConfig(data);
      setPriceInput(data.basePrice);
      setOpenTimeInput(data.openingTime);
      setCloseTimeInput(data.closingTime);
    });

    const unsubBookings = streamBookings((data) => {
      setBookings(data);
    });

    const unsubLobbies = streamLobbies((data) => {
      setLobbies(data);
    });

    return () => {
      unsubConfig();
      unsubBookings();
      unsubLobbies();
    };
  }, []);

  const handleDeleteLobby = async (lobbyId: string) => {
    if (confirm("Are you sure you want to delete this match lobby?")) {
      try {
        await deleteLobby(lobbyId);
      } catch (err) {
        console.error(err);
        alert("Failed to delete match lobby.");
      }
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveCricketConfig({
        basePrice: Number(priceInput),
        openingTime: openTimeInput,
        closingTime: closeTimeInput
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Failed to save configuration settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSlotBlock = async (slot: string) => {
    const dateKey = blockDate;
    const blockKey = `${dateKey}:${slot}`;
    
    let updatedBlocked = [...config.blockedSlots];
    if (updatedBlocked.includes(blockKey)) {
      updatedBlocked = updatedBlocked.filter(k => k !== blockKey);
    } else {
      updatedBlocked.push(blockKey);
    }

    try {
      await saveCricketConfig({ blockedSlots: updatedBlocked });
    } catch (err) {
      console.error(err);
      alert("Failed to update blocked slots.");
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (confirm("Are you sure you want to cancel and delete this cricket booking?")) {
      try {
        await deleteBooking(bookingId);
      } catch (err) {
        console.error(err);
        alert("Failed to delete booking.");
      }
    }
  };

  const handleTogglePaymentStatus = async (bookingId: string, currentStatus: string | undefined) => {
    try {
      const nextStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
      await updateBookingRemainingPayment(bookingId, nextStatus);
    } catch (err) {
      console.error("Failed to toggle payment status:", err);
      alert("Failed to update payment status.");
    }
  };

  // Generate 7 selectable date keys for slot blocking
  const getDates = () => {
    const list = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const current = new Date();
      current.setDate(today.getDate() + i);
      const isToday = i === 0;
      
      const label = isToday ? "Today" : `${days[current.getDay()]} (${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
      const key = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      list.push({ label, key });
    }
    return list;
  };
  const dates = getDates();

  return (
    <div className="w-full flex flex-col gap-6 font-sans">
      
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-[#E8DFD3] pb-4 shrink-0">
        <div className="p-2 bg-[#9A642C]/10 rounded-xl border border-[#9A642C]/20">
          <Trophy size={16} className="text-[#9A642C]" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#241A15] uppercase tracking-wider">Box Cricket Management</h2>
          <p className="text-[10px] font-mono text-[#66554A]/50 uppercase tracking-widest mt-0.5">Manage Slots, Block dates, and pricing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Config Settings Form */}
        <div className="xl:col-span-1 bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm self-start">
          <h3 className="text-xs font-bold text-[#241A15] uppercase tracking-wider mb-4">Turf General Settings</h3>
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Base Price (₹ / Hour)</span>
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(Number(e.target.value))}
                className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] focus:ring-1 focus:ring-[#9A642C]/10 transition-all font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Opening Time</span>
                <input
                  type="text"
                  placeholder="e.g. 06:00 AM"
                  value={openTimeInput}
                  onChange={(e) => setOpenTimeInput(e.target.value)}
                  className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] focus:ring-1 focus:ring-[#9A642C]/10 transition-all font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Closing Time</span>
                <input
                  type="text"
                  placeholder="e.g. 11:00 PM"
                  value={closeTimeInput}
                  onChange={(e) => setCloseTimeInput(e.target.value)}
                  className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] focus:ring-1 focus:ring-[#9A642C]/10 transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#9A642C] hover:bg-[#805020] text-white text-[10px] font-mono font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : saveSuccess ? (
                <>
                  <Check size={12} />
                  <span>Config Saved!</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Update Settings</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Slot Blocking Panel */}
        <div className="xl:col-span-2 bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold text-[#241A15] uppercase tracking-wider mb-2">Block or Close Time Slots</h3>
          <p className="text-[10px] text-[#66554A] mb-4">Click slots below to toggle blocking them (students will see them as unavailable/locked).</p>
          
          <div className="flex flex-col gap-4">
            {/* Select Date */}
            <div className="flex flex-wrap gap-2">
              {dates.map((d) => {
                const isActive = blockDate === d.key;
                return (
                  <button
                    key={d.key}
                    onClick={() => setBlockDate(d.key)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase transition-all ${
                      isActive
                        ? 'bg-[#9A642C]/10 border-[#9A642C]/30 text-[#9A642C]'
                        : 'bg-transparent border-[#E8DFD3] text-[#66554A] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    {d.label.split(' ')[0]}
                  </button>
                );
              })}
            </div>

            {/* Time Slot Toggles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIME_SLOTS.map((slot) => {
                const blockKey = `${blockDate}:${slot}`;
                const isBlocked = config.blockedSlots.includes(blockKey);
                
                return (
                  <button
                    key={slot}
                    onClick={() => toggleSlotBlock(slot)}
                    className={`py-2 px-1.5 rounded-lg border text-[10px] font-mono font-bold flex items-center justify-center transition-all ${
                      isBlocked
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1">
                        {isBlocked ? <Lock size={9} /> : <Unlock size={9} className="opacity-40" />}
                        <span className="text-[9px] font-bold">{slot.split(" - ")[0]}</span>
                      </div>
                      <span className="text-[8px] opacity-60 font-medium">to {slot.split(" - ")[1]}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Bookings Tracker Table */}
      <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm mt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-bold text-[#241A15] uppercase tracking-wider">Active Turf Bookings</h3>
          <span className="text-[9px] font-mono font-bold bg-[#FAF7F2] border border-[#E8DFD3] px-2.5 py-1 rounded-full text-[#66554A]">
            Total: {bookings.length} Bookings
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#66554A] font-mono">
            No active student bookings found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[#E8DFD3] text-[#66554A] font-bold">
                  <th className="py-2.5">ID</th>
                  <th className="py-2.5">Date & Time</th>
                  <th className="py-2.5">Duration</th>
                  <th className="py-2.5">Total price</th>
                  <th className="py-2.5">Advance (Paid)</th>
                  <th className="py-2.5">Remaining (Ground)</th>
                  <th className="py-2.5 text-center">Ground Payment</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const advancePaid = b.totalPaid || 300;
                  const remaining = Math.max(0, b.price - advancePaid);
                  const isVenuePaid = (b as any).remainingPaidStatus === 'paid';
                  
                  return (
                    <tr key={b.bookingId} className="border-b border-[#E8DFD3]/40 text-[#241A15] hover:bg-[#FAF7F2]">
                      <td className="py-2.5">{b.bookingId}</td>
                      <td className="py-2.5 font-sans font-bold">{b.date} @ {b.timeSlot}</td>
                      <td className="py-2.5">{b.duration} Hr</td>
                      <td className="py-2.5 font-bold">₹{b.price}</td>
                      <td className="py-2.5 text-emerald-600 font-bold">₹{advancePaid}</td>
                      <td className="py-2.5 text-zinc-500 font-bold">₹{remaining}</td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => handleTogglePaymentStatus(b.bookingId, (b as any).remainingPaidStatus)}
                          className={`px-2.5 py-1 rounded-full text-[9px] font-sans font-bold border cursor-pointer transition-all uppercase ${
                            isVenuePaid
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 animate-pulse'
                          }`}
                          title="Click to toggle venue payment status"
                        >
                          {isVenuePaid ? 'Collected' : 'Collect cash'}
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleDeleteBooking(b.bookingId)}
                          className="text-red-600 hover:text-red-800 p-1 transition-colors cursor-pointer"
                          title="Cancel Booking"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Match Lobbies Tracker Table */}
      <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm mt-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xs font-bold text-[#241A15] uppercase tracking-wider">Active Match Lobbies</h3>
            <p className="text-[10px] text-[#66554A] mt-0.5">Lobbies hosted by students (disabled on front-end, managed here).</p>
          </div>
          <span className="text-[9px] font-mono font-bold bg-[#FAF7F2] border border-[#E8DFD3] px-2.5 py-1 rounded-full text-[#66554A]">
            Total: {lobbies.length} Lobbies
          </span>
        </div>

        {lobbies.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#66554A] font-mono">
            No active student match lobbies found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[#E8DFD3] text-[#66554A] font-bold">
                  <th className="py-2.5">ID</th>
                  <th className="py-2.5">Title</th>
                  <th className="py-2.5">Host Name</th>
                  <th className="py-2.5">Date & Time</th>
                  <th className="py-2.5">Players</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lobbies.map((l) => (
                  <tr key={l.lobbyId} className="border-b border-[#E8DFD3]/40 text-[#241A15] hover:bg-[#FAF7F2]">
                    <td className="py-2.5">{l.lobbyId}</td>
                    <td className="py-2.5 font-sans font-bold">{l.title}</td>
                    <td className="py-2.5 font-sans">{l.hostName}</td>
                    <td className="py-2.5">{l.date} @ {l.time}</td>
                    <td className="py-2.5 font-sans text-xs">
                      {l.players.join(', ')} ({l.players.length}/{l.spotsTotal})
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteLobby(l.lobbyId)}
                        className="text-red-600 hover:text-red-800 p-1 transition-colors cursor-pointer"
                        title="Delete Lobby"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
