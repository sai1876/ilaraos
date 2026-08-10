'use client';

import React, { useState } from 'react';
import ConversationList from './ConversationList';
import MessageTimeline from './MessageTimeline';
import CustomerContext from './CustomerContext';

interface WhatsAppInboxProps {
  actor: { uid: string; role: string; };
}

export default function WhatsAppInbox({ actor }: WhatsAppInboxProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  return (
    <div className="flex h-[calc(100vh-6rem)] w-full bg-[#FAF7F2] rounded-xl border border-[#E8DFD3] overflow-hidden shadow-sm">
      
      {/* LEFT COLUMN: CONVERSATION LIST */}
      <div className="w-1/3 min-w-[300px] max-w-[400px] border-r border-[#E8DFD3] bg-[#FFFDFC] flex flex-col h-full shrink-0">
        <ConversationList 
          onSelect={(id) => setSelectedConversationId(id)} 
          selectedId={selectedConversationId} 
        />
      </div>

      {/* CENTER COLUMN: TIMELINE */}
      <div className="flex-1 flex flex-col bg-[#F9F6F0] h-full min-w-[400px]">
        {selectedConversationId ? (
          <MessageTimeline conversationId={selectedConversationId} actor={actor} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#66554A]/50 font-mono text-sm tracking-widest uppercase">
            Select a conversation to view
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: CONTEXT */}
      <div className="w-80 border-l border-[#E8DFD3] bg-[#FFFDFC] flex flex-col h-full shrink-0">
        {selectedConversationId ? (
          <CustomerContext conversationId={selectedConversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#66554A]/50 font-mono text-[10px] tracking-widest uppercase text-center px-4">
            No context loaded
          </div>
        )}
      </div>

    </div>
  );
}
