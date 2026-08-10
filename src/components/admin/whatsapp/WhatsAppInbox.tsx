'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConversationList, { FilterMode } from './ConversationList';
import MessageTimeline from './MessageTimeline';
import CustomerContext from './CustomerContext';
import { ArrowLeft, Info } from 'lucide-react';

interface WhatsAppInboxProps {
  actor: { uid: string; role: string; };
}

export default function WhatsAppInbox({ actor }: WhatsAppInboxProps) {
  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [convsError, setConvsError] = useState<string | null>(null);
  
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  // Mobile layout state
  const [showContextMobile, setShowContextMobile] = useState(false);

  // Refs for polling coordination
  const inFlightConvs = useRef(false);
  const inFlightDetails = useRef(false);
  const abortControllerConvs = useRef<AbortController | null>(null);
  const abortControllerDetails = useRef<AbortController | null>(null);

  const fetchConversations = useCallback(async (isInitial = false) => {
    if (document.hidden || inFlightConvs.current) return;
    inFlightConvs.current = true;

    if (abortControllerConvs.current) {
      abortControllerConvs.current.abort();
    }
    abortControllerConvs.current = new AbortController();

    try {
      if (isInitial) {
        setConvsLoading(true);
        setConvsError(null);
      }
      
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/operations/whatsapp/conversations?${params.toString()}`, {
        signal: abortControllerConvs.current.signal
      });
      
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();
      
      let filtered = data.conversations;
      if (filterMode === 'UNREAD') filtered = filtered.filter((c: any) => c.unread_count > 0);
      if (filterMode === 'ATTENTION') filtered = filtered.filter((c: any) => c.needs_attention);
      
      setConversations(filtered || []);
      setConvsError(null);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setConvsError('Unable to load conversations');
      }
    } finally {
      inFlightConvs.current = false;
      if (isInitial) setConvsLoading(false);
    }
  }, [filterMode, searchQuery]);

  const fetchDetails = useCallback(async (id: string, isInitial = false) => {
    if (document.hidden || inFlightDetails.current) return;
    inFlightDetails.current = true;

    if (abortControllerDetails.current) {
      abortControllerDetails.current.abort();
    }
    abortControllerDetails.current = new AbortController();

    try {
      if (isInitial) setMsgsLoading(true);

      const [convRes, msgsRes] = await Promise.all([
        fetch(`/api/operations/whatsapp/conversations/${id}`, { signal: abortControllerDetails.current.signal }),
        fetch(`/api/operations/whatsapp/conversations/${id}/messages`, { signal: abortControllerDetails.current.signal })
      ]);

      if (convRes.ok) {
        const convData = await convRes.json();
        setSelectedConv(convData.conversation);
      }
      if (msgsRes.ok) {
        const msgsData = await msgsRes.json();
        setMessages(msgsData.messages || []);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Failed to load conversation details', e);
      }
    } finally {
      inFlightDetails.current = false;
      if (isInitial) setMsgsLoading(false);
    }
  }, []);

  // Poll Conversations (5s)
  useEffect(() => {
    fetchConversations(true);
    const interval = setInterval(() => fetchConversations(false), 5000);
    return () => {
      clearInterval(interval);
      if (abortControllerConvs.current) abortControllerConvs.current.abort();
    };
  }, [fetchConversations]);

  // Poll Details (3-4s)
  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConv(null);
      setMessages([]);
      return;
    }
    
    if (abortControllerDetails.current) abortControllerDetails.current.abort();
    inFlightDetails.current = false;

    fetchDetails(selectedConversationId, true);
    
    const interval = setInterval(() => {
      fetchDetails(selectedConversationId, false);
    }, 4000);
    
    return () => {
      clearInterval(interval);
      if (abortControllerDetails.current) abortControllerDetails.current.abort();
    };
  }, [selectedConversationId, fetchDetails]);

  const handleSelect = (id: string) => {
    setSelectedConversationId(id);
    setShowContextMobile(false);
  };

  const handleBack = () => {
    setSelectedConversationId(null);
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] w-full bg-[#FAF7F2] rounded-xl border border-[#E8DFD3] overflow-hidden shadow-sm relative">
      
      {/* LEFT COLUMN: CONVERSATION LIST */}
      <div className={`md:w-1/3 md:min-w-[300px] md:max-w-[400px] border-r border-[#E8DFD3] bg-[#FFFDFC] flex flex-col h-full shrink-0 ${selectedConversationId ? 'hidden md:flex' : 'w-full flex'}`}>
        <ConversationList 
          conversations={conversations}
          loading={convsLoading}
          error={convsError}
          onRetry={() => fetchConversations(true)}
          onSelect={handleSelect} 
          selectedId={selectedConversationId}
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          onSearch={setSearchQuery}
        />
      </div>

      {/* CENTER COLUMN: TIMELINE */}
      <div className={`flex-1 flex flex-col bg-[#F9F6F0] h-full md:min-w-[400px] ${!selectedConversationId ? 'hidden md:flex' : 'w-full flex'}`}>
        {selectedConversationId ? (
          <div className="flex flex-col h-full relative">
            {/* Mobile Header Injection (Back + Context buttons) */}
            <div className="md:hidden flex items-center justify-between p-3 bg-[#FFFDFC] border-b border-[#E8DFD3]">
               <button onClick={handleBack} className="flex items-center gap-1 text-[#66554A] font-bold text-xs uppercase p-1">
                 <ArrowLeft size={14} /> Back
               </button>
               <div className="font-bold text-sm text-[#241A15] truncate max-w-[50%]">
                 {selectedConv?.customer_display_name || selectedConv?.phone_masked || 'Loading...'}
               </div>
               <button onClick={() => setShowContextMobile(true)} className="flex items-center gap-1 text-[#9A642C] font-bold text-xs uppercase p-1">
                 <Info size={14} /> Context
               </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
               <MessageTimeline 
                 conversationId={selectedConversationId} 
                 conversation={selectedConv}
                 messages={messages}
                 actor={actor}
                 loading={msgsLoading}
                 onRefresh={() => fetchDetails(selectedConversationId, false)}
               />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#66554A]/50 font-mono text-sm tracking-widest uppercase">
            Select a conversation to view
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: CONTEXT (Desktop / Tablet) */}
      <div className={`w-80 border-l border-[#E8DFD3] bg-[#FFFDFC] flex-col h-full shrink-0 hidden lg:flex`}>
        {selectedConversationId && selectedConv ? (
          <CustomerContext conversationId={selectedConversationId} conversation={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#66554A]/50 font-mono text-[10px] tracking-widest uppercase text-center px-4">
            No context loaded
          </div>
        )}
      </div>

      {/* MOBILE / TABLET CONTEXT DRAWER */}
      {showContextMobile && selectedConversationId && selectedConv && (
        <div className="absolute inset-0 z-50 flex lg:hidden">
           <div className="absolute inset-0 bg-black/20" onClick={() => setShowContextMobile(false)} />
           <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[80vw] bg-[#FFFDFC] shadow-2xl flex flex-col transform transition-transform border-l border-[#E8DFD3]">
              <div className="p-3 border-b border-[#E8DFD3] flex justify-between items-center bg-[#FAF7F2]">
                 <span className="text-xs font-bold uppercase tracking-widest text-[#66554A]">Customer Context</span>
                 <button onClick={() => setShowContextMobile(false)} className="text-[#66554A] font-bold p-1 flex items-center justify-center">X</button>
              </div>
              <div className="flex-1 overflow-hidden">
                 <CustomerContext conversationId={selectedConversationId} conversation={selectedConv} />
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
