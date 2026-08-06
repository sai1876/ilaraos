'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Plus, 
  Check, 
  ChevronRight, 
  UserPlus, 
  X,
  Target,
  Trophy
} from 'lucide-react';
import { useStore, SocialLobby } from '@/stores/useStore';
import { streamLobbies, addLobby, joinLobby } from '@/lib/dbService';

interface SocialHubProps {
  onNavigate: (view: 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities') => void;
}

function SocialHubSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-6" aria-label="Loading social activities">
      <section className="space-y-3">
        <div className="h-5 w-32 rounded-full bg-[#E8DFD3]" />
        <div className="h-8 w-3/4 rounded-lg bg-[#E8DFD3]" />
        <div className="h-20 rounded-2xl border border-[#E8DFD3] bg-white" />
      </section>
      <section className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <div className="overflow-hidden rounded-2xl border border-[#E8DFD3] bg-white md:col-span-8">
          <div className="h-44 bg-[#E8DFD3] md:h-56" />
          <div className="space-y-3 p-5"><div className="h-6 w-44 rounded bg-[#E8DFD3]" /><div className="h-4 w-full rounded bg-[#F3ECE3]" /><div className="h-10 w-32 rounded-lg bg-[#E8DFD3]" /></div>
        </div>
        <div className="space-y-4 rounded-2xl border border-[#E8DFD3] bg-white p-5 md:col-span-4">
          <div className="h-6 w-32 rounded bg-[#E8DFD3]" /><div className="h-16 rounded-xl bg-[#F3ECE3]" /><div className="h-16 rounded-xl bg-[#F3ECE3]" />
        </div>
      </section>
    </div>
  );
}

export default function SocialHub({ onNavigate }: SocialHubProps) {
  const { userProfile } = useStore();
  const [lobbies, setLobbies] = useState<SocialLobby[]>([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(true);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  
  // Host Modal Form state
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDate, setMatchDate] = useState('Tomorrow');
  const [matchTime, setMatchTime] = useState('06:00 PM');
  const [spotsCount, setSpotsCount] = useState(10);

  // Sync lobbies from Firebase in real-time
  useEffect(() => {
    const unsub = streamLobbies((data) => {
      setLobbies(data);
      setLobbiesLoading(false);
    });
    return () => unsub();
  }, []);

  const handleJoinLobby = async (lobbyId: string) => {
    const playerName = userProfile?.name || userProfile?.student_email?.split('@')[0] || 'Anonymous Student';
    try {
      await joinLobby(lobbyId, playerName);
    } catch (err) {
      console.error("Failed to join lobby:", err);
    }
  };

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchTitle.trim()) return;

    const hostName = userProfile?.name || userProfile?.student_email?.split('@')[0] || 'Anonymous Student';
    
    const newLobby: SocialLobby = {
      lobbyId: `lobby-${Date.now()}`,
      title: matchTitle,
      hostName,
      date: matchDate,
      time: matchTime,
      spotsTotal: Number(spotsCount),
      players: [hostName]
    };

    try {
      await addLobby(newLobby);
      setIsHostModalOpen(false);
      // Reset form
      setMatchTitle('');
      setMatchDate('Tomorrow');
      setMatchTime('06:00 PM');
      setSpotsCount(10);
    } catch (err) {
      console.error("Failed to create lobby:", err);
      alert("Failed to create match lobby.");
    }
  };

  const currentUserName = userProfile?.name || userProfile?.student_email?.split('@')[0] || 'Anonymous Student';

  if (lobbiesLoading) return <SocialHubSkeleton />;

  return (
    <div className="w-full flex flex-col gap-6 pb-12">
      
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
              <p className="font-sans text-[10px] text-[#66554A]">Next slot available today at 4:00 PM</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-[#FAF7F2] border border-[#E8DFD3] rounded-full px-3 py-1 self-start md:self-auto">
            <Users size={12} className="text-[#9A642C]" />
            <p className="text-[10px] font-mono font-bold text-[#66554A]">14 students looking for players</p>
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
              ★ 4.8 Rating
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
                  <span>Next: 4:00 PM</span>
                </div>
                <div className="flex items-center gap-1 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                  <Calendar size={11} className="text-[#C3924F]" />
                  <span>8 slots open</span>
                </div>
                <div className="flex items-center gap-1 bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                  <Trophy size={11} className="text-[#C3924F]" />
                  <span>₹800/hr</span>
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

      {/* Match Finder Lobbies Section - Hidden for now */}
      {false && (
        <>
          <section className="flex flex-col gap-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold font-serif text-[#241A15]">Active Lobbies</h3>
                <p className="text-[11px] text-[#66554A] mt-0.5">Join an existing squad or host a new match to get players.</p>
              </div>
              
              <button 
                onClick={() => setIsHostModalOpen(true)}
                className="flex items-center gap-1 bg-[#FAF7F2] hover:bg-[#F3ECE3] border border-[#C3924F] px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase text-[#9A642C] transition-colors shadow-sm cursor-pointer"
              >
                <Plus size={12} />
                <span>Host Match</span>
              </button>
            </div>

            {/* Lobbies List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {lobbies.map((lobby) => {
                const isFull = lobby.players.length >= lobby.spotsTotal;
                const hasJoined = lobby.players.includes(currentUserName);
                
                return (
                  <div 
                    key={lobby.lobbyId}
                    className="bg-white border border-[#E8DFD3] rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 ${hasJoined ? 'bg-[#9A642C]' : isFull ? 'bg-zinc-300' : 'bg-[#C3924F]'}`} />

                    <div className="pt-1">
                      <div className="flex justify-between items-start gap-1.5 mb-2.5">
                        <h4 className="font-sans font-bold text-xs text-[#241A15]">{lobby.title}</h4>
                        <span className={`text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded-full ${
                          hasJoined 
                            ? 'bg-[#9A642C]/10 text-[#9A642C] border border-[#9A642C]/20'
                            : isFull 
                              ? 'bg-zinc-100 text-zinc-500' 
                              : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {hasJoined ? 'Joined' : isFull ? 'Full' : 'Open'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 text-[10px] text-[#66554A] font-mono mb-3">
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className="text-[#C3924F]" />
                          <span>{lobby.date}, {lobby.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin size={11} className="text-[#C3924F]" />
                          <span>Ilara Turf</span>
                        </div>
                      </div>

                      {/* Player spots left status bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-[9px] font-mono font-bold text-[#66554A] mb-1">
                          <span>Players ({lobby.players.length}/{lobby.spotsTotal})</span>
                          <span>{lobby.spotsTotal - lobby.players.length} open</span>
                        </div>
                        <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${hasJoined ? 'bg-[#9A642C]' : 'bg-[#C3924F]'}`}
                            style={{ width: `${(lobby.players.length / lobby.spotsTotal) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Joined Player Initial Bubbles */}
                      <div className="flex flex-wrap items-center gap-1 mb-4">
                        {lobby.players.map((p, idx) => (
                          <div 
                            key={idx}
                            className="w-6 h-6 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] flex items-center justify-center text-[8px] font-mono font-bold text-[#66554A] select-none"
                            title={p}
                          >
                            {p.substring(0, 2).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleJoinLobby(lobby.lobbyId)}
                      disabled={isFull || hasJoined}
                      className={`w-full py-2.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border cursor-pointer ${
                        hasJoined
                          ? 'bg-transparent border-[#9A642C] text-[#9A642C] cursor-default'
                          : isFull
                            ? 'bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed'
                            : 'bg-[#9A642C] hover:bg-[#805120] border-[#9A642C] text-white active:scale-95'
                      }`}
                    >
                      {hasJoined ? (
                        <>
                          <Check size={12} />
                          <span>Joined</span>
                        </>
                      ) : isFull ? (
                        <span>Full</span>
                      ) : (
                        <>
                          <UserPlus size={12} />
                          <span>Join Match</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Host Match Modal Dialog */}
          <AnimatePresence>
            {isHostModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsHostModalOpen(false)}
                  className="absolute inset-0 bg-[#241A15]/60 backdrop-blur-sm"
                />
                
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white border border-[#E8DFD3] rounded-2xl w-full max-w-sm p-5 shadow-2xl relative z-10 overflow-hidden"
                >
                  <div className="flex justify-between items-center border-b border-[#E8DFD3] pb-3 mb-4">
                    <h3 className="text-sm font-bold font-serif text-[#241A15]">Host a Match</h3>
                    <button 
                      onClick={() => setIsHostModalOpen(false)}
                      className="w-7 h-7 rounded-full bg-[#FAF7F2] hover:bg-[#F3ECE3] flex items-center justify-center text-[#66554A] transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <form onSubmit={handleCreateLobby} className="flex flex-col gap-3.5">
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Match Title</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. 5v5 Friendly Match" 
                        value={matchTitle}
                        onChange={(e) => setMatchTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] focus:border-[#9A642C] focus:ring-0 text-xs outline-none text-[#241A15]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Date</label>
                        <select
                          value={matchDate}
                          onChange={(e) => setMatchDate(e.target.value)}
                          className="w-full px-2 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] focus:border-[#9A642C] focus:ring-0 text-xs outline-none text-[#241A15]"
                        >
                          <option value="Today">Today</option>
                          <option value="Tomorrow">Tomorrow</option>
                          <option value="Thursday">Thursday</option>
                          <option value="Friday">Friday</option>
                          <option value="Saturday">Saturday</option>
                          <option value="Sunday">Sunday</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Time</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. 06:00 PM" 
                          value={matchTime}
                          onChange={(e) => setMatchTime(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] focus:border-[#9A642C] focus:ring-0 text-xs outline-none text-[#241A15]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#66554A]">Max Players</label>
                      <input 
                        type="number" 
                        required
                        min={2}
                        max={20}
                        value={spotsCount}
                        onChange={(e) => setSpotsCount(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] focus:border-[#9A642C] focus:ring-0 text-xs outline-none text-[#241A15]"
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-[#9A642C] hover:bg-[#805120] text-white py-3 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest mt-2 transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      Create Match Lobby
                    </button>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}

    </div>
  );
}
