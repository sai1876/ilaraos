'use client';

import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Lock, 
  Unlock, 
  Save, 
  Check,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { 
  fetchCricketAvailability,
  updateCricketAdminConfig,
  blockCricketSlotAdmin,
  unblockCricketSlotAdmin,
  CricketAvailabilityResponse
} from '@/features/cricket/cricketService';
import { getBookingHorizonDates } from '@/features/cricket/cricketTime';

export default function CricketManagement() {
  const horizonDates = getBookingHorizonDates(7);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const selectedDate = horizonDates[selectedDateIndex];

  const [availData, setAvailData] = useState<CricketAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form edit state
  const [priceInput, setPriceInput] = useState(800);
  const [openTimeInput, setOpenTimeInput] = useState('06:00');
  const [closeTimeInput, setCloseTimeInput] = useState('23:00');
  const [leadTimeInput, setLeadTimeInput] = useState(15);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchCricketAvailability(selectedDate.dateStr);
      setAvailData(data);
      if (data.config) {
        setPriceInput((data.config.base_price_paise || 80000) / 100);
        setOpenTimeInput(data.config.opening_time || '06:00');
        setCloseTimeInput(data.config.closing_time || '23:00');
        setLeadTimeInput(data.config.minimum_lead_minutes || 15);
      }
    } catch (err: any) {
      console.error('Failed to load management availability data:', err);
      setErrorMsg(err.message || 'Failed to fetch venue state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDateIndex]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    try {
      await updateCricketAdminConfig({
        opening_time: openTimeInput,
        closing_time: closeTimeInput,
        minimum_lead_minutes: Number(leadTimeInput),
        base_price_paise: Math.round(Number(priceInput) * 100),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadData();
    } catch (err: any) {
      console.error('Failed to update config:', err);
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlock = async (slotKey: string, currentStatus: string) => {
    try {
      if (currentStatus === 'blocked') {
        await unblockCricketSlotAdmin(slotKey);
      } else {
        await blockCricketSlotAdmin(slotKey, selectedDate.dateStr, 'Management blocked');
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update slot block');
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 font-sans no-scrollbar">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#9A642C]/10 rounded-xl border border-[#9A642C]/20">
            <Trophy size={16} className="text-[#9A642C]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#241A15] uppercase tracking-wider">Box Cricket Venue Management</h2>
            <p className="text-[10px] font-mono text-[#66554A]/70 uppercase tracking-widest mt-0.5">Asia/Kolkata Server Protected Mutations</p>
          </div>
        </div>
        <button
          onClick={() => loadData()}
          className="p-2 rounded-xl bg-[#FFFDFC] border border-[#E8DFD3] text-[#66554A] hover:bg-[#FAF7F2]"
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
                className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] transition-all font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Opening (HH:mm)</span>
                <input
                  type="text"
                  placeholder="06:00"
                  value={openTimeInput}
                  onChange={(e) => setOpenTimeInput(e.target.value)}
                  className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] transition-all font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Closing (HH:mm)</span>
                <input
                  type="text"
                  placeholder="23:00"
                  value={closeTimeInput}
                  onChange={(e) => setCloseTimeInput(e.target.value)}
                  className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] transition-all font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">Min Lead Time (Minutes)</span>
              <input
                type="number"
                value={leadTimeInput}
                onChange={(e) => setLeadTimeInput(Number(e.target.value))}
                className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#9A642C] hover:bg-[#805020] text-white text-[10px] font-mono font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving via Protected API…</span>
              ) : saveSuccess ? (
                <>
                  <Check size={12} />
                  <span>Config Updated!</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Update Operating Hours</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Slot Blocking Panel */}
        <div className="xl:col-span-2 bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold text-[#241A15] uppercase tracking-wider mb-2">Slot Management Grid</h3>
          <p className="text-[10px] text-[#66554A] mb-4">Click any slot to toggle individual slot block documents.</p>

          <div className="flex flex-col gap-4">
            {/* Select Date */}
            <div className="flex flex-wrap gap-2">
              {horizonDates.map((d, idx) => {
                const isActive = selectedDateIndex === idx;
                return (
                  <button
                    key={d.dateStr}
                    onClick={() => setSelectedDateIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase transition-all ${
                      isActive
                        ? 'bg-[#9A642C] border-[#9A642C] text-white'
                        : 'bg-transparent border-[#E8DFD3] text-[#66554A] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* Time Slot Toggles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {availData?.slots?.map((slot) => {
                const isBlocked = slot.status === 'blocked';
                const isPast = slot.status === 'past';
                const isBooked = slot.status === 'booked';

                return (
                  <button
                    key={slot.slotKey}
                    onClick={() => handleToggleBlock(slot.slotKey, slot.status)}
                    className={`py-2 px-2 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center justify-center transition-all ${
                      isBlocked
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : isBooked
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : isPast
                        ? 'bg-zinc-100 border-zinc-200 text-zinc-400'
                        : 'bg-white border-[#E8DFD3] text-[#241A15] hover:border-[#C3924F]'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {isBlocked ? <Lock size={10} /> : <Unlock size={10} className="opacity-40" />}
                      <span>{slot.displayStart}</span>
                    </div>
                    <span className="text-[8px] uppercase tracking-wider opacity-70 mt-0.5">
                      {slot.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
