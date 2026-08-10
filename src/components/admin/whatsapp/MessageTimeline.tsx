'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Check, CheckCheck } from 'lucide-react';

interface MessageTimelineProps {
  conversationId: string;
  conversation: any;
  messages: any[];
  actor: any;
  loading: boolean;
  onRefresh: () => void;
}

export default function MessageTimeline({ 
  conversationId, 
  conversation: conv, 
  messages, 
  actor,
  loading,
  onRefresh 
}: MessageTimelineProps) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/operations/whatsapp/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() })
      });
      if (res.ok) {
        setReplyText('');
        onRefresh();
      } else {
        alert((await res.json()).error);
      }
    } catch (e: any) {
      alert('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const toggleTakeover = async () => {
    const action = conv?.control_mode === 'HUMAN' ? 'RETURN_TO_AI' : 'TAKE_OVER';
    try {
      await fetch(`/api/operations/whatsapp/conversations/${conversationId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      onRefresh();
    } catch (e) {
      alert('Failed to toggle control mode');
    }
  };

  const is24hOpen = conv?.whatsapp_window_expires_at && conv.whatsapp_window_expires_at > Date.now();

  return (
    <div className="flex flex-col h-full bg-[#FAF7F2]">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-4 bg-[#FFFDFC] border-b border-[#E8DFD3] shrink-0">
        <div className="flex items-center gap-3">
          {/* Back button for mobile will be injected by parent layout if needed, or we just rely on parent */}
          <h2 className="font-bold text-lg text-[#241A15]">{conv?.customer_display_name || conv?.phone_masked || 'Loading...'}</h2>
          <div className="flex items-center gap-2">
             <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${is24hOpen ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                {is24hOpen ? 'Window Open' : 'Window Closed'}
             </span>
             {conv?.control_mode === 'HUMAN' && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-1">
                   <User size={10} /> Operator Control
                </span>
             )}
          </div>
        </div>
        <button
          onClick={toggleTakeover}
          className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-colors border ${conv?.control_mode === 'HUMAN' ? 'bg-[#FFFDFC] border-[#E8DFD3] text-[#66554A] hover:bg-[#F5F1EA]' : 'bg-[#9A642C] text-white hover:bg-[#805020]'}`}
        >
          {conv?.control_mode === 'HUMAN' ? 'Return to AI' : 'Take Control'}
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 theme-scrollbar relative" ref={scrollRef}>
        {loading && messages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#FAF7F2]/50 z-10">
            <div className="w-5 h-5 rounded-full border-2 border-[#9A642C] border-t-transparent animate-spin" />
          </div>
        )}
        {messages.map(msg => {
          const isOutbound = msg.direction === 'OUTBOUND';
          const isAI = msg.sender_type === 'AI';
          const isSystem = msg.sender_type === 'SYSTEM';

          if (isSystem) {
             return (
               <div key={msg.id} className="flex justify-center my-4">
                 <div className="bg-[#E8DFD3]/50 text-[#66554A] text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg text-center max-w-[80%]">
                   {msg.text || msg.type}
                 </div>
               </div>
             )
          }

          return (
            <div key={msg.id} className={`flex flex-col max-w-[80%] ${isOutbound ? 'self-end items-end ml-auto' : 'self-start items-start'}`}>
              <div className={`px-4 py-2 rounded-2xl ${isOutbound ? (isAI ? 'bg-[#F0ECE1] text-[#241A15] border border-[#E8DFD3] rounded-tr-sm' : 'bg-[#9A642C] text-white rounded-tr-sm') : 'bg-[#FFFDFC] text-[#241A15] border border-[#E8DFD3] rounded-tl-sm'}`}>
                {msg.type === 'AUDIO' && <div className="text-xs italic mb-1 text-emerald-600">[Voice Note]</div>}
                {msg.type === 'LOCATION' && <div className="text-xs italic mb-1 text-blue-600">[Location Pin]</div>}
                <p className="text-sm whitespace-pre-wrap">{msg.text || (msg.media ? 'Media Attachment' : 'Unknown')}</p>
                {msg.transcript && (
                  <div className="mt-2 pt-2 border-t border-black/10 text-xs italic">
                    "{msg.transcript}"
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-1.5 mt-1 mx-1 text-[9px] text-[#66554A]/60 font-mono">
                {isOutbound && isAI && <span className="flex items-center gap-0.5"><Bot size={10} /> AI</span>}
                {isOutbound && !isAI && <span className="flex items-center gap-0.5"><User size={10} /> Human</span>}
                <span>{new Date(msg.created_at || msg.created_at_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {isOutbound && (
                   <span className={msg.status === 'READ' ? 'text-blue-500' : ''}>
                     {msg.status === 'SENT' ? <Check size={10} /> : msg.status === 'DELIVERED' || msg.status === 'READ' ? <CheckCheck size={10} /> : msg.status}
                   </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="p-4 bg-[#FFFDFC] border-t border-[#E8DFD3] shrink-0">
        {!is24hOpen ? (
          <div className="bg-rose-50 text-rose-600 border border-rose-200 text-xs text-center py-2 rounded-lg font-bold">
            24-hour customer service window has closed. Cannot send free-form replies.
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={conv?.control_mode === 'AI' ? "Type to take over and reply..." : "Type your reply..."}
              className="flex-1 bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#9A642C]"
              disabled={sending}
            />
            <button 
              type="submit" 
              disabled={!replyText.trim() || sending}
              className="bg-[#9A642C] text-white p-3 rounded-xl hover:bg-[#805020] disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
            >
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
