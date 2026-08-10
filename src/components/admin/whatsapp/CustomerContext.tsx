'use client';

import React from 'react';
import { Phone, User, Globe, FileText, Activity } from 'lucide-react';

interface CustomerContextProps {
  conversationId: string;
  conversation: any;
}

export default function CustomerContext({ conversationId, conversation: conv }: CustomerContextProps) {
  if (!conv) return <div className="p-4 text-center text-xs text-[#66554A]">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-[#FFFDFC] overflow-y-auto theme-scrollbar p-5 space-y-6">
      {/* Profile */}
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-[#F5F1EA] rounded-full flex items-center justify-center border-2 border-[#E8DFD3] mb-3">
          <User size={24} className="text-[#9A642C]" />
        </div>
        <h3 className="font-bold text-[#241A15] text-lg leading-tight">{conv.customer_display_name || 'Unknown Guest'}</h3>
        <p className="text-sm font-mono text-[#66554A] flex items-center gap-1 mt-1">
          <Phone size={12} /> {conv.phone_masked}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD3]">
          <span className="text-[9px] uppercase tracking-widest font-bold text-[#66554A]">Language</span>
          <div className="flex items-center gap-1.5 mt-1 text-sm font-bold text-[#241A15]">
            <Globe size={14} className="text-[#9A642C]" />
            {conv.preferred_language?.toUpperCase() || 'EN'}
          </div>
        </div>
        <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD3]">
          <span className="text-[9px] uppercase tracking-widest font-bold text-[#66554A]">Status</span>
          <div className="flex items-center gap-1.5 mt-1 text-sm font-bold text-[#241A15]">
            <Activity size={14} className="text-[#9A642C]" />
            {conv.status || 'OPEN'}
          </div>
        </div>
      </div>

      {/* Internal Notes */}
      <div>
        <h4 className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-[#66554A] mb-2 border-b border-[#E8DFD3] pb-1">
          <FileText size={12} /> Internal Tags & Notes
        </h4>
        <div className="flex flex-wrap gap-1 mb-3">
          {(conv.tags || []).map((t: string) => (
             <span key={t} className="bg-[#9A642C]/10 text-[#9A642C] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
               {t}
             </span>
          ))}
          <button className="bg-[#F5F1EA] text-[#66554A] hover:text-[#241A15] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-[#E8DFD3] border-dashed transition-colors">
            + Add Tag
          </button>
        </div>
        <textarea
          placeholder="Add an internal note..."
          className="w-full bg-[#FAF7F2] border border-[#E8DFD3] rounded-lg p-3 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C] min-h-[80px]"
        />
      </div>

    </div>
  );
}
