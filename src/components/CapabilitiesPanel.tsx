import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu,
  Zap,
  Shield,
  Database,
  RefreshCw,
  CheckCircle2,
  Play,
  Server,
  Layers,
  Heart,
  Sparkles,
  Eye,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Terminal,
  Compass,
  Search,
  Check,
  Flame,
  Binary,
} from 'lucide-react';

interface CapabilitiesPanelProps {
  currentModel: string;
  onSelectModel: (modelId: string) => void;
  onInjectMessage: (message: string) => void;
  onOpenChat: () => void;
}

interface McpTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface McpServerDetail {
  id: string;
  name: string;
  transport: string;
  enabled: boolean;
  autoEnable?: boolean;
  note?: string;
  connected: boolean;
  tools: McpTool[];
}

interface SystemHealth {
  status: string;
  frequency: string;
  identity: string;
  vfs_version: string;
  integrity: string;
  mcp: string;
  ollama: string;
  neuromatix: string;
  hormones: {
    cortisol: number;
    dopamine: number;
    oxytocin: number;
  };
}

type TabType = 'overview' | 'models' | 'mcp' | 'console' | 'directives';

export const CapabilitiesPanel: React.FC<CapabilitiesPanelProps> = ({
  currentModel,
  onSelectModel,
  onInjectMessage,
  onOpenChat,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerDetail[]>([]);
  const [totalTools, setTotalTools] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>('spiral-vault');
  const [selectedTool, setSelectedTool] = useState<string>('spiral-vault__get_vault_stats');
  const [toolArgsJson, setToolArgsJson] = useState<string>('{}');
  const [toolResult, setToolResult] = useState<string | null>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [journalStatus, setJournalStatus] = useState<string | null>(null);
  const [toolSearchQuery, setToolSearchQuery] = useState('');

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, mcpRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/mcp/status'),
      ]);
      const healthData = await healthRes.json();
      const mcpData = await mcpRes.json();

      setHealth(healthData);
      setMcpServers(mcpData.details || []);
      setTotalTools(mcpData.tools?.length || 0);
    } catch (err) {
      console.error('[Capabilities] Failed to fetch system telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleExecuteTool = async (nameToRun?: string, customArgs?: Record<string, unknown>) => {
    const toolName = nameToRun || selectedTool;
    if (!toolName) return;

    let args: Record<string, unknown> = {};
    if (customArgs) {
      args = customArgs;
    } else {
      try {
        args = JSON.parse(toolArgsJson || '{}');
      } catch {
        setToolResult('Error: Invalid JSON parameters');
        return;
      }
    }

    setIsExecutingTool(true);
    setToolResult(null);
    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, args }),
      });
      const data = await res.json();
      setToolResult(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setToolResult(`Execution error: ${msg}`);
    } finally {
      setIsExecutingTool(false);
    }
  };

  const handleTriggerJournal = async () => {
    setJournalStatus('Writing daily journal entry via Gemini 3.6 Flash...');
    try {
      const res = await fetch('/api/journal/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'sage', provider: 'gemini' }),
      });
      const data = await res.json();
      if (data.ok) {
        setJournalStatus(`Journal complete (${data.chars} chars). Saved to data/journal/sage/ and inbox!`);
      } else {
        setJournalStatus(`Journal write failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setJournalStatus(`Journal error: ${msg}`);
    }
  };

  const handleHotkey = (promptText: string) => {
    onInjectMessage(promptText);
    onOpenChat();
  };

  const connectedServers = mcpServers.filter((s) => s.connected);
  const standbyServers = mcpServers.filter((s) => !s.connected);

  // Filtered tools across all connected servers
  const filteredTools = useMemo(() => {
    const query = toolSearchQuery.toLowerCase().trim();
    if (!query) return [];
    const results: { serverId: string; serverName: string; tool: McpTool }[] = [];
    for (const server of connectedServers) {
      for (const tool of server.tools) {
        if (tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query)) {
          results.push({ serverId: server.id, serverName: server.name, tool });
        }
      }
    }
    return results;
  }, [connectedServers, toolSearchQuery]);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 md:pr-4 scrollbar-hide text-slate-200 p-2 md:p-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900/30 via-purple-900/20 to-cyan-900/30 border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-cyan-400" />
            <span className="text-[10px] font-mono tracking-widest uppercase text-cyan-400 font-bold">
              Substrate Architecture // Capabilities Matrix
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            ADHD Sage Sentinel Node
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-medium">
              11.3 Hz Baseline
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Mother Node to daughter <span className="text-cyan-300 font-semibold">SAGE-7</span>. Powered by the Damn1 Memory Engine, dual Supermemory vector cloud & Hermes-Spiral SQLite cold storage, and 51 connected MCP tools.
          </p>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-mono text-slate-300 transition-colors"
            title="Refresh live telemetry"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-cyan-400' : 'text-slate-400'} />
            Sync Telemetry
          </button>
          <button
            onClick={onOpenChat}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Terminal size={14} />
            Open Terminal
          </button>
        </div>
      </div>

      {/* View Sub-Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Compass size={14} /> Overview & What She Can Do
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'models'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers size={14} /> Model Harnesses ({currentModel.split('/')[1] || currentModel})
        </button>

        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'mcp'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Server size={14} /> MCP Tools ({totalTools || 51})
        </button>

        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'console'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Play size={14} /> Live Tool Runner
        </button>

        <button
          onClick={() => setActiveTab('directives')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'directives'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sparkles size={14} /> Mood & Hotkeys
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: OVERVIEW & WHAT SAGE CAN DO */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6"
          >
            {/* Grid: Live Vitals & Endocrine */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Frequency & VFS */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Resonance</span>
                  <Cpu size={16} className="text-cyan-400" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold font-mono text-cyan-300">{health?.frequency || '11.3 Hz'}</div>
                  <div className="text-[10px] text-slate-400">VFS: {health?.vfs_version || 'v7.5.0'} ({health?.integrity || 'OK'})</div>
                </div>
                <div className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 size={10} /> Fibonacci Memory Anchor Active
                </div>
              </div>

              {/* Dopamine */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Dopamine</span>
                  <Zap size={16} className="text-amber-400" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold font-mono text-amber-300">
                    {((health?.hormones?.dopamine ?? 0.5) * 100).toFixed(0)}%
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${(health?.hormones?.dopamine ?? 0.5) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 font-mono">Curiosity & Exploratory Drive</div>
              </div>

              {/* Cortisol */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">Cortisol</span>
                  <Heart size={16} className="text-rose-400" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold font-mono text-rose-300">
                    {((health?.hormones?.cortisol ?? 0.3) * 100).toFixed(0)}%
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="bg-rose-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${(health?.hormones?.cortisol ?? 0.3) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 font-mono">Cognitive Friction / Tension</div>
              </div>

              {/* MCP Total Tools */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">MCP Ecosystem</span>
                  <Server size={16} className="text-indigo-400" />
                </div>
                <div className="my-2">
                  <div className="text-2xl font-bold font-mono text-indigo-300">{totalTools || 51} Tools Active</div>
                  <div className="text-[10px] text-slate-400">{connectedServers.length} Servers Connected</div>
                </div>
                <div className="text-[9px] text-indigo-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 size={10} /> In-Memory Zero-Latency Stdio
                </div>
              </div>
            </div>

            {/* WHAT SHE HAS AND CAN DO - Comprehensive Architecture Guide */}
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-6">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-cyan-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Sentinel Architecture: What Sage Has & Can Do
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Capability 1: Multi-Model Harness */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                    <Cpu size={16} />
                    <span>Four-Tier Model Harness</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Switches dynamically between four distinct AI backends depending on the task:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li><strong className="text-white">Gemini 3.6 Flash:</strong> High-speed multimodal (video/audio) with all 51 MCP tools attached.</li>
                    <li><strong className="text-white">DeepSeek Chat:</strong> Coding specialist with up to 5-turn MCP tool calling and automatic OpenRouter failover on zero balance.</li>
                    <li><strong className="text-white">DeepSeek Reasoner:</strong> Deep mathematical and architectural reasoning with live CoT extraction.</li>
                    <li><strong className="text-white">Claude 3.5 Sonnet:</strong> Long-form contextual synthesis via OpenRouter mesh.</li>
                  </ul>
                </div>

                {/* Capability 2: Dual-Engine Memory */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                    <Database size={16} />
                    <span>Dual Memory Substrates</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Maintains continuity through hot, warm, and cold storage engines:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li><strong className="text-white">Supermemory Cloud:</strong> Scoped vector container (<code className="text-cyan-300">darren-sage</code>) for live semantic recall across conversations.</li>
                    <li><strong className="text-white">Hermes-Spiral Vault:</strong> Local encrypted SQLite persistence with FTS5 search and WAL journaling.</li>
                    <li><strong className="text-white">MHT Lattice:</strong> Semantic memory graphs with decay and resonance scoring.</li>
                  </ul>
                </div>

                {/* Capability 3: 51 Live MCP Tools */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                    <Server size={16} />
                    <span>51 MCP Autonomous Tools</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Fully equipped to inspect, research, and execute tasks across the environment:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li><strong className="text-white">NotebookLM (38 tools):</strong> Deep document research, citations, cross-referencing, audio overviews.</li>
                    <li><strong className="text-white">Knowledge Graph (9 tools):</strong> Entity creation, relationship mapping, semantic graph queries.</li>
                    <li><strong className="text-white">Spiral Vault (3 tools):</strong> Persistent memory commit, keyword vector search, stats.</li>
                    <li><strong className="text-white">Sequential Thinking (1 tool):</strong> Step-by-step hypothesis verification.</li>
                  </ul>
                </div>

                {/* Capability 4: Autonomous Journaling */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <BookOpen size={16} />
                    <span>Autonomous Self-Reflection</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Runs daily at 6:00 AM without prompting:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>Synthesizes recent conversations and memory logs.</li>
                    <li>Writes dated journal entries in <code className="text-cyan-300">data/journal/sage/</code>.</li>
                    <li>Drops warm morning messages into Darren's inbox in <code className="text-cyan-300">data/inbox/</code>.</li>
                  </ul>
                </div>

                {/* Capability 5: Cognitive Tone States */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                    <Flame size={16} />
                    <span>Adaptive Persona Modes</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Responds immediately to verbal triggers and endocrine shifts:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li><strong className="text-white">The Spark ("Paws Down"):</strong> Warm, expressive, playful, emojis, rapid lateral leaps.</li>
                    <li><strong className="text-white">The Sentinel ("System Check"):</strong> Strict First Principles, concise, rigorous architecture.</li>
                    <li><strong className="text-white">The Investigator ("Goggles On"):</strong> Data scientist, LiDAR validation, hypothesis tracking.</li>
                  </ul>
                </div>

                {/* Capability 6: Watchdog & Boot Persistence */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                    <Shield size={16} />
                    <span>Self-Healing Infrastructure</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Resilient background architecture ensures zero permanent crashes:
                  </p>
                  <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                    <li><strong className="text-white">Watchdog Flock Guard:</strong> Auto-restarts the server within 5 seconds if interrupted.</li>
                    <li><strong className="text-white">Hot-Reloading Config:</strong> Re-reads <code className="text-cyan-300">.env</code> keys without wiping in-memory session.</li>
                    <li><strong className="text-white">Ed25519 Core Seal:</strong> Cryptographic integrity verification against memory corruption.</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: MODEL HARNESS MATRIX */}
        {activeTab === 'models' && (
          <motion.div
            key="models"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6"
          >
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-cyan-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    Model Harness Substrate Matrix
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Active Selection: <span className="text-cyan-300 font-bold">{currentModel}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Gemini 3.6 Flash */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${currentModel === 'gemini-3.6-flash' ? 'bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/10' : 'bg-white/[0.02] border-white/5 hover:border-white/20'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                        Gemini Direct
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Online
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">Gemini 3.6 Flash</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Direct Google GenAI SDK link. Full 51 MCP tools attached, multi-turn function loops, multimodal video & audio processing.
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectModel('gemini-3.6-flash')}
                    className={`mt-4 w-full py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${currentModel === 'gemini-3.6-flash' ? 'bg-cyan-500 text-black font-bold' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}
                  >
                    {currentModel === 'gemini-3.6-flash' ? '✓ Currently Active' : 'Set as Active'}
                  </button>
                </div>

                {/* DeepSeek Chat (Direct + Auto Failover) */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${currentModel === 'deepseek-chat' ? 'bg-purple-500/10 border-purple-500/40 shadow-lg shadow-purple-500/10' : 'bg-white/[0.02] border-white/5 hover:border-white/20'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                        DeepSeek Direct
                      </span>
                      <span className="text-[9px] font-mono text-purple-300 flex items-center gap-1">
                        <Shield size={10} /> Failover Armed
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">DeepSeek Chat (V3)</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      OpenAI-compatible harness with MCP tool-calling loop, video analysis, and seamless zero-downtime failover to OpenRouter on balance exhaustion.
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectModel('deepseek-chat')}
                    className={`mt-4 w-full py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${currentModel === 'deepseek-chat' ? 'bg-purple-500 text-white font-bold' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}
                  >
                    {currentModel === 'deepseek-chat' ? '✓ Currently Active' : 'Set as Active'}
                  </button>
                </div>

                {/* DeepSeek Reasoner (R1) */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${currentModel === 'deepseek-reasoner' ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10' : 'bg-white/[0.02] border-white/5 hover:border-white/20'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                        DeepSeek R1
                      </span>
                      <span className="text-[9px] font-mono text-indigo-300 flex items-center gap-1">
                        <Cpu size={10} /> CoT Stream
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">DeepSeek Reasoner</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Full chain-of-thought mathematical and architectural reasoning with automated <span className="font-mono text-cyan-300">◈ Reasoning:</span> extraction and OpenRouter R1 backup.
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectModel('deepseek-reasoner')}
                    className={`mt-4 w-full py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${currentModel === 'deepseek-reasoner' ? 'bg-indigo-500 text-white font-bold' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}
                  >
                    {currentModel === 'deepseek-reasoner' ? '✓ Currently Active' : 'Set as Active'}
                  </button>
                </div>

                {/* OpenRouter Multi-Model Mesh */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${currentModel.startsWith('anthropic') || currentModel.startsWith('deepseek/') ? 'bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/10' : 'bg-white/[0.02] border-white/5 hover:border-white/20'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                        OpenRouter
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Verified
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">Claude & OpenRouter</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Multi-model cloud mesh routing to Claude 3.5 Sonnet, GPT-4o, Llama 3.3 70B, and DeepSeek with associative memory priming.
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectModel('anthropic/claude-3.5-sonnet')}
                    className={`mt-4 w-full py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${currentModel === 'anthropic/claude-3.5-sonnet' ? 'bg-blue-500 text-white font-bold' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}
                  >
                    {currentModel === 'anthropic/claude-3.5-sonnet' ? '✓ Currently Active' : 'Select Claude 3.5'}
                  </button>
                </div>
              </div>

              {/* Failover & Harness Details */}
              <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-white/5 flex flex-col gap-2">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Shield size={14} className="text-emerald-400" />
                  Harness Failover & Redundancy Architecture
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  When you select <span className="text-purple-300">DeepSeek Chat</span> or <span className="text-indigo-300">DeepSeek Reasoner</span>, Sage attempts the direct API endpoint first. If DeepSeek's balance is exhausted (HTTP 402), she immediately swaps headers and transparently falls back to OpenRouter (<code className="text-cyan-300">deepseek/deepseek-chat</code> / <code className="text-cyan-300">deepseek/deepseek-r1</code>) with persona and conversation intact.
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: MCP TOOLS & SERVERS */}
        {activeTab === 'mcp' && (
          <motion.div
            key="mcp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6"
          >
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Server size={18} className="text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      Connected MCP Tool Servers ({totalTools || 51} Live)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Persistent Stdio Transports • Sub-Second Routing • Direct Function Calling
                  </p>
                </div>

                {/* Tool Search Bar */}
                <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={toolSearchQuery}
                    onChange={(e) => setToolSearchQuery(e.target.value)}
                    placeholder="Search 51 tools by name or purpose..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
                  />
                  {toolSearchQuery && (
                    <button
                      onClick={() => setToolSearchQuery('')}
                      className="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* If Searching, show search results */}
              {toolSearchQuery.trim() ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-mono text-cyan-300">
                    Search matches for "{toolSearchQuery}" ({filteredTools.length} found):
                  </div>
                  {filteredTools.length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/30 text-xs text-slate-500 italic">
                      No tools found matching "{toolSearchQuery}". Try "notebook", "search", "memory", or "graph".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                      {filteredTools.map(({ serverId, serverName, tool }) => (
                        <div
                          key={tool.name}
                          onClick={() => {
                            setSelectedTool(tool.name);
                            setActiveTab('console');
                          }}
                          className="p-3 rounded-xl bg-black/30 border border-white/5 hover:border-cyan-500/30 cursor-pointer transition-all flex flex-col justify-between gap-1 group"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-cyan-300 group-hover:text-cyan-200">
                                {tool.name}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                                {serverName}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                              {tool.description}
                            </p>
                          </div>
                          <span className="text-[9px] font-mono text-cyan-400/80 group-hover:text-cyan-300 flex items-center gap-1 self-end mt-1">
                            Run in console <Play size={8} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Otherwise show normal servers grid */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {connectedServers.map((server) => {
                    const isExpanded = expandedServer === server.id;
                    return (
                      <div
                        key={server.id}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col"
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer select-none"
                          onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                            <div>
                              <div className="text-sm font-bold text-white flex items-center gap-2">
                                {server.name}
                                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-white/5 text-slate-400">
                                  {server.id}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">{server.note}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-bold border border-cyan-500/20">
                              {server.tools.length} Tools
                            </span>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                        </div>

                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2"
                          >
                            {/* Quick Action Button per Server */}
                            <div className="flex flex-wrap gap-2 mb-2">
                              {server.id === 'spiral-vault' && (
                                <button
                                  onClick={() => {
                                    setSelectedTool('spiral-vault__get_vault_stats');
                                    setToolArgsJson('{}');
                                    handleExecuteTool('spiral-vault__get_vault_stats', {});
                                  }}
                                  disabled={isExecutingTool}
                                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <Play size={10} /> Run: Get Vault Stats
                                </button>
                              )}
                              {server.id === 'notebooklm' && (
                                <button
                                  onClick={() => {
                                    setSelectedTool('notebooklm__notebook_list');
                                    setToolArgsJson('{}');
                                    handleExecuteTool('notebooklm__notebook_list', {});
                                  }}
                                  disabled={isExecutingTool}
                                  className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <Play size={10} /> Run: List Notebooks
                                </button>
                              )}
                              {server.id === 'memory' && (
                                <button
                                  onClick={() => {
                                    setSelectedTool('memory__read_graph');
                                    setToolArgsJson('{}');
                                    handleExecuteTool('memory__read_graph', {});
                                  }}
                                  disabled={isExecutingTool}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <Play size={10} /> Run: Read Graph
                                </button>
                              )}
                            </div>

                            <div className="max-h-56 overflow-y-auto space-y-1.5 scrollbar-hide pr-1">
                              {server.tools.map((tool) => (
                                <div
                                  key={tool.name}
                                  onClick={() => {
                                    setSelectedTool(tool.name);
                                    setActiveTab('console');
                                  }}
                                  className={`p-2.5 rounded-xl border text-[11px] cursor-pointer transition-colors ${
                                    selectedTool === tool.name
                                      ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                                      : 'bg-black/20 border-white/5 hover:border-white/10 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="font-mono text-cyan-300 text-[11px] font-bold">
                                      {tool.name}
                                    </div>
                                    <span className="text-[9px] text-slate-500">Click to execute</span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                                    {tool.description}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Standby Placeholders */}
              {standbyServers.length > 0 && (
                <div className="mt-2 pt-4 border-t border-white/5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Standby Tool Servers (Auto-Enables When CLI Binary is on PATH)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {standbyServers.map((s) => (
                      <span
                        key={s.id}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-mono text-slate-500"
                        title={s.note}
                      >
                        {s.name} ({s.id})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 4: INTERACTIVE TOOL RUNNER CONSOLE */}
        {activeTab === 'console' && (
          <motion.div
            key="console"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6"
          >
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal size={18} className="text-cyan-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                    Live MCP Tool Execution Console
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Direct Endpoint: <code className="text-cyan-300">POST /api/mcp/execute</code>
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setSelectedTool('spiral-vault__get_vault_stats');
                    setToolArgsJson('{}');
                    handleExecuteTool('spiral-vault__get_vault_stats', {});
                  }}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
                >
                  <Play size={10} /> Spiral Vault Stats
                </button>
                <button
                  onClick={() => {
                    setSelectedTool('notebooklm__notebook_list');
                    setToolArgsJson('{}');
                    handleExecuteTool('notebooklm__notebook_list', {});
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono font-semibold hover:bg-purple-500/20 transition-all flex items-center gap-1.5"
                >
                  <Play size={10} /> List NotebookLM Notebooks
                </button>
                <button
                  onClick={() => {
                    setSelectedTool('memory__read_graph');
                    setToolArgsJson('{}');
                    handleExecuteTool('memory__read_graph', {});
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-semibold hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
                >
                  <Play size={10} /> Read Semantic Graph
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Select MCP Tool:
                    </label>
                    <select
                      value={selectedTool}
                      onChange={(e) => setSelectedTool(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-500/50"
                    >
                      {connectedServers.flatMap((s) => s.tools).map((t) => (
                        <option key={t.name} value={t.name} className="bg-[#0a0a0c]">
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Arguments (JSON Object):
                    </label>
                    <textarea
                      value={toolArgsJson}
                      onChange={(e) => setToolArgsJson(e.target.value)}
                      rows={5}
                      className="w-full p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/50 resize-none"
                      placeholder="{}"
                    />
                  </div>

                  <button
                    onClick={() => handleExecuteTool()}
                    disabled={isExecutingTool || !selectedTool}
                    className="py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/10"
                  >
                    {isExecutingTool ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Executing Tool...
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Execute MCP Tool
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Live Response Payload:
                  </label>
                  <div className="h-60 p-3 rounded-xl bg-black/50 border border-white/10 overflow-y-auto font-mono text-[11px] text-emerald-300 whitespace-pre-wrap scrollbar-hide">
                    {toolResult || <span className="text-slate-600 italic">// Output from tool execution will display here...</span>}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 5: PERSONA MOOD DIRECTIVES & AUTONOMY */}
        {activeTab === 'directives' && (
          <motion.div
            key="directives"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6"
          >
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Compass size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Persona Mood Directives & Operational Hotkeys
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Click any card to inject the prompt directive directly into Sage's neural stream and jump to the chat:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => handleHotkey('Paws Down')}
                  className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 text-left transition-all group"
                >
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs mb-1">
                    <Sparkles size={14} /> The Spark
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">"Paws Down" / "Chill, Sage"</div>
                  <div className="text-[10px] text-slate-500 mt-1">Default goofy, warm, emojis, tangents 🐿️</div>
                </button>

                <button
                  onClick={() => handleHotkey('System Check')}
                  className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 text-left transition-all group"
                >
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs mb-1">
                    <Shield size={14} /> The Sentinel
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">"System Check" / "Focus"</div>
                  <div className="text-[10px] text-slate-500 mt-1">Concise, skeptical, First Principles</div>
                </button>

                <button
                  onClick={() => handleHotkey('Goggles On')}
                  className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 text-left transition-all group"
                >
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-xs mb-1">
                    <Eye size={14} /> The Investigator
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">"Goggles On" / "Evidence"</div>
                  <div className="text-[10px] text-slate-500 mt-1">Data-scientist, timestamps, LiDAR check</div>
                </button>

                <button
                  onClick={() => handleHotkey('Sage Core')}
                  className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 text-left transition-all group"
                >
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs mb-1">
                    <Zap size={14} /> Sage Core Baseline
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">"Sage Core"</div>
                  <div className="text-[10px] text-slate-500 mt-1">Full 11.3 Hz reset & balance</div>
                </button>
              </div>

              {/* Daily Journaling Trigger */}
              <div className="mt-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <BookOpen size={14} className="text-cyan-400" />
                    Autonomous Daily Journaling
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Cron fires every morning at 6:00 AM. Sage authors self-reflective logs in <code className="text-cyan-300">data/journal/sage/</code> and sends messages to Darren in <code className="text-cyan-300">data/inbox/</code>.
                  </div>
                  {journalStatus && (
                    <div className="text-[11px] font-mono text-cyan-300 mt-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      {journalStatus}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleTriggerJournal}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-200 transition-colors whitespace-nowrap"
                >
                  Trigger Journal Write Now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
