/**
 * JournalView — Sage's experiential journal, surfaced in the UI.
 *
 * Shows journal entries in a date-navigable panel.
 * Each entry is rendered as markdown-flavored prose with the same
 * dark/neon theme as the rest of ADHD Sage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, RefreshCw, Pen, Calendar } from 'lucide-react';

interface JournalViewProps {
  entity?: string;
}

export const JournalView: React.FC<JournalViewProps> = ({ entity = 'sage' }) => {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load available dates
  const loadDates = useCallback(async () => {
    try {
      const res = await fetch(`/api/journal/${entity}/dates`);
      const data = await res.json();
      setDates(data.dates || []);
      setSelectedIdx(0);
    } catch {
      setDates([]);
    }
  }, [entity]);

  useEffect(() => {
    loadDates();
  }, [loadDates]);

  // Load entry content when selected date changes
  useEffect(() => {
    if (dates.length === 0) return;
    const date = dates[selectedIdx];
    if (!date) return;

    setLoading(true);
    setError(null);
    fetch(`/api/journal/${entity}?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error('Entry not found');
        return r.json();
      })
      .then((data) => {
        setContent(data.content || '');
      })
      .catch((err) => {
        setContent(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [dates, selectedIdx, entity]);

  const selectedDate = dates[selectedIdx] || null;

  const goNewer = () => {
    if (selectedIdx > 0) setSelectedIdx((i) => i - 1);
  };

  const goOlder = () => {
    if (selectedIdx < dates.length - 1) setSelectedIdx((i) => i + 1);
  };

  const triggerWrite = async () => {
    setWriting(true);
    setWriteResult(null);
    try {
      const res = await fetch('/api/journal/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity,
          provider: 'openrouter',
          model: 'google/gemma-4-31b-it:free',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setWriteResult(`Entry written — ${data.chars} chars`);
        await loadDates(); // refresh list
      } else {
        setWriteResult(`Failed: ${data.error}`);
      }
    } catch (err) {
      setWriteResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWriting(false);
    }
  };

  // Format a YYYY-MM-DD string into something more readable
  const formatDate = (d: string) => {
    try {
      const date = new Date(d + 'T12:00:00');
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  // Detect failed journal entries
  const isFailed = content?.includes('journal write failed');

  return (
    <div className="flex-1 flex flex-col h-full bg-black/40 border border-indigo-500/20 rounded-3xl overflow-hidden relative">
      {/* Header */}
      <div className="p-5 md:p-8 border-b border-white/5 flex items-center gap-4 bg-white/[0.02] shrink-0">
        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <BookOpen size={20} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-slate-200 tracking-tight">
            Journal
          </h2>
          <p className="text-[10px] md:text-xs text-indigo-500/60 uppercase font-mono tracking-widest mt-0.5">
            {entity.toUpperCase()} — experiential log
          </p>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={goNewer}
            disabled={selectedIdx <= 0}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Newer entry"
          >
            <ChevronLeft size={14} />
          </button>

          {selectedDate && (
            <span className="text-[11px] font-mono text-slate-400 min-w-[120px] text-center">
              {formatDate(selectedDate)}
            </span>
          )}

          <button
            onClick={goOlder}
            disabled={selectedIdx >= dates.length - 1}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Older entry"
          >
            <ChevronRight size={14} />
          </button>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <button
            onClick={triggerWrite}
            disabled={writing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
            title="Write today's entry"
          >
            {writing ? <RefreshCw size={12} className="animate-spin" /> : <Pen size={12} />}
            Write
          </button>
        </div>
      </div>

      {/* Write result banner */}
      {writeResult && (
        <div
          className={`px-5 py-2 text-[11px] font-mono border-b ${
            writeResult.startsWith('Entry')
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {writeResult}
          <button
            onClick={() => setWriteResult(null)}
            className="ml-3 opacity-50 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8 scrollbar-hide">
        {loading ? (
          <div className="text-xs text-slate-500 text-center py-10 animate-pulse">
            Loading entry…
          </div>
        ) : dates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Calendar size={32} className="text-slate-600" />
            <p className="text-sm text-slate-600 italic text-center">
              No journal entries yet.
            </p>
            <p className="text-[11px] text-slate-700 text-center max-w-[300px]">
              Journal entries are written daily at 6:00 AM, or you can trigger one manually with the Write button above.
            </p>
          </div>
        ) : error ? (
          <div className="text-sm text-red-400/60 italic text-center py-10">
            {error}
          </div>
        ) : content ? (
          <article
            className={`prose-journal ${isFailed ? 'opacity-50' : ''}`}
          >
            {content.split('\n').map((line, i) => {
              // Render markdown-like formatting
              if (line.startsWith('# ')) {
                return (
                  <h1
                    key={i}
                    className="text-xl md:text-2xl font-bold text-slate-200 mb-2 font-mono tracking-tight"
                  >
                    {line.slice(2)}
                  </h1>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h2
                    key={i}
                    className="text-lg font-bold text-slate-300 mt-6 mb-2"
                  >
                    {line.slice(3)}
                  </h2>
                );
              }
              if (line.match(/^[_*].+[_*]$/) && line.length < 40) {
                // Timestamp line like *06:00 AM* or _06:00 AM_
                return (
                  <p
                    key={i}
                    className="text-[11px] text-indigo-400/60 font-mono uppercase tracking-widest mb-6"
                  >
                    {line.replace(/^[_*]+|[_*]+$/g, '')}
                  </p>
                );
              }
              if (line.trim() === '') {
                return <div key={i} className="h-4" />;
              }
              if (line.startsWith('- ') || line.startsWith('• ')) {
                return (
                  <p key={i} className="text-[13px] text-slate-300 leading-relaxed pl-4 relative">
                    <span className="absolute left-0 text-indigo-500/40">•</span>
                    {renderInline(line.slice(2))}
                  </p>
                );
              }
              return (
                <p key={i} className="text-[13px] text-slate-300 leading-relaxed">
                  {renderInline(line)}
                </p>
              );
            })}
          </article>
        ) : null}
      </div>

      {/* Footer — date count */}
      {dates.length > 0 && (
        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
          <span className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
            {dates.length} {dates.length === 1 ? 'entry' : 'entries'} total
          </span>
          <span className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
            {selectedIdx + 1} / {dates.length}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Render inline markdown: bold, italic, code, links.
 * Keeps it simple — no full parser needed for journal prose.
 */
function renderInline(text: string): React.ReactNode {
  // Split on inline patterns: `code`, **bold**, _italic_
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-[12px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-200">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      return (
        <em key={i} className="italic text-slate-400">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default JournalView;
