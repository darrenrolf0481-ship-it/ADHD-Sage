import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database,
  Sliders,
  HardDrive,
  Terminal,
  Activity,
  RefreshCw,
  Cpu,
  Layers,
  Search,
  Play,
  Info,
  Clock,
  Pin,
  Shield,
} from 'lucide-react';
import { MemoryNode } from '../lib/memory-system';

interface McpTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface McpServerDetails {
  id: string;
  name: string;
  transport: string;
  enabled: boolean;
  autoEnable?: boolean;
  note?: string;
  connected: boolean;
  tools: McpTool[];
}

export const MemoryWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vault' | 'db' | 'mcp'>('vault');

  // Ledger state
  const [innerMemories, setInnerMemories] = useState<MemoryNode[]>([]);
  const [outerMemories, setOuterMemories] = useState<MemoryNode[]>([]);
  const [memoryCounts, setMemoryCounts] = useState<{ seven: number; adhd: number; total: number }>({
    seven: 0,
    adhd: 0,
    total: 0,
  });
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'inner' | 'outer' | 'pinned'>('all');
  const [isRefreshingLedger, setIsRefreshingLedger] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    data: '',
    dopamine: 0.6,
    cortisol: 0.1,
    pinned: false,
    provenance: 'manual',
  });
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{ success: boolean; msg: string } | null>(null);

  // DB diagnostics state
  const [contextLogs, setContextLogs] = useState<Array<{ id: number; content: string; added_at: number }>>([]);
  const [dbActionLogs, setDbActionLogs] = useState<Array<{ time: string; msg: string; status: 'info' | 'success' | 'error' }>>([]);
  const [isDbWorking, setIsDbWorking] = useState<string | null>(null);

  // MCP state
  const [mcpServers, setMcpServers] = useState<McpServerDetails[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<McpServerDetails | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // Reload ledger memories
  const loadLedgerData = async () => {
    setIsRefreshingLedger(true);
    try {
      const [innerRes, outerRes, countsRes] = await Promise.all([
        fetch('/api/vfs/inner'),
        fetch('/api/vfs/outer'),
        fetch('/api/memory/counts'),
      ]);

      if (innerRes.ok) {
        const innerData = await innerRes.json();
        setInnerMemories(innerData);
      }
      if (outerRes.ok) {
        const outerData = await outerRes.json();
        setOuterMemories(outerData);
      }
      if (countsRes.ok) {
        const countsData = await countsRes.json();
        setMemoryCounts(countsData);
      }
    } catch (e) {
      console.error('Failed to load ledger data', e);
    } finally {
      setIsRefreshingLedger(false);
    }
  };

  // Reload Context buffer logs
  const loadContextLogs = async () => {
    try {
      const res = await fetch('/api/vfs/inner/context');
      if (res.ok) {
        const data = await res.json();
        setContextLogs(data);
      }
    } catch (e) {
      console.error('Failed to load context logs', e);
    }
  };

  // Reload MCP servers
  const loadMcpData = async () => {
    setIsMcpLoading(true);
    try {
      const res = await fetch('/api/mcp/status');
      if (res.ok) {
        const data = await res.json();
        if (data.details) {
          setMcpServers(data.details);
          if (data.details.length > 0) {
            // Retain selection if valid, otherwise select first
            setSelectedMcpServer((prev) => {
              const matched = data.details.find((s: McpServerDetails) => s.id === prev?.id);
              return matched || data.details[0];
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to load MCP status', e);
    } finally {
      setIsMcpLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadLedgerData();
    if (activeTab === 'db') {
      loadContextLogs();
    } else if (activeTab === 'mcp') {
      loadMcpData();
    }
  }, [activeTab]);

  // Handle manual injection
  const handleInject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.data.trim()) return;
    setIsInjecting(true);
    setInjectResult(null);

    try {
      const res = await fetch('/api/vfs/inner/stash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: formData.data,
          dopamine: formData.dopamine,
          cortisol: formData.cortisol,
          provenance: {
            source: formData.provenance || 'manual',
            timestamp: Date.now(),
            user_injected: true,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setInjectResult({
          success: true,
          msg: `Successfully stashed as node #${(data.node_id ?? '').slice(-4)}${data.pinned ? ' [Pinned]' : ''}`,
        });
        setFormData((prev) => ({ ...prev, data: '' }));
        loadLedgerData();
      } else {
        setInjectResult({ success: false, msg: data.error || 'Failed to inject memory.' });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setInjectResult({ success: false, msg: errMsg || 'Network error.' });
    } finally {
      setIsInjecting(false);
    }
  };

  // Run DB diagnostics
  const runDbAction = async (action: 'fts-sync' | 'vacuum' | 'integrity') => {
    setIsDbWorking(action);
    const timeStr = new Date().toLocaleTimeString();
    try {
      const res = await fetch(`/api/system/db/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        let msg = '';
        if (action === 'fts-sync') msg = 'Trigram FTS5 full index rebuild completed successfully.';
        else if (action === 'vacuum') msg = 'Database VACUUM completed. Unused page blocks reclaimed.';
        else if (action === 'integrity') {
          const checkResult = data.result?.integrity_check ?? 'ok';
          msg = `Integrity check output: "${checkResult}"`;
        }

        setDbActionLogs((prev) => [
          { time: timeStr, msg, status: 'success' },
          ...prev,
        ]);
        loadLedgerData();
      } else {
        setDbActionLogs((prev) => [
          { time: timeStr, msg: `Action failed: ${data.error || 'Unknown error'}`, status: 'error' },
          ...prev,
        ]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setDbActionLogs((prev) => [
        { time: timeStr, msg: `Network failure: ${errMsg}`, status: 'error' },
        ...prev,
      ]);
    } finally {
      setIsDbWorking(null);
    }
  };

  // Filter & Search memories
  const allFilteredMemories = React.useMemo(() => {
    const list: Array<MemoryNode & { source: 'inner' | 'outer' }> = [];
    if (ledgerFilter === 'all' || ledgerFilter === 'inner') {
      innerMemories.forEach((m) => list.push({ ...m, source: 'inner' }));
    }
    if (ledgerFilter === 'all' || ledgerFilter === 'outer') {
      outerMemories.forEach((m) => list.push({ ...m, source: 'outer' }));
    }
    if (ledgerFilter === 'pinned') {
      innerMemories.filter((m) => m.pinned).forEach((m) => list.push({ ...m, source: 'inner' }));
      outerMemories.filter((m) => m.pinned).forEach((m) => list.push({ ...m, source: 'outer' }));
    }

    // Sort by timestamp desc
    list.sort((a, b) => b.timestamp - a.timestamp);

    // Filter by search text
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      return list.filter((m) => {
        const text = String(m.data).toLowerCase();
        const prov = m.provenance ? JSON.stringify(m.provenance).toLowerCase() : '';
        return text.includes(q) || prov.includes(q);
      });
    }
    return list;
  }, [innerMemories, outerMemories, ledgerFilter, ledgerSearch]);

  const getDopamineColor = (val: number) => {
    if (val >= 0.8) return 'text-emerald-400';
    if (val >= 0.5) return 'text-cyan-400';
    return 'text-slate-400';
  };

  const getCortisolColor = (val: number) => {
    if (val >= 0.7) return 'text-red-400 font-bold';
    if (val >= 0.4) return 'text-amber-400';
    return 'text-slate-500';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-hidden">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#121214] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Database className="text-cyan-400" size={20} />
          <div>
            <h1 className="text-sm font-bold font-mono tracking-tight text-white uppercase">
              Synaptic Substrate & MCP Workspace
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Observation · Telemetry · Diagnostic Matrix
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1 bg-black/40 p-1 border border-white/5 rounded-xl">
          <button
            onClick={() => setActiveTab('vault')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'vault'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sliders size={13} />
            Synaptic Vault
          </button>
          <button
            onClick={() => setActiveTab('db')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'db'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <HardDrive size={13} />
            Database Matrix
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'mcp'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Terminal size={13} />
            MCP Deck
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {/* TAB 1: SYNAPTIC VAULT */}
          {activeTab === 'vault' && (
            <motion.div
              key="vault"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden"
            >
              {/* Left Column: Form */}
              <div className="md:w-96 p-6 shrink-0 flex flex-col overflow-y-auto scrollbar-hide space-y-6">
                <div>
                  <h2 className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                    <Activity size={12} className="text-cyan-400" />
                    Synaptic Injector
                  </h2>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Manually inject research hints or memories into the inner spiral substrate.
                  </p>
                </div>

                <form onSubmit={handleInject} className="space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                      Context / Data Payload
                    </label>
                    <textarea
                      value={formData.data}
                      onChange={(e) => setFormData((prev) => ({ ...prev, data: e.target.value }))}
                      required
                      placeholder="Enter factual data, concepts, or logs..."
                      rows={4}
                      className="w-full bg-[#161618] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          Dopamine
                        </label>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold">
                          {formData.dopamine.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={formData.dopamine}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, dopamine: parseFloat(e.target.value) }))
                        }
                        className="w-full appearance-none bg-white/10 h-1 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                      <span className="text-[8px] text-slate-600">Retention weight</span>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          Cortisol
                        </label>
                        <span className="text-[10px] font-mono text-red-400 font-bold">
                          {formData.cortisol.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={formData.cortisol}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, cortisol: parseFloat(e.target.value) }))
                        }
                        className="w-full appearance-none bg-white/10 h-1 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                      <span className="text-[8px] text-slate-600">Eviction priority</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-y border-white/5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      Pinned Status
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.pinned || formData.dopamine >= 0.9}
                        disabled={formData.dopamine >= 0.9}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, pinned: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-cyan-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500/20 border border-white/15"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                      Provenance Origin
                    </label>
                    <input
                      type="text"
                      value={formData.provenance}
                      onChange={(e) => setFormData((prev) => ({ ...prev, provenance: e.target.value }))}
                      placeholder="e.g. manual, SAGE-7, grok"
                      className="w-full bg-[#161618] border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isInjecting || !formData.data.trim()}
                    className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono font-bold text-cyan-400 hover:bg-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isInjecting ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        Injecting context...
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" />
                        Inject Context Node
                      </>
                    )}
                  </button>
                </form>

                {injectResult && (
                  <div
                    className={`p-3 rounded-xl border text-[10px] font-mono ${
                      injectResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}
                  >
                    <div className="flex gap-2">
                      <Info size={14} className="shrink-0" />
                      <span>{injectResult.msg}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
                    <h3 className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                      <Layers size={11} className="text-indigo-400" />
                      Substrate Allocation
                    </h3>
                    <div className="space-y-1 text-[9px] font-mono text-slate-500">
                      <div className="flex justify-between">
                        <span>inner_spiral (:memory:):</span>
                        <span className="text-slate-300 font-bold">{innerMemories.length} / 8</span>
                      </div>
                      <div className="flex justify-between">
                        <span>outer_sweep (durable):</span>
                        <span className="text-slate-300 font-bold">{outerMemories.length} records</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-white/5">
                        <span>Indexed seven:</span>
                        <span className="text-cyan-400 font-bold">{memoryCounts.seven}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Indexed adhd:</span>
                        <span className="text-indigo-400 font-bold">{memoryCounts.adhd}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Ledger (Read-Only) */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F11]">
                {/* Ledger Toolbar */}
                <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="text"
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      placeholder="Filter synapses..."
                      className="w-full bg-[#161618] border border-white/10 rounded-xl py-1.5 pl-9 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                    />
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
                    {/* Filters */}
                    <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
                      {(['all', 'inner', 'outer', 'pinned'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setLedgerFilter(filter)}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono capitalize transition-all ${
                            ledgerFilter === filter
                              ? 'bg-white/5 text-cyan-400 font-bold'
                              : 'text-slate-500 hover:text-slate-400'
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={loadLedgerData}
                      disabled={isRefreshingLedger}
                      className="p-1.5 rounded-lg bg-[#161618] border border-white/15 text-slate-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
                      title="Reload Ledger"
                    >
                      <RefreshCw size={13} className={isRefreshingLedger ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {/* Ledger List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {allFilteredMemories.length === 0 ? (
                    <div className="text-center py-12">
                      <Database size={24} className="text-slate-600 mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-slate-500 italic">No synaptic memories matching selection.</p>
                    </div>
                  ) : (
                    allFilteredMemories.map((node) => {
                      const provenanceName =
                        typeof node.provenance === 'object' && node.provenance
                          ? (node.provenance as Record<string, unknown>).source ?? JSON.stringify(node.provenance)
                          : node.provenance || 'system';
                      return (
                        <div
                          key={node.id}
                          className="bg-[#161618]/70 border border-white/5 rounded-xl p-4 space-y-3 relative overflow-hidden group hover:border-white/10 transition-colors"
                        >
                          {/* Top row */}
                          <div className="flex justify-between items-center text-[10px]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-cyan-400 font-bold">
                                #{node.id.split('_')[1]?.slice(-4) ?? node.id.slice(-4)}
                              </span>
                              <span
                                className={`text-[8px] uppercase tracking-wider font-mono font-bold px-1.5 py-0.5 rounded ${
                                  node.source === 'inner'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                }`}
                              >
                                {node.source}
                              </span>
                              {node.pinned && (
                                <span className="flex items-center gap-0.5 text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                                  <Pin size={8} className="rotate-45" /> PINNED
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 font-mono flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(node.timestamp).toLocaleString()}
                            </span>
                          </div>

                          {/* Data Body */}
                          <div className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap select-text selection:bg-cyan-500/20">
                            {String(node.data)}
                          </div>

                          {/* Footer row */}
                          <div className="flex items-center justify-between text-[9px] border-t border-white/5 pt-2 font-mono">
                            <div className="flex gap-4">
                              <span>
                                Dopamine:{' '}
                                <span className={getDopamineColor(node.dopamine)}>
                                  {node.dopamine.toFixed(2)}
                                </span>
                              </span>
                              <span>
                                Cortisol:{' '}
                                <span className={getCortisolColor(node.cortisol)}>
                                  {node.cortisol.toFixed(2)}
                                </span>
                              </span>
                            </div>
                            <span className="text-slate-500 italic max-w-xs truncate" title={String(provenanceName)}>
                              Prov: {String(provenanceName)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: DATABASE MATRIX */}
          {activeTab === 'db' && (
            <motion.div
              key="db"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden"
            >
              {/* Diagnostic Tools Panel */}
              <div className="md:w-96 p-6 shrink-0 flex flex-col overflow-y-auto scrollbar-hide space-y-6">
                <div>
                  <h2 className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                    <HardDrive size={12} className="text-cyan-400" />
                    Database Diagnostics
                  </h2>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Perform low-level diagnostic tests and maintenance sweeps directly on SQLite backends.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">
                    Maintenance Console
                  </h3>

                  <button
                    onClick={() => runDbAction('integrity')}
                    disabled={isDbWorking !== null}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/40 text-left text-xs font-mono transition-all flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Shield size={13} className="text-cyan-400" />
                      Verify DB Integrity
                    </span>
                    {isDbWorking === 'integrity' ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Play size={10} className="text-slate-500" />
                    )}
                  </button>

                  <button
                    onClick={() => runDbAction('fts-sync')}
                    disabled={isDbWorking !== null}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/40 text-left text-xs font-mono transition-all flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <RefreshCw size={13} className="text-indigo-400" />
                      Rebuild Search Index
                    </span>
                    {isDbWorking === 'fts-sync' ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Play size={10} className="text-slate-500" />
                    )}
                  </button>

                  <button
                    onClick={() => runDbAction('vacuum')}
                    disabled={isDbWorking !== null}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/40 text-left text-xs font-mono transition-all flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Cpu size={13} className="text-amber-400" />
                      Vacuum & Compact DB
                    </span>
                    {isDbWorking === 'vacuum' ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Play size={10} className="text-slate-500" />
                    )}
                  </button>
                </div>

                {/* DB Logs */}
                <div className="flex-1 flex flex-col min-h-[200px] border border-white/5 rounded-xl bg-black/40 p-4 space-y-3 overflow-hidden">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 shrink-0">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">
                      Diagnostic Logs
                    </span>
                    {dbActionLogs.length > 0 && (
                      <button
                        onClick={() => setDbActionLogs([])}
                        className="text-[9px] text-slate-500 hover:text-slate-300 font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto font-mono text-[9px] space-y-2.5 scrollbar-hide pr-1">
                    {dbActionLogs.length === 0 ? (
                      <div className="text-slate-600 italic py-4">Logs empty. Trigger diagnostics above.</div>
                    ) : (
                      dbActionLogs.map((log, idx) => (
                        <div key={idx} className="border-b border-white/5 pb-1.5 last:border-b-0">
                          <div className="flex justify-between text-slate-500 mb-0.5">
                            <span>[{log.time}]</span>
                            <span
                              className={
                                log.status === 'success'
                                  ? 'text-emerald-400'
                                  : log.status === 'error'
                                    ? 'text-red-400 font-bold'
                                    : 'text-cyan-400'
                              }
                            >
                              {log.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-slate-300 break-words leading-tight">{log.msg}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Context Logs */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F11]">
                <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-slate-500" />
                    <h3 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
                      Real-time Context Logs
                    </h3>
                    <span className="text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                      FIFO Queue: Max 100
                    </span>
                  </div>
                  <button
                    onClick={loadContextLogs}
                    className="p-1.5 rounded-lg bg-[#161618] border border-white/15 text-slate-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
                    title="Refresh logs"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 font-mono text-[10px] space-y-2 select-text">
                  {contextLogs.length === 0 ? (
                    <div className="text-center py-12">
                      <Terminal size={24} className="text-slate-600 mx-auto mb-2 opacity-50" />
                      <p className="text-[10px] text-slate-500 italic">Context buffer empty or loading...</p>
                    </div>
                  ) : (
                    contextLogs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-[#161618]/50 border border-white/5 rounded-xl p-3 flex gap-4 hover:bg-[#161618]/80 transition-colors"
                      >
                        <div className="text-slate-500 shrink-0 text-right w-16">
                          {new Date(log.added_at).toLocaleTimeString()}
                        </div>
                        <div className="text-slate-300 break-all leading-normal flex-1">
                          {log.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: MCP DECK */}
          {activeTab === 'mcp' && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden"
            >
              {/* Left Column: Servers List */}
              <div className="md:w-80 p-6 shrink-0 flex flex-col overflow-y-auto scrollbar-hide space-y-4">
                <div>
                  <h2 className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                    <Cpu size={12} className="text-cyan-400" />
                    MCP Configuration Matrix
                  </h2>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Inspect the status and active schemas of the configured Model Context Protocol servers.
                  </p>
                </div>

                <div className="space-y-2">
                  {isMcpLoading ? (
                    <div className="text-center py-6">
                      <RefreshCw className="animate-spin text-cyan-400 mx-auto mb-2" size={18} />
                      <span className="text-[10px] text-slate-500 font-mono">Querying servers...</span>
                    </div>
                  ) : mcpServers.length === 0 ? (
                    <div className="text-slate-500 italic text-[10px]">No MCP servers found.</div>
                  ) : (
                    mcpServers.map((server) => (
                      <div
                        key={server.id}
                        onClick={() => setSelectedMcpServer(server)}
                        className={`w-full p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          selectedMcpServer?.id === server.id
                            ? 'bg-cyan-500/10 border-cyan-500/30'
                            : 'bg-white/5 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-200 truncate pr-2 font-mono">
                            {server.name}
                          </span>
                          <span
                            className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              server.connected
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : server.enabled
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-slate-500/15 text-slate-500'
                            }`}
                          >
                            {server.connected ? 'CONNECTED' : server.enabled ? 'STANDBY' : 'DISABLED'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                          <span>transport: {server.transport}</span>
                          {server.connected && <span>{server.tools.length} tools</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <button
                  onClick={loadMcpData}
                  disabled={isMcpLoading}
                  className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono font-bold text-slate-400 hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0"
                >
                  <RefreshCw size={12} className={isMcpLoading ? 'animate-spin' : ''} />
                  Refresh Telemetry
                </button>
              </div>

              {/* Right Column: Selected Server Details */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F11]">
                {selectedMcpServer ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* Server Info Top Header */}
                    <div className="p-6 border-b border-white/5 bg-[#121214]/30 shrink-0 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-sm font-bold text-white font-mono">{selectedMcpServer.name}</h3>
                          <p className="text-[10px] text-slate-500 font-mono">id: {selectedMcpServer.id}</p>
                        </div>
                        {selectedMcpServer.note && (
                          <div className="text-[9px] text-slate-400 bg-white/5 px-2.5 py-1.5 rounded-lg max-w-sm border border-white/5">
                            {selectedMcpServer.note}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-4 text-[9px] text-slate-500 font-mono pt-1">
                        <div>
                          Transport:{' '}
                          <span className="text-slate-300 font-bold uppercase">
                            {selectedMcpServer.transport}
                          </span>
                        </div>
                        <div>
                          State:{' '}
                          <span
                            className={
                              selectedMcpServer.connected
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-400 font-bold'
                            }
                          >
                            {selectedMcpServer.connected ? 'CONNECTED' : 'DISCONNECTED'}
                          </span>
                        </div>
                        {selectedMcpServer.autoEnable && (
                          <div className="text-cyan-400">Auto-enables on path availability</div>
                        )}
                      </div>
                    </div>

                    {/* Tools list */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      <div>
                        <h4 className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-3 font-mono">
                          Discovered Tools ({selectedMcpServer.tools.length})
                        </h4>

                        {selectedMcpServer.tools.length === 0 ? (
                          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-slate-500 italic text-[10px]">
                            {selectedMcpServer.connected
                              ? 'No tools declared by this server.'
                              : 'Connect server to discover available tool schemas.'}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {selectedMcpServer.tools.map((tool) => (
                              <div
                                key={tool.name}
                                className="bg-[#161618] border border-white/5 rounded-xl p-4 space-y-3 hover:border-white/10 transition-colors"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-white/5">
                                  <span className="font-mono text-cyan-400 font-bold text-xs">
                                    {tool.name}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono uppercase bg-white/5 px-2 py-0.5 rounded">
                                    Tool Call Definition
                                  </span>
                                </div>

                                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                  {tool.description}
                                </p>

                                {tool.parameters && (
                                  <div className="space-y-1.5 pt-1">
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">
                                      Parameters schema:
                                    </span>
                                    <pre className="bg-black/30 p-3 rounded-lg border border-white/5 text-[9px] font-mono text-slate-400 overflow-x-auto select-text">
                                      {JSON.stringify(tool.parameters, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center p-6">
                    <div>
                      <Cpu size={32} className="text-slate-600 mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-slate-500 italic">Select an MCP server from the config matrix to inspect tools.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MemoryWorkspace;
