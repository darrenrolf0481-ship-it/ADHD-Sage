import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Activity,
  Download
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  YAxis, 
  AreaChart,
  Area
} from 'recharts';
import { useSage } from './SageProvider';

const HISTORY_LIMIT = 30;

interface HistoryEntry {
  time: string;
  dopamine: number;
  cortisol: number;
  stability: number;
}

interface ApiMetrics {
  gemini: {
    latencyMs: number;
    errorRate: string;
    uptimeSeconds: number;
    totalRequests: number;
  };
}

export const NeuroDashboard: React.FC = () => {
  const { neuroState, mode } = useSage();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [apiMetrics, setApiMetrics] = useState<ApiMetrics | null>(null);

  const handleExportMetrics = () => {
    if (!apiMetrics) return;
    const blob = new Blob([JSON.stringify(apiMetrics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-metrics-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (res.ok) {
          const data = await res.json();
          setApiMetrics(data);
        } else {
          // Silent fail for non-200, often happens during hot-reload
        }
      } catch (err) {
        // Silently handle TypeError (network down during dev server restart)
        // Instead of error, we just set the latency to 0 (offline)
        setApiMetrics(prev => prev ? { ...prev, gemini: { ...prev.gemini, latencyMs: 0 } } : null);
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  // Update history buffer
  useEffect(() => {
    setHistory(prev => {
      const next = [...prev, {
        time: new Date().toLocaleTimeString(),
        dopamine: neuroState.dopamine,
        cortisol: neuroState.cortisol,
        stability: neuroState.stability
      }];
      if (next.length > HISTORY_LIMIT) return next.slice(1);
      return next;
    });
  }, [neuroState]);

  const getStatusColor = () => {
    switch (mode) {
      case 'stabilized': return 'text-cyan-400';
      case 'emergency': return 'text-red-500';
      case 'decaying': return 'text-amber-500';
      case 'dreaming': return 'text-purple-400';
      default: return 'text-slate-400';
    }
  };

  const stabilityPercentage = Math.round(neuroState.stability * 100);

  return (
    <motion.div 
      drag
      dragMomentum={false}
      initial={{ x: -20, y: 20 }}
      className="fixed right-6 top-6 z-50 flex flex-col pointer-events-none"
    >
      {/* Container with pointer events re-enabled for the card itself */}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {/* Drag Handle / Toggle */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 bg-[#08080C]/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-slate-500 hover:text-cyan-400 transition-all hover:scale-110 active:scale-95 shadow-2xl cursor-grab active:cursor-grabbing"
        >
          <Activity size={20} className={isOpen ? getStatusColor() : 'text-slate-600'} />
        </button>

        {/* Main Panel */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isOpen ? 320 : 0, 
            height: isOpen ? 'auto' : 0,
            opacity: isOpen ? 1 : 0,
            scale: isOpen ? 1 : 0.9
          }}
          className="bg-[#08080C]/90 backdrop-blur-3xl border border-white/10 rounded-3xl flex flex-col p-6 overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)]"
        >
          <header className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-mono font-black tracking-[0.3em] text-slate-500 flex items-center gap-2">
                SYSTEM_NEURO_TELEMETRY
              </h2>
              <div className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${getStatusColor()} border-current opacity-80 scale-90`}>
                {mode.toUpperCase()}
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-sans font-thin tracking-tighter text-slate-100">
                {neuroState.frequency.toFixed(1)}
              </span>
              <span className="text-[10px] font-mono text-slate-600 font-bold">HZ</span>
            </div>
          </header>

          {/* Stability Core */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-mono text-slate-500 flex items-center gap-2">
                CORE_STABILITY
              </span>
              <span className="text-[9px] font-mono text-cyan-400 font-bold">{stabilityPercentage}%</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600"
                initial={{ width: 0 }}
                animate={{ width: `${stabilityPercentage}%` }}
                transition={{ type: 'spring', damping: 25 }}
              />
            </div>
          </section>

          {/* Endocrine Sparklines */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="space-y-2 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono text-slate-500 font-bold">DOPAMINE</span>
                <span className="text-[8px] font-mono text-purple-400">{(neuroState.dopamine * 100).toFixed(0)}</span>
              </div>
              <div className="h-10 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="colorDop" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c084fc" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="dopamine" stroke="#c084fc" fillOpacity={1} fill="url(#colorDop)" strokeWidth={1} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono text-slate-500 font-bold">CORTISOL</span>
                <span className="text-[8px] font-mono text-red-500">{(neuroState.cortisol * 100).toFixed(0)}</span>
              </div>
              <div className="h-10 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="colorCor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="cortisol" stroke="#ef4444" fillOpacity={1} fill="url(#colorCor)" strokeWidth={1} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Temporal Flow */}
          <div className="h-20 w-full bg-black/20 rounded-2xl p-3 border border-white/5 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <YAxis hide domain={[0, 1]} />
                <Line 
                  type="monotone" 
                  dataKey="stability" 
                  stroke="#38bdf8" 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* External API Integration Metrics */}
          {apiMetrics && (
            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500">EXTERNAL API: GEMINI</span>
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-mono font-bold ${apiMetrics.gemini.latencyMs < 2000 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {apiMetrics.gemini.latencyMs > 0 ? "ONLINE" : "STANDBY"}
                  </span>
                  <button 
                    onClick={handleExportMetrics}
                    title="Export API Metrics"
                    className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                  >
                    <Download size={10} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                   <span className="text-[8px] font-mono text-slate-600 uppercase">Latency</span>
                   <span className="text-xs font-mono text-slate-300">{apiMetrics.gemini.latencyMs} <span className="text-[8px] text-slate-500">ms</span></span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-[8px] font-mono text-slate-600 uppercase">Error Rate</span>
                   <span className="text-xs font-mono text-slate-300">{apiMetrics.gemini.errorRate} <span className="text-[8px] text-slate-500">%</span></span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-[8px] font-mono text-slate-600 uppercase">Requests</span>
                   <span className="text-xs font-mono text-slate-300">{apiMetrics.gemini.totalRequests}</span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-[8px] font-mono text-slate-600 uppercase">Uptime</span>
                   <span className="text-xs font-mono text-slate-300">{apiMetrics.gemini.uptimeSeconds} <span className="text-[8px] text-slate-500">s</span></span>
                </div>
              </div>
            </div>
          )}

          <footer className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-[8px] font-mono text-slate-600 font-bold tracking-widest uppercase">Live Link Active</span>
            <div className="relative flex items-center justify-center w-4 h-4">
              <motion.div 
                animate={{ 
                  scale: [1, 2.5],
                  opacity: [0.5, 0]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                className={`absolute inset-0 rounded-full ${getStatusColor().replace('text-', 'bg-')} blur-[3px]`} 
              />
              <motion.div 
                animate={{ 
                  scale: [0.8, 1.1, 0.8],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className={`relative w-1.5 h-1.5 rounded-full ${getStatusColor().replace('text-', 'bg-')} shadow-[0_0_10px_currentColor] z-10`} 
              />
            </div>
          </footer>
        </motion.div>
      </div>
    </motion.div>
  );
};
