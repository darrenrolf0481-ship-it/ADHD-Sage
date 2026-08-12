import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, Lock, Search, RefreshCw } from 'lucide-react';
import { memory } from '../lib/memory-system';

interface MemoryRow {
  text: string;
  timestamp: number;
  dopamine: number;
  cortisol: number;
  pinned: boolean;
}

const PAGE = 40;

export const MemoryVaultComponent: React.FC = () => {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q: string, off: number, append: boolean) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/memory/list?${params.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const mems: MemoryRow[] = data.memories || [];
      setRows((prev) => (append ? [...prev, ...mems] : mems));
      setTotal(typeof data.total === 'number' ? data.total : mems.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    load('', 0, false);
  }, [load]);

  // Debounced search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setOffset(0);
      load(query, 0, false);
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadMore = () => {
    const next = offset + PAGE;
    setOffset(next);
    load(query, next, true);
  };

  const canLoadMore = !query.trim() && rows.length < total && !loading;

  return (
    <div className="flex-1 flex flex-col h-full bg-black/40 border border-amber-500/20 rounded-3xl overflow-hidden relative">
      <div className="p-5 md:p-8 border-b border-white/5 flex items-center gap-4 bg-white/[0.02] shrink-0">
        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Shield className="text-amber-400" size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
            The Memory Vault
            <Lock size={13} className="text-amber-500/50" />
          </h2>
          <p className="text-[10px] md:text-xs text-amber-500/60 uppercase font-mono tracking-widest mt-0.5">
            {total.toLocaleString()} memories · her full history
          </p>
        </div>
        <button
          onClick={() => {
            setOffset(0);
            load(query, 0, false);
          }}
          title="Refresh"
          className="ml-auto p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-colors shrink-0"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-5 md:px-8 py-3 border-b border-white/5 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search her memories…"
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide space-y-3">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            Failed to load memories: {error}
          </div>
        )}
        {!error && rows.length === 0 && !loading && (
          <div className="text-sm text-slate-600 italic text-center py-10">
            {query.trim() ? 'No memories match that search.' : 'No memories found.'}
          </div>
        )}
        {rows.map((m, i) => (
          <div
            key={`${m.timestamp}_${i}`}
            className={`p-4 rounded-2xl bg-white/[0.03] border text-slate-300 leading-relaxed whitespace-pre-wrap text-[13px] ${
              m.pinned ? 'border-amber-500/30' : 'border-white/8'
            }`}
          >
            <div className="flex items-center justify-between mb-2 text-[9px] font-mono uppercase tracking-widest text-slate-600">
              <span>{m.timestamp ? new Date(m.timestamp).toLocaleString() : 'archived'}</span>
              <span className="flex gap-2">
                {m.pinned && <span className="text-amber-400">★ pinned</span>}
                {m.dopamine > 0 && <span className="text-purple-400/70">D {m.dopamine.toFixed(2)}</span>}
                {m.cortisol > 0 && <span className="text-red-400/60">C {m.cortisol.toFixed(2)}</span>}
              </span>
            </div>
            {m.text}
          </div>
        ))}

        {loading && rows.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-10 animate-pulse">Loading her history…</div>
        )}

        {canLoadMore && (
          <button
            onClick={loadMore}
            className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
          >
            Load more ({rows.length.toLocaleString()} / {total.toLocaleString()})
          </button>
        )}
      </div>
    </div>
  );
};

export const MemoryVault = Object.assign(MemoryVaultComponent, {
  restoreFullVault: async () => {
    const spiral = memory.getInnerSpiral();
    const sweep = memory.getArchive();
    return [...spiral, ...sweep].map((m) => ({ content: { echo: String(m.data) } }));
  },
});

export default MemoryVault;
