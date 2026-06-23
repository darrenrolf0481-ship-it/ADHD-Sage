import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Zap } from 'lucide-react';
import type { MemoryNode } from '../lib/memory-system';

const shortId = (id: string): string => (id.split('_')[1] ?? id).slice(-4);

interface InspectorPanelProps {
  suggestions: MemoryNode[];
  innerSpiral: MemoryNode[];
  sortedInnerSpiral: MemoryNode[];
  sortBy: 'timestamp' | 'dopamine' | 'cortisol';
  setSortBy: (value: 'timestamp' | 'dopamine' | 'cortisol') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (value: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void;
  onSuggestionClick: (data: unknown) => void;
  onArchive: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  suggestions,
  innerSpiral,
  sortedInnerSpiral,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  onSuggestionClick,
  onArchive,
}) => {
  return (
    <div className="w-80 hidden lg:flex flex-col gap-4 overflow-hidden">
      {suggestions.length > 0 && (
        <motion.section
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-6 rounded-3xl bg-cyan-400/5 border border-cyan-400/20 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-cyan-400" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              Synaptic Suggestions
            </h3>
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSuggestionClick(s.data)}
                className="w-full text-left p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/10 hover:border-cyan-400/30 transition-all group"
              >
                <div className="text-[11px] text-cyan-200 line-clamp-2 leading-relaxed">
                  {String(s.data)}
                </div>
                <div className="mt-1 flex justify-between items-center">
                  <span className="text-[8px] text-cyan-500 uppercase font-bold tracking-tighter">
                    Node #{shortId(s.id)}
                  </span>
                  <span className="text-[8px] text-cyan-500/60 font-mono">RECALL</span>
                </div>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      <section className="flex-1 p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Inner Spiral Synapses
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'timestamp' | 'dopamine' | 'cortisol')
              }
              className="bg-transparent text-[9px] text-slate-500 font-bold uppercase outline-none cursor-pointer border border-white/5 rounded px-1"
            >
              <option value="timestamp">Time</option>
              <option value="dopamine">Dopamine</option>
              <option value="cortisol">Stress</option>
            </select>
            <button
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="text-[9px] text-slate-500 hover:text-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
              title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
              aria-label={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
            >
              <RefreshCw size={10} className={sortOrder === 'asc' ? '' : 'rotate-180'} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
          {innerSpiral.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic">No synaptic memory recorded.</div>
          ) : (
            sortedInnerSpiral.map((node) => (
              <div
                key={node.id}
                className="p-3 rounded-xl bg-[#1C1C1E] border border-white/5 text-[10px] relative group"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-cyan-400 font-mono">#{shortId(node.id)}</span>
                  <span className="text-[9px] text-slate-500">
                    {new Date(node.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-slate-300 line-clamp-2">{String(node.data)}</div>
                <div className="mt-2 flex gap-2 opacity-50">
                  <span className="text-[8px] uppercase">D: {node.dopamine.toFixed(2)}</span>
                  <span className="text-[8px] uppercase">C: {node.cortisol.toFixed(2)}</span>
                </div>
                {node.pinned && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                )}
              </div>
            ))
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-white/5">
          <button
            onClick={onArchive}
            className="w-full py-2 bg-[#1C1C1E] hover:bg-white/10 rounded-xl text-[10px] border border-white/5 transition-colors uppercase font-bold tracking-widest text-slate-300"
          >
            Archive All
          </button>
        </div>
      </section>
    </div>
  );
};
