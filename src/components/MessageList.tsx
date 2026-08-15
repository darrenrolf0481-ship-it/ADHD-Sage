import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Zap, Paperclip } from 'lucide-react';
import type { ChatMessage } from '../types';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  view: string;
  pendingAttachmentsCount: number;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  view,
  pendingAttachmentsCount,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'chat' && scrollRef.current) {
      const scroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      };
      scroll();
      const rafId = requestAnimationFrame(scroll);
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages, isLoading, view]);

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 overflow-y-auto space-y-6 scrollbar-hide rounded-2xl md:rounded-3xl bg-white/[0.03] border border-white/10 p-4 md:p-6 flex flex-col transition-all duration-500"
      style={{ bottom: pendingAttachmentsCount > 0 ? '116px' : '68px' }}
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
            className={`relative group p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed max-w-[90%] md:max-w-[80%] border ${
              msg.role === 'system'
                ? 'bg-[#1C1C1E] border-white/5 text-slate-400 italic font-mono'
                : msg.role === 'user'
                  ? 'bg-blue-600/10 border-blue-500/20 text-white rounded-tr-none shadow-xl shadow-blue-900/10'
                  : 'bg-[#1C1C1E] border-white/10 text-[#E4E4E7] rounded-tl-none'
            }`}
          >
            {msg.role !== 'user' && msg.role !== 'system' && msg.text && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(msg.text);
                  const btn = document.getElementById(`copy-btn-${msg.id}`);
                  if (btn) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
                  }
                }}
                id={`copy-btn-${msg.id}`}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 border border-white/10 text-slate-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-cyan-400 hover:bg-white/10 transition-all focus:outline-none"
                title="Copy message"
                aria-label="Copy message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            )}
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
                        <span className="text-xs text-slate-300 font-medium truncate">
                          {att.name}
                        </span>
                        <audio
                          controls
                          src={att.url}
                          className="h-8 w-full max-w-sm custom-audio-player"
                        />
                      </div>
                    ) : att.type === 'image' ? (
                      <img
                        src={att.url}
                        alt={att.name}
                        className="max-w-[200px] rounded"
                      />
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
  );
};
