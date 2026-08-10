'use client';

import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, Bot, User, RefreshCw } from 'lucide-react';

export type FilterMode = 'ALL' | 'UNREAD' | 'ATTENTION';

interface ConversationListProps {
  conversations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  onSearch: (query: string) => void;
}

export default function ConversationList({ 
  conversations, 
  selectedId, 
  onSelect,
  loading,
  error,
  onRetry,
  filterMode,
  onFilterChange,
  onSearch
}: ConversationListProps) {
  const [searchInput, setSearchInput] = useState('');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput, onSearch]);

  return (
    <div className="flex flex-col h-full">
      {/* Header & Filters */}
      <div className="p-4 border-b border-[#E8DFD3] shrink-0">
        <div className="flex gap-2 bg-[#F5F1EA] p-1 rounded-lg mb-3">
          {(['ALL', 'UNREAD', 'ATTENTION'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`flex-1 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all ${filterMode === f ? 'bg-[#FFFDFC] text-[#9A642C] shadow-sm' : 'text-[#66554A]/60 hover:text-[#241A15]'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66554A]/50" size={14} />
          <input 
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-[#FAF7F2] border border-[#E8DFD3] rounded-lg pl-9 pr-3 py-2 text-xs text-[#241A15] focus:outline-none focus:border-[#9A642C]"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto theme-scrollbar p-2">
        {loading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-[#66554A]">
            <div className="w-5 h-5 rounded-full border-2 border-[#9A642C] border-t-transparent animate-spin mb-2" />
            <span className="text-xs font-mono uppercase">Loading...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle size={24} className="text-rose-500 mb-2" />
            <p className="text-xs text-rose-600 font-bold mb-3">{error}</p>
            <button onClick={onRetry} className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-100 transition-colors">
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#66554A]/50">
            <span className="text-xs font-mono uppercase tracking-widest">No conversations yet</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map(conv => {
              const isSelected = selectedId === conv.id;
              const date = new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${isSelected ? 'bg-[#9A642C]/10 border-[#9A642C]/20 shadow-sm' : 'bg-transparent border-transparent hover:bg-[#FAF7F2]'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm" style={{ color: isSelected ? '#9A642C' : '#241A15' }}>
                        {conv.customer_display_name || conv.phone_masked}
                      </span>
                      {conv.control_mode === 'HUMAN' ? (
                        <span title="Human Mode"><User size={12} className="text-blue-500" /></span>
                      ) : (
                        <span title="AI Mode"><Bot size={12} className="text-emerald-500" /></span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#66554A]/60 font-mono">{date}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className={`text-xs truncate max-w-[80%] ${conv.unread_count > 0 && !isSelected ? 'font-bold text-[#241A15]' : 'text-[#66554A]'}`}>
                      {conv.last_message_preview || 'No messages'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="bg-[#9A642C] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>

                  {conv.needs_attention && (
                    <div className="flex items-center gap-1 mt-2 text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md text-[9px] uppercase font-bold tracking-wider inline-flex">
                      <AlertCircle size={10} />
                      {conv.attention_reason || 'Needs Attention'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
