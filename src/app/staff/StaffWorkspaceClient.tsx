'use client';

import React, { useState } from 'react';
import { User, Calendar, Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useStore } from '@/store/useStore';

interface StaffWorkspaceClientProps {
  actor: {
    uid: string;
    role: string;
    staffId?: string;
    outletId?: string;
  };
}

export default function StaffWorkspaceClient({ actor }: StaffWorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'shift' | 'attendance' | 'schedule'>('profile');

  const handleLogout = async () => {
    try {
      useStore.getState().resetStore();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      await signOut(auth);
      window.location.href = '/login?staff=true';
    } catch (err) {
      console.error(err);
      window.location.href = '/login?staff=true';
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#241A15] font-sans p-6 flex flex-col">
      {/* Header */}
      <header className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-3xl p-6 flex justify-between items-center mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#9A642C]/10 border border-[#9A642C]/20 flex items-center justify-center text-[#9A642C] font-bold text-lg">
            <User size={24} />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#241A15]">Staff Workspace</h1>
            <p className="text-xs text-[#66554A] font-mono mt-0.5">
              Role: <span className="font-bold text-[#9A642C] uppercase">{actor.role}</span> | Outlet: {actor.outletId || 'main'}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl font-mono text-xs uppercase font-bold hover:bg-red-100 transition-colors cursor-pointer"
        >
          <LogOut size={16} /> Sign Out
        </button>
      </header>

      {/* Navigation tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#E8DFD3] pb-3">
        {[
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'shift', label: "Today's Shift", icon: Clock },
          { id: 'attendance', label: 'Attendance', icon: CheckCircle2 },
          { id: 'schedule', label: 'Schedule', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#9A642C] text-white shadow-sm'
                  : 'bg-[#FFFDFC] text-[#66554A] border border-[#E8DFD3] hover:bg-[#F3ECE3]'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      <main className="flex-1 bg-[#FFFDFC] border border-[#E8DFD3] rounded-3xl p-8 shadow-sm">
        {activeTab === 'profile' && (
          <div className="max-w-md flex flex-col gap-4">
            <h2 className="font-serif text-xl font-bold text-[#241A15]">Staff Profile</h2>
            <div className="space-y-3 font-mono text-sm">
              <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8DFD3]">
                <span className="text-[#66554A] text-xs uppercase block">Staff ID</span>
                <span className="font-bold text-[#241A15]">{actor.staffId || actor.uid}</span>
              </div>
              <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8DFD3]">
                <span className="text-[#66554A] text-xs uppercase block">Assigned Role</span>
                <span className="font-bold text-[#9A642C] uppercase">{actor.role}</span>
              </div>
              <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8DFD3]">
                <span className="text-[#66554A] text-xs uppercase block">Outlet Assignment</span>
                <span className="font-bold text-[#241A15]">{actor.outletId || 'main'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shift' && (
          <div className="max-w-md flex flex-col gap-4">
            <h2 className="font-serif text-xl font-bold text-[#241A15]">Today's Shift</h2>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 font-mono text-sm">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Active Shift</p>
                <p className="text-xs text-emerald-700 mt-0.5">Standard Day Shift (09:00 - 18:00)</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="max-w-md flex flex-col gap-4">
            <h2 className="font-serif text-xl font-bold text-[#241A15]">Attendance Log</h2>
            <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl font-mono text-xs space-y-2">
              <div className="flex justify-between border-b border-[#E8DFD3] pb-2">
                <span>Check-in:</span>
                <span className="font-bold text-[#2F6B54]">09:02 AM</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-bold text-[#2F6B54]">PRESENT</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="max-w-md flex flex-col gap-4">
            <h2 className="font-serif text-xl font-bold text-[#241A15]">Weekly Schedule</h2>
            <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl font-mono text-xs leading-relaxed text-[#66554A]">
              Schedule details are maintained by your outlet manager. Contact your supervisor for shift swap requests.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
