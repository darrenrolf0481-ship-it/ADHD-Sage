import React from 'react';
import { Terminal, Zap, Paperclip } from 'lucide-react';
import type { Attachment } from '../types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  pendingAttachments: Attachment[];
  setPendingAttachments: (attachments: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void;
  onSend: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  isLoading,
  pendingAttachments,
  setPendingAttachments,
  onSend,
  onAttach,
}) => {
  return (
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
  );
};
