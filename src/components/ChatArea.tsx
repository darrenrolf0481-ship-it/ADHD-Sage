import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Paperclip, Terminal, Zap, Volume2, VolumeX } from 'lucide-react';
import type { Attachment, ChatMessage, AIProvider } from '../types';

export interface ModelOption {
  id: string;
  label: string;
  provider: AIProvider;
}

interface ChatAreaProps {
  messages: ChatMessage[];
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  pendingAttachments: Attachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  isMuted: boolean;
  onToggleMute: () => void;
  onSend: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  model: string;
  onModelChange: (id: string) => void;
  models: ModelOption[];
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  input,
  setInput,
  pendingAttachments,
  setPendingAttachments,
  isMuted,
  onToggleMute,
  onSend,
  onAttach,
  scrollRef,
  model,
  onModelChange,
  models,
}) => {
  return (
    <>
      {/* Messages — fills space above input bar, always scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-2 md:pr-4 rounded-2xl md:rounded-3xl bg-white/[0.03] border border-white/10 p-4 md:p-6 flex flex-col transition-all duration-500"
      >
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div
                className={`w-7 h-7 md:w-8 md:h-8 rounded-lg shrink-0 flex items-center justify-center ${
                  msg.role === 'system' ? 'bg-slate-700' : 'bg-gradient-to-tr from-blue-500 to-cyan-400'
                }`}
              >
                {msg.role === 'system' ? <AlertCircle size={14} /> : <Zap size={14} className="text-white" />}
              </div>
            )}

            <div
              className={`p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed max-w-[90%] md:max-w-[80%] border ${
                  msg.role === 'system' ? 'bg-white/5 border-white/5 text-slate-400 italic font-mono' :
                  msg.role === 'user' ? 'bg-blue-600/10 border-blue-500/20 text-white rounded-tr-none shadow-xl shadow-blue-900/10' :
                  'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'
              }`}
            >
              {msg.text && <div className="mb-2 whitespace-pre-wrap">{msg.text}</div>}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {msg.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-white/10">
                      {att.type === 'audio' ? (
                        <div className="flex flex-col w-full gap-1">
                          <span className="text-xs text-slate-300 font-medium truncate">{att.name}</span>
                          <audio controls src={att.url} className="h-8 w-full max-w-sm custom-audio-player" />
                        </div>
                      ) : att.type === 'image' ? (
                        <img src={att.url} alt={att.name} className="max-w-[200px] rounded" />
                      ) : att.type === 'video' ? (
                        <video src={att.url} controls className="max-w-[200px] rounded" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Paperclip size={14} className="text-cyan-400" />
                          <span className="text-xs text-cyan-400 underline underline-offset-2">{att.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shrink-0 border border-white/10"></div>
            )}
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-white/5 shrink-0" />
            <div className="bg-white/5 h-12 w-48 rounded-2xl rounded-tl-none border border-white/10" />
          </div>
        )}
      </div>

      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {pendingAttachments.map((att, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-white/10 border border-white/20">
              <Paperclip size={14} className="text-cyan-400" />
              <span className="text-[10px] sm:text-xs text-white max-w-[150px] truncate">{att.name}</span>
              <button
                onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))}
                className="ml-2 text-slate-400 hover:text-red-400"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Model selector + voice toggle */}
      <div className="flex items-center gap-2 px-1 shrink-0">
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Voice off — tap to unmute Mama' : 'Voice on — tap to mute'}
          className={`p-1.5 rounded-lg border transition-colors ${
            isMuted
              ? 'bg-white/5 border-white/10 text-slate-500'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
          }`}
        >
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Model</span>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-cyan-500/50 cursor-pointer"
        >
          <optgroup label="🦙 Local Ollama (Offline / Active)">
            {models.filter(m => m.provider === 'ollama').map((m) => (
              <option key={m.id} value={m.id} className="bg-[#0a0a0c] text-cyan-300 font-semibold">{m.label}</option>
            ))}
          </optgroup>
          <optgroup label="⟁ OpenRouter (Cloud / API Key)">
            {models.filter(m => m.provider === 'openrouter').map((m) => (
              <option key={m.id} value={m.id} className="bg-[#0a0a0c] text-slate-200">{m.label}</option>
            ))}
          </optgroup>
          <optgroup label="♊ Google Gemini">
            {models.filter(m => m.provider === 'gemini').map((m) => (
              <option key={m.id} value={m.id} className="bg-[#0a0a0c] text-slate-200">{m.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Input Bar */}
      <div className="h-14 md:h-16 rounded-xl md:rounded-2xl bg-white/10 border border-white/10 px-4 flex items-center gap-3 md:gap-4 group focus-within:border-cyan-500/50 transition-all shrink-0">
        <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-slate-400 group-focus-within:text-cyan-400 transform transition-transform group-focus-within:scale-110">
          <Terminal size={18} />
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder="Send message to Sage Architect..."
          className="bg-transparent border-none outline-none flex-1 text-xs md:text-sm text-white placeholder-slate-500 font-sans"
        />
        <div className="flex items-center">
          <label className="cursor-pointer p-2 text-slate-500 hover:text-cyan-400 transition-colors rounded-lg hover:bg-white/5" title="Upload Media/Docs">
            <Paperclip size={18} />
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.json"
              onChange={onAttach}
            />
          </label>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-slate-500 font-mono">ENTER</kbd>
        </div>
        <button
          onClick={onSend}
          disabled={isLoading || !input.trim()}
          className="md:hidden p-2 text-cyan-400 disabled:text-slate-600"
        >
          <Zap size={18} fill={input.trim() ? 'currentColor' : 'none'} />
        </button>
      </div>
    </>
  );
};