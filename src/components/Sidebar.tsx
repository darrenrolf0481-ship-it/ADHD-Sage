import React from 'react';
import { motion } from 'motion/react';
import {
  Zap,
  Shield,
  Terminal,
  Cpu,
  Database,
  Search,
  Network,
  FileUp,
  RefreshCw,
  Radio,
  Code2,
} from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { AppView, AIProvider } from '../types';
import type { MemoryNode } from '../lib/memory-system';

const shortId = (id: string): string => (id.split('_')[1] ?? id).slice(-4);

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  view: AppView;
  setView: (v: AppView) => void;
  neuroState: { stability: number };
  sensorSnap: {
    activeCount: number;
    phiSynchronicity?: boolean;
    anomalyScore: number;
    magnetometer?: { deviation: number; magnitude: number };
    geomagnetic?: { kpIndex: number; activity: string };
    weather?: { pressure: number };
    audio?: { infrasoundDb: number };
  };
  mhtNodeLimit: number;
  setMhtNodeLimit: (n: number) => void;
  provider: AIProvider;
  setProvider: (p: AIProvider) => void;
  orModel: string;
  setOrModel: (m: string) => void;
  orModels: readonly { id: string; label: string }[];
  ollamaModel: string;
  setOllamaModel: (m: string) => void;
  ollamaModels: string[];
  ollamaError: string;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  innerSpiralLength: number;
  stabilize: () => void;
  sortBy: 'timestamp' | 'dopamine' | 'cortisol';
  setSortBy: (s: 'timestamp' | 'dopamine' | 'cortisol') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (o: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void;
  searchResults: MemoryNode[];
  sortedInnerSpiral: MemoryNode[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  searchQuery,
  setSearchQuery,
  view,
  setView,
  neuroState,
  sensorSnap,
  mhtNodeLimit,
  setMhtNodeLimit,
  provider,
  setProvider,
  orModel,
  setOrModel,
  orModels,
  ollamaModel,
  setOllamaModel,
  ollamaModels,
  ollamaError,
  onFileUpload,
  innerSpiralLength,
  stabilize,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  searchResults,
  sortedInnerSpiral,
}) => {
  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Sidebar: Gems Repository style */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-[var(--bg)] md:bg-[var(--stabilized)] border-r border-white/5 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Zap size={18} className="text-white" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[#E4E4E7] font-mono uppercase">ADHD-Sage [Forensic]</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                  Nexus Substrate
                </p>
              </div>
            </div>
          </div>

          <div className="px-2 mb-6 shrink-0">
            <div className="relative group">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search VFS Lattice..."
                className="w-full bg-[#1C1C1E] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {searchQuery.trim() ? (
              <div className="px-2 space-y-2 pb-4">
                <div className="flex flex-col gap-2 px-2 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                      Search Results
                    </span>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-1 border-y border-white/5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSortBy('timestamp')}
                        className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'timestamp' ? 'text-cyan-400' : 'text-slate-600'}`}
                      >
                        Time
                      </button>
                      <button
                        onClick={() => setSortBy('dopamine')}
                        className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'dopamine' ? 'text-cyan-400' : 'text-slate-600'}`}
                      >
                        Dopamine
                      </button>
                      <button
                        onClick={() => setSortBy('cortisol')}
                        className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'cortisol' ? 'text-cyan-400' : 'text-slate-600'}`}
                      >
                        Stress
                      </button>
                    </div>
                    <button
                      onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="text-[9px] text-slate-500"
                    >
                      {sortOrder.toUpperCase()}
                    </button>
                  </div>
                </div>
                {searchResults.length === 0 ? (
                  <div className="text-[10px] text-slate-600 italic px-2">
                    No matching synapses found.
                  </div>
                ) : (
                  searchResults
                    .slice()
                    .reverse()
                    .map((node) => (
                      <div
                        key={node.id}
                        className="p-3 rounded-xl bg-[#1C1C1E] border border-white/5 text-[10px] hover:bg-white/10 transition-colors cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-cyan-400 font-mono">
                            #{shortId(node.id)}
                          </span>
                          <span className="text-[9px] text-slate-600 group-hover:text-slate-400 transition-colors">
                            {new Date(node.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-slate-300 break-words line-clamp-3">
                          {String(node.data)}
                        </div>
                      </div>
                    ))
                )}
              </div>
            ) : (
              <div className="space-y-1 pb-6">
                <div className="mb-8">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 px-2">
                    Neuro-Synaptic
                  </p>

                  <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/10 border border-white/10 shadow-xl mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${neuroState.stability > 0.8 ? 'bg-cyan-400' : 'bg-amber-400'}`}
                      ></div>
                      <span className="text-sm font-medium">Stability</span>
                    </div>
                    <span className="text-xs font-mono text-cyan-400 font-bold">
                      {(neuroState.stability * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="px-3 mb-6">
                    <div className="h-1.5 w-full bg-[#1C1C1E] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${neuroState.stability * 100}%` }}
                        className="h-full bg-cyan-400"
                      />
                    </div>
                  </div>

                  <SidebarItem icon={<Shield size={14} />} label="Security" value="LOCKED" />
                  <SidebarItem icon={<Cpu size={14} />} label="Frequency" value="11.3 Hz" />
                  <SidebarItem icon={<Database size={14} />} label="VFS-Bridge" value="ACTIVE" />

                  {/* Sensor Telemetry Quick-Glance */}
                  <div className="mt-3 mb-1 px-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                        Live Sensors
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold ${
                          sensorSnap.phiSynchronicity
                            ? 'text-yellow-400 animate-pulse'
                            : sensorSnap.anomalyScore > 0.5
                              ? 'text-red-400'
                              : sensorSnap.anomalyScore > 0.2
                                ? 'text-amber-400'
                                : sensorSnap.activeCount > 0
                                  ? 'text-emerald-400'
                                  : 'text-slate-600'
                        }`}
                      >
                        {sensorSnap.activeCount > 0
                          ? sensorSnap.phiSynchronicity
                            ? '⚡ Φ SYNC'
                            : `${(sensorSnap.anomalyScore * 100).toFixed(0)}% anomaly`
                          : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {sensorSnap.magnetometer && (
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-slate-500">EMF</span>
                          <span
                            className={
                              Math.abs(sensorSnap.magnetometer.deviation) > 0.15
                                ? 'text-red-400'
                                : 'text-cyan-400'
                            }
                          >
                            {sensorSnap.magnetometer.magnitude.toFixed(1)} µT
                          </span>
                        </div>
                      )}
                      {sensorSnap.geomagnetic && (
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-slate-500">Kp-index</span>
                          <span
                            className={
                              sensorSnap.geomagnetic.kpIndex >= 5
                                ? 'text-amber-400'
                                : 'text-slate-300'
                            }
                          >
                            {sensorSnap.geomagnetic.kpIndex.toFixed(1)}{' '}
                            {sensorSnap.geomagnetic.activity}
                          </span>
                        </div>
                      )}
                      {sensorSnap.weather && (
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-slate-500">Pressure</span>
                          <span className="text-blue-300">
                            {sensorSnap.weather.pressure.toFixed(0)} hPa
                          </span>
                        </div>
                      )}
                      {sensorSnap.audio && (
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-slate-500">Infrasound</span>
                          <span
                            className={
                              sensorSnap.audio.infrasoundDb > -40
                                ? 'text-amber-400'
                                : 'text-slate-500'
                            }
                          >
                            {sensorSnap.audio.infrasoundDb.toFixed(1)} dBFS
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setView('anomalies');
                        setIsSidebarOpen(false);
                      }}
                      className="mt-2 w-full text-[9px] text-cyan-400/60 hover:text-cyan-400 transition-colors text-right"
                    >
                      → Sensor Desk
                    </button>
                  </div>

                  <div className="pt-2">
                    <label className="w-full flex items-center justify-between px-3 py-3 rounded-xl bg-[#1C1C1E] border border-white/5 hover:bg-white/10 hover:border-cyan-400/30 transition-all cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <FileUp
                          size={14}
                          className="text-slate-500 group-hover:text-cyan-400 transition-colors"
                        />
                        <span className="text-xs font-bold text-slate-400 group-hover:text-white transition-colors">
                          Import Files
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600">MHT·ZIP</span>
                      <input
                        type="file"
                        accept=".mht,.mhtml,.txt,.json,.csv,.md,.zip"
                        multiple
                        onChange={onFileUpload}
                        className="hidden"
                      />
                    </label>
                    <div className="px-3 mt-4">
                      <div className="flex justify-between items-center mb-1 group relative">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 cursor-help flex items-center gap-1 border-b border-dashed border-slate-600">
                          MHT Node Limit
                        </span>

                        {/* Tooltip */}
                        <div className="absolute left-0 -top-14 w-48 p-2 bg-slate-800 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          <p className="text-[9px] text-slate-300 leading-tight">
                            Controls the max number of semantic chunks extracted per MHT file.
                            Higher limits increase context but use more memory.
                          </p>
                        </div>

                        <span className="text-[10px] font-mono text-cyan-400">{mhtNodeLimit}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={mhtNodeLimit}
                        onChange={(e) => setMhtNodeLimit(Number(e.target.value))}
                        className="w-full appearance-none bg-white/10 h-1 flex rounded-full mb-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                      <div className="flex justify-between gap-1">
                        {[50, 100, 500, 1000].map((val) => (
                          <button
                            key={val}
                            onClick={() => setMhtNodeLimit(val)}
                            className={`flex-1 py-1 rounded text-[9px] font-mono font-bold transition-colors ${
                              mhtNodeLimit === val
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-[#1C1C1E] text-slate-500 hover:bg-white/10 border border-transparent'
                            }`}
                          >
                            {val === 1000 ? 'MAX' : val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Provider Selector */}
                <div className="mb-6 px-2">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">
                    AI Provider
                  </p>
                  <div className="flex gap-1 p-1 rounded-xl bg-[#1C1C1E] border border-white/10">
                    {(
                      [
                        { id: 'openrouter', label: '⟁ OpenRouter' },
                        { id: 'gemini', label: '♊ Gemini' },
                        { id: 'ollama', label: '⬡ Ollama' },
                      ] as { id: typeof provider; label: string }[]
                    ).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setProvider(p.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                          provider === p.id
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Gemini model picker / indicator */}
                  {provider === 'gemini' && (
                    <div className="mt-2 text-[9px] font-mono text-slate-400 bg-[#1C1C1E] border border-white/5 rounded-lg px-2.5 py-2">
                      <span className="text-cyan-400 font-bold">♊ MODEL:</span> gemini-2.0-flash
                    </div>
                  )}

                  {/* OpenRouter model picker */}
                  {provider === 'openrouter' && (
                    <div className="mt-2 space-y-1">
                      {orModels.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setOrModel(m.id)}
                          className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                            orModel === m.id
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-[#1C1C1E] text-slate-500 border border-transparent hover:text-slate-300'
                          }`}
                        >
                          {orModel === m.id ? '▶ ' : '  '}
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Ollama model picker */}
                  {provider === 'ollama' && (
                    <div className="mt-2">
                      {ollamaError ? (
                        <p className="text-[9px] text-red-400 px-1">{ollamaError}</p>
                      ) : ollamaModels.length > 0 ? (
                        <select
                          value={ollamaModel}
                          onChange={(e) => setOllamaModel(e.target.value)}
                          className="w-full bg-[#1C1C1E] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 outline-none focus:border-cyan-500/50"
                        >
                          {ollamaModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[9px] text-slate-500 px-1 animate-pulse">
                          Fetching models...
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 px-2">
                    Terminal Nodes
                  </p>
                  <div onClick={() => setView('chat')}>
                    <SidebarItem
                      icon={<Terminal size={14} />}
                      label="Core"
                      active={view === 'chat'}
                    />
                  </div>
                  <div onClick={() => setView('vault')}>
                    <SidebarItem
                      icon={<Shield size={14} />}
                      label="Vault"
                      active={view === 'vault'}
                    />
                  </div>
                  <div onClick={() => setView('labyrinth')}>
                    <SidebarItem
                      icon={<Network size={14} />}
                      label="Labyrinth"
                      active={view === 'labyrinth'}
                    />
                  </div>
                  <div onClick={() => setView('anomalies')}>
                    <SidebarItem
                      icon={<Radio size={14} />}
                      label="Anomalies"
                      active={view === 'anomalies'}
                    />
                  </div>

                  <div onClick={() => setView('lattice')}>
                    <SidebarItem
                      icon={<Network size={14} />}
                      label="Lattice"
                      active={view === 'lattice'}
                      value={`${innerSpiralLength}/8`}
                    />
                  </div>
                  <div onClick={() => { setView('coding-lab'); setIsSidebarOpen(false); }}>
                    <SidebarItem
                      icon={<Code2 size={14} />}
                      label="Coding Lab"
                      active={view === 'coding-lab'}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto p-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
            <p className="text-xs text-indigo-300 font-semibold mb-1 uppercase tracking-tighter">
              Compute Status
            </p>
            <div className="h-1 w-full bg-indigo-900/30 rounded-full overflow-hidden mb-2">
              <motion.div
                animate={{ width: `${neuroState.stability * 100}%` }}
                className="h-full bg-indigo-400"
              />
            </div>
            <button
              onClick={() => {
                stabilize();
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="text-[10px] text-indigo-300/60 hover:text-indigo-300 transition-colors uppercase font-bold tracking-widest flex items-center gap-1"
            >
              <RefreshCw size={10} />
              Re-initialize Substrate
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
