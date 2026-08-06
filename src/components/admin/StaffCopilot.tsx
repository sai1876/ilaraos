'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Sparkles } from 'lucide-react';
import { askStaffCopilotAction } from '@/app/_actions/groqActions';

export default function StaffCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);
    try {
      const context = "Standard Frappe Recipe: 1 shot espresso, 2 pumps caramel, 1 cup ice, 1/2 cup milk. Blend until smooth. Wi-fi password for staff is IlaraStaff2026. Peak hours are usually 8 PM to 10 PM. Always smile and greet the customer with 'Welcome to Ilara Cafe'.";
      const reply = await askStaffCopilotAction(userMsg, context);
      setMessages(prev => [...prev, { role: 'ai', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I couldn\'t reach the server. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg border border-[#d8bc8a]/40 bg-[#f5f0e8] text-[#b87c2e] transition-all hover:bg-[#ede8dc] hover:shadow-xl"
        style={{ boxShadow: '0 4px 24px rgba(133,83,0,0.18)' }}
      >
        <Bot size={22} className="relative z-10" />
      </motion.button>

      {/* Copilot Chat Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] h-[550px] bg-[#fbf9f5] rounded-3xl shadow-[0_12px_48px_rgba(74,48,16,0.18)] border border-[#d8bc8a]/60 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#d8bc8a]/40 flex items-center justify-between bg-[#f5f0e8]/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #e8a838, #c47c1a)' }}>
                  <Bot size={16} strokeWidth={2} className="text-white" />
                </div>
                <div>
                  <h3 className="font-serif italic font-bold text-[#4a3010] text-base leading-none">Staff Copilot</h3>
                  <p className="text-[10px] font-mono text-[#a07848]/70 uppercase tracking-widest mt-0.5">Ilara Cafe AI Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] font-mono text-[#4caf50] bg-[#e8f5e9] border border-[#c8e6c9] px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50] inline-block animate-pulse" />
                  Online
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#a07848]/60 hover:text-[#4a3010] hover:bg-[#e0cdb5]/60 transition-colors ml-1"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3" style={{ background: '#fdf9f4' }}>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center justify-center h-full gap-4 pb-4"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #f0d9b0 0%, #e8c887 100%)' }}>
                    <Sparkles size={26} className="text-[#b87c2e]" strokeWidth={1.8} />
                  </div>
                  <div className="text-center">
                    <p className="font-serif italic text-[#4a3010] text-base font-semibold">How can I help?</p>
                    <p className="text-[#a07848]/70 text-xs font-mono mt-1.5 leading-relaxed max-w-[200px]">
                      Ask me about SOPs, recipes, or daily operations
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full mt-1">
                    {['What is the frappe recipe?', 'What are peak hours?', 'Staff Wi-Fi password?'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); }}
                        className="text-left text-xs font-mono text-[#7a4f1e] bg-[#f0e6d4] hover:bg-[#e8d9c0] border border-[#d8c3a0]/60 px-3 py-2 rounded-xl transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'ai' && (
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: 'linear-gradient(135deg, #e8a838, #c47c1a)' }}>
                      <Bot size={12} className="text-white" strokeWidth={2} />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap font-mono ${
                      m.role === 'user'
                        ? 'text-white rounded-br-sm'
                        : 'text-[#3d2a10] border rounded-bl-sm'
                    }`}
                    style={
                      m.role === 'user'
                        ? { background: 'linear-gradient(135deg, #c47c1a, #a86010)', boxShadow: '0 2px 12px rgba(180,100,20,0.25)' }
                        : { background: '#fff', border: '1.5px solid #e0cdb5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }
                    }
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start items-end gap-2"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #e8a838, #c47c1a)' }}>
                    <Bot size={12} className="text-white" strokeWidth={2} />
                  </div>
                  <div className="bg-white border border-[#e0cdb5] rounded-2xl rounded-bl-sm px-4 py-3" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-[#c47c1a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-[#c47c1a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-[#c47c1a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div
              className="px-4 py-3.5 shrink-0"
              style={{ background: '#f5ede0', borderTop: '1.5px solid #e0cdb5' }}
            >
              <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-[#e0cdb5] px-3.5 py-2.5 focus-within:border-[#c47c1a]/60 transition-colors" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Ask a question…"
                  className="flex-1 text-[13px] font-mono text-[#3d2a10] placeholder-[#a07848]/40 outline-none bg-transparent"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #e8a838, #c47c1a)', boxShadow: '0 2px 8px rgba(180,100,20,0.3)' }}
                >
                  <Send size={14} strokeWidth={2.5} className="text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
