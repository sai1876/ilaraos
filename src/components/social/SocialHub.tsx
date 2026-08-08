'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Users, 
  Calendar, 
  Clock, 
  ChevronRight, 
  Target,
  Trophy
} from 'lucide-react';
import { fetchCricketAvailability } from '@/features/cricket/cricketService';

interface SocialHubProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

export default function SocialHub({ onNavigate }: SocialHubProps) {
  const [avail, setAvail] = useState<any>(null);

  // Fetch live cricket availability on mount
  useEffect(() => {
    fetchCricketAvailability().then((data) => {
      setAvail(data);
    }).catch(err => console.error('Failed to load cricket availability for SocialHub:', err));
  }, []);

  const firstAvailableSlot = avail?.slots?.find((s: any) => s.status === 'available');
  const nextSlotDisplay = firstAvailableSlot ? `Next: ${firstAvailableSlot.displayStart}` : 'Fully booked today';
  const openSlotsCount = avail?.slotsLeft ?? 0;
  const hourlyRateRupees = (avail?.config?.base_price_paise || 80000) / 100;

  return (
    <div className="w-full flex flex-col gap-6 pb-12 font-sans no-scrollbar">
      
      {/* Hero Headline Section */}
      <section className="flex flex-col gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#9A642C] bg-[#FFF8EE] border border-[#C3924F]/30 px-2.5 py-0.5 rounded-full self-start">
          Campus Social Club
        </span>
        <h2 className="text-xl md:text-2xl font-bold font-serif text-[#241A15] leading-tight">
          Eat together. Play together.<br />
          <span className="text-[#9A642C]">Build real connections.</span>
        </h2>
        
        {/* Live Status Banner */}
        <div className="bg-white border border-[#E8DFD3] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm mt-2">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <div>
              <p className="font-sans font-bold text-xs text-[#241A15]">Box Cricket Turf: Open</p>
              <p className="font-sans text-[10px] text-[#66554A]">
                {firstAvailableSlot ? `Next slot available today at ${firstAvailableSlot.displayStart}` : 'Fully booked today'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-[#FAF7F2] border border-[#E8DFD3] rounded-full px-3 py-1 self-start md:self-auto">
            <Users size={12} className="text-[#9A642C]" />
            <p className="text-[10px] font-mono font-bold text-[#66554A]">{openSlotsCount} slots open today</p>
          </div>
        </div>
      </section>

      {/* Bento Grid CTAs */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Book Cricket Hero Card */}
        <div className="md:col-span-8 bg-white rounded-2xl border border-[#E8DFD3] overflow-hidden shadow-sm flex flex-col h-full group hover:border-[#C3924F]/50 transition-all duration-300">
          <div className="relative h-44 md:h-56 w-full overflow-hidden bg-zinc-950">
            <div className="absolute inset-0 bg-black/10 z-10" />
            <img 
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-75" 
              alt="Ilara Box Cricket turf"
              src="/images/cafe_hero.jpg"
              onError={(e) => {
                e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#9A642C"/><text x="50%" y="50%" fill="white" font-size="36" font-weight="bold" text-anchor="middle">Ilara Cricket Turf</text></svg>')}`;
              }}
            />
            <div className="absolute top-3 left-3 z-20 bg-[#9A642C] text-white font-mono text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
              <Target size={10} />
              <span>Premium Indoor Turf</span>
            </div>
            <div className="absolute bottom-3 right-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-mono font-black text-[#241A15] shadow-md border border-[#E8DFD3]">
              ★ 4.9 Rating
            </div>
          </div>
          <div className="p-5 flex-grow flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-[#241A15] font-serif mb-1">Book Box Cricket</h3>
              <p className="text-xs text-[#66554A] mb-4">
                Host matches, schedule friendly tournaments, or hit the nets with premium quality bats and turf lighting.
              </p>
              
              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[#66554A] mb-4">
                <div className="flex items-center gap-1 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                  <Clock size={11} className="text-[#C3924F]" />
                  <span>{nextSlotDisplay}</span>
                </div>
                <div className="flex items-center gap-1 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                  <Calendar size={11} className="text-[#C3924F]" />
                  <span>{openSlotsCount} slots open</span>
                </div>
                <div className="flex items-center gap-1 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                  <Trophy size={11} className="text-[#C3924F]" />
                  <span>₹{hourlyRateRupees}/hr</span>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => onNavigate('book')}
              className="w-full md:w-auto bg-[#9A642C] hover:bg-[#805120] text-white font-mono text-[10px] font-bold uppercase tracking-widest py-3 px-6 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 self-start cursor-pointer"
            >
              <span>View Slots</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* My Activities Sidebar Card */}
        <div className="md:col-span-4 bg-[#FFFDFC] rounded-2xl border border-[#E8DFD3] p-5 flex flex-col justify-between h-full hover:border-[#C3924F]/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-[#E8DFD3] pb-3">
              <h3 className="text-sm font-bold text-[#241A15] font-serif">Quick Actions</h3>
              <Sparkles size={14} className="text-[#C3924F]" />
            </div>
            
            <p className="text-[11px] text-[#66554A] mb-4 leading-relaxed">
              Track your upcoming matches, split payment links, and see stats from your completed box cricket matches.
            </p>

            <div className="flex flex-col gap-2.5">
              <button 
                onClick={() => onNavigate('activities')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] hover:bg-[#F3ECE3] border border-[#E8DFD3] text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-[#E8DFD3] flex items-center justify-center text-sm shadow-sm">
                    📅
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-[11px] text-[#241A15]">My Bookings</h4>
                    <p className="text-[9px] text-[#66554A]">Check schedule & QR codes</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[#66554A] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button 
                onClick={() => onNavigate('activities')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] hover:bg-[#F3ECE3] border border-[#E8DFD3] text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-[#E8DFD3] flex items-center justify-center text-sm shadow-sm">
                    💸
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-[11px] text-[#241A15]">Split Bills</h4>
                    <p className="text-[9px] text-[#66554A]">Track contributions</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[#66554A] group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="mt-6 bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD3] text-center">
            <h4 className="font-mono text-[9px] font-black uppercase text-[#9A642C] mb-0.5">Student Offer</h4>
            <p className="text-[10px] text-[#66554A] font-semibold">15% off weekday morning slots</p>
          </div>
        </div>

      </section>

    </div>
  );
}
