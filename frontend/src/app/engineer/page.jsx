'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sendChat } from '@/lib/api';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';

export default function EngineerPage() {
  const [messages, setMessages] = useState([
    { text: 'Welcome! I\'m your <strong>AI Race Engineer</strong>. Ask me about race winners, fastest laps, or championship standings. Type <strong>help</strong> for examples!', isUser: false },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const messagesRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  };

  useEffect(scrollToBottom, [messages]);

  const speak = (text) => {
    if (!ttsEnabled) return;
    const clean = text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.1; u.pitch = 0.9;
    speechSynthesis.speak(u);
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { text: msg, isUser: true }]);
    setSending(true);
    try {
      const res = await sendChat(msg);
      const html = res.reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      setMessages((prev) => [...prev, { text: html, isUser: false }]);
      speak(res.reply);
    } catch {
      setMessages((prev) => [...prev, { text: '⚠️ Connection error. Is the server running?', isUser: false }]);
    } finally {
      setSending(false);
    }
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onresult = (e) => { setInput(e.results[0][0].transcript); };
    recognition.start();
  };

  return (
    <div className="max-w-4xl mx-auto px-5 pb-16">
      <PageHeader title="Part 5 —" gradient="AI Race Engineer" subtitle="Chat with your AI-powered F1 data assistant" />
      <GlassCard hover={false} className="flex flex-col h-[520px]">
        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto pr-2 mb-4 space-y-4">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${m.isUser ? 'flex-row-reverse' : ''}`}>
              <div className={`w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0 border border-white/[0.08] ${m.isUser ? 'bg-[#e10600]' : 'bg-[#12121e]'}`}>
                {m.isUser ? '👤' : '🤖'}
              </div>
              <div className={`max-w-[75%] px-4 py-3 rounded-[14px] text-sm leading-relaxed ${m.isUser ? 'bg-[rgba(225,6,0,0.1)] border border-[rgba(225,6,0,0.5)]' : 'bg-[#12121e] border border-white/[0.08]'}`}
                dangerouslySetInnerHTML={{ __html: m.text }} />
            </motion.div>
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-md flex items-center justify-center text-lg shrink-0 bg-[#12121e] border border-white/[0.08]">🤖</div>
              <div className="bg-[#12121e] border border-white/[0.08] rounded-[14px] px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#e10600] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[#e10600] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#e10600] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Input */}
        <div className="flex gap-2">
          <button onClick={startVoice} className="w-10 h-10 rounded-md bg-[#12121e] border border-white/[0.08] flex items-center justify-center text-lg hover:border-[#e10600] transition-colors shrink-0" title="Voice Input">🎙️</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            className="flex-1 bg-[#12121e] border border-white/[0.08] rounded-md px-4 py-2.5 text-sm text-white outline-none focus:border-[#e10600] focus:shadow-[0_0_10px_rgba(225,6,0,0.35)] transition-all"
            placeholder="Ask about F1 data... e.g. Who won round 1 in 2023?" />
          <Button onClick={send} disabled={sending}>Send</Button>
          <button onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`w-10 h-10 rounded-md bg-[#12121e] border border-white/[0.08] flex items-center justify-center text-lg hover:border-[#e10600] transition-colors shrink-0 ${ttsEnabled ? 'opacity-100' : 'opacity-40'}`}
            title={ttsEnabled ? 'Voice ON' : 'Voice OFF'}>🔊</button>
        </div>
      </GlassCard>
    </div>
  );
}
