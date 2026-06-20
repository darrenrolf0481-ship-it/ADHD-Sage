import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Paperclip, Terminal, Zap } from 'lucide-react';
import type { Attachment, ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pendingAttachments: Attachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  pendingAttachments,
  setPendingAttachments,
  input,
  setInput,
  onSend,
  onAttach,
  scrollRef,
}) => {
  return (
    <>
      {/* Messages — absolutely fills space above input bar, always scrollable */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto space-y-6 scrollbar-hide rounded-2xl md:rounded-3xl bg-white/[0.03] border border-white/10 p-4 md:p-6 flex flex-col transition-all duration-500"
        style={{ bottom: pendingAttachments.length > 0 ? '116px' : '68px' }}
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
                  msg.role === 'system'
                    ? 'bg-slate-700'
                    : 'bg-gradient-to-tr from-blue-500 to-cyan-400'
                }`}
              >
                {msg.role === 'system' ? (
                  <AlertCircle size={14} />
                ) : (
                  <Zap size={14} className="text-white" />
                )}
              </div>
            )}

            <div
              className={`p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed max-w-[90%] md:max-w-[80%] border ${
                msg.role === 'system'
                  ? 'bg-[#1C1C1E] border-white/5 text-slate-400 italic font-mono'
                  : msg.role === 'user'
                    ? 'bg-blue-600/10 border-blue-500/20 text-white rounded-tr-none shadow-xl shadow-blue-900/10'
                    : 'bg-[#1C1C1E] border-white/10 text-[#E4E4E7] rounded-tl-none'
              }`}
            >
              {msg.text && <div className="mb-2 whitespace-pre-wrap">{msg.text}</div>}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {msg.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-white/10"
                    >
                      {att.type === 'audio' ? (
                        <div className="flex flex-col w-full gap-1">
                          <span className="text-xs text-slate-300 font-medium truncate">{att.name}</span>
                          <audio
                            controls
                            src={att.url}
                            className="h-8 w-full max-w-sm custom-audio-player"
                          />
                        </div>
                      ) : att.type === 'image' ? (
                        <img src={att.url} alt={att.name} className="max-w-[200px] rounded" />
                      ) : att.type === 'video' ? (
                        <video src={att.url} controls className="max-w-[200px] rounded" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Paperclip size={14} className="text-cyan-400" />
                          <span className="text-xs text-cyan-400 underline underline-offset-2">
                            {att.name}
                          </span>
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
            <div className="w-8 h-8 rounded-lg bg-[#1C1C1E] shrink-0" />
            <div className="bg-[#1C1C1E] h-12 w-48 rounded-2xl rounded-tl-none border border-white/10" />
          </div>
        )}
      </div>

      {/* Input area — absolutely pinned to the bottom, never moves */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2">
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 p-2 rounded-xl border ${
                  att.content
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <Paperclip
                  size={14}
                  className={att.content ? 'text-cyan-400' : 'text-slate-400'}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] sm:text-xs text-white max-w-[150px] truncate">
                    {att.name}
                  </span>
                  {att.content && (
                    <span className="text-[9px] text-cyan-400/70 font-mono">
                      {att.content.length.toLocaleString()} chars · ready
                    </span>
                  )}
                </div>
                <button
                  onClick={() =>
                    setPendingAttachments((prev) => {
                      const removed = prev[i];
                      if (removed) URL.revokeObjectURL(removed.url);
                      return prev.filter((_, idx) => idx !== i);
                    })
                  }
                  className="ml-1 text-slate-400 hover:text-red-400"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="h-14 rounded-xl bg-white/[0.12] border border-cyan-500/30 px-4 flex items-center gap-3 group focus-within:border-cyan-500/60 transition-all">
          <Terminal
            size={16}
            className="text-slate-400 group-focus-within:text-cyan-400 shrink-0 transition-colors"
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Message Sage..."
            className="bg-transparent border-none outline-none flex-1 text-sm text-white placeholder-slate-500 font-sans"
          />
          <label
            className="cursor-pointer p-2 text-slate-500 hover:text-cyan-400 transition-colors rounded-lg"
            title="Attach file — images, audio, video, MHT, TXT, JSON, CSV, MD, HTML, XML, YAML, LOG…"
          >
            <Paperclip size={18} />
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*,video/*,audio/*,.mht,.mhtml,.txt,.json,.csv,.md,.html,.htm,.xml,.yaml,.yml,.log,.tsv,.pdf,.doc,.docx"
              onChange={onAttach}
            />
          </label>
          <button
            onClick={onSend}
            disabled={isLoading || !input.trim()}
            className="p-2 text-cyan-400 disabled:text-slate-600 transition-colors"
          >
            <Zap size={18} fill={input.trim() ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </>
  );
};
