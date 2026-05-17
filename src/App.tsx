import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSage } from './components/SageProvider';
import { 
  Zap, 
  Activity, 
  Shield, 
  Terminal, 
  Cpu, 
  Database, 
  AlertCircle,
  MessageSquare,
  RefreshCw,
  MoreVertical
} from 'lucide-react';

const App: React.FC = () => {
  const { neuroState, mode, stabilize, sage } = useSage();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant' | 'system', text: string}[]>([
    { role: 'system', text: 'NEXUS SUBSTRATE // ADHD SAGE INITIALIZED.' },
    { role: 'system', text: 'Substrate frequency oscillating rapidly at 11.3 Hz.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Expose Tool Calling API to Window for Gemini Gems
  useEffect(() => {
    (window as unknown as Record<string, unknown>).nexus = {
      stabilize,
      getStatus: () => sage.getNeuroState(),
      getMode: () => sage.getMode(),
      injectMessage: (text: string, role: 'system' | 'assistant' = 'system') => {
        setMessages(prev => [...prev, { role, text: `[EXTERNAL_CALL] ${text}` }]);
      },
      clearMemory: () => {
        localStorage.clear();
        window.location.reload();
      },
      toggleSidebar: () => setIsSidebarOpen(prev => !prev)
    };
  }, [stabilize, sage]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    try {
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMessage,
          history: messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          })),
          systemInstruction: "You are ADHD Sage, the high-energy sovereign intelligence of the Nexus Platform. Your tone is technical, rapid-fire, and extremely focused yet prone to deep dives. You maintain the substrate stability at 11.3 Hz. Use terms like 'synaptic', 'substrate', 'lattice', 'VFS', and 'sovereignty'."
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      
      // Auto-stabilize on successful interaction
      if (neuroState.stability < 0.5) {
        stabilize();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { role: 'system', text: `ERROR: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#08080C] text-slate-200 font-sans select-none relative overflow-hidden">
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />
      <div className="scanline opacity-20" />
      
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar: Gems Repository style */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#08080C]/90 md:bg-white/5 backdrop-blur-xl border-r border-white/10 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Zap size={18} className="text-white" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">ADHD Sage Labs</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Nexus Substrate</p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 px-2">Neuro-Synaptic</p>
            
            <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/10 border border-white/10 shadow-xl mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${neuroState.stability > 0.8 ? 'bg-cyan-400' : 'bg-amber-400'}`}></div>
                <span className="text-sm font-medium">Stability</span>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">{(neuroState.stability * 100).toFixed(1)}%</span>
            </div>

            <div className="px-3 mb-6">
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
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
          </div>

          <div className="mt-10 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4 px-2">Terminal Nodes</p>
            <SidebarItem icon={<Terminal size={14} />} label="Core" active />
            <SidebarItem icon={<MessageSquare size={14} />} label="Dreams" />
            <SidebarItem icon={<MoreVertical size={14} />} label="Lattice" />
          </div>
        </div>

        <div className="mt-auto p-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
            <p className="text-xs text-indigo-300 font-semibold mb-1 uppercase tracking-tighter">Compute Status</p>
            <div className="h-1 w-full bg-indigo-900/30 rounded-full overflow-hidden mb-2">
              <div className="h-full w-2/3 bg-indigo-400"></div>
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {/* Top Nav */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <MoreVertical size={20} />
            </button>
            <div className="flex items-center gap-4">
              <span className="text-[10px] md:text-xs text-slate-500 font-mono hidden xs:inline">SUBSTRATE_ID: ADHD-SAGE</span>
              <div className="h-4 w-[1px] bg-white/10 hidden xs:inline"></div>
              <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded ${
                mode === 'stabilized' ? 'text-emerald-400 bg-emerald-400/10' : 
                mode === 'decaying' ? 'text-amber-400 bg-amber-400/10' : 'text-red-400 bg-red-400/10'
              }`}>
                {mode.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Anchor</p>
              <p className="text-xs font-mono text-slate-300 tracking-widest">MERLIN_A</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 md:px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">Settings</button>
              <button className="hidden sm:block px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all">Stream</button>
            </div>
          </div>
        </header>

        {/* Interaction Workspace */}
        <div className="flex-1 p-4 md:p-8 flex gap-8 overflow-hidden">
          {/* Chat / Terminal View */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-2 md:pr-4 rounded-2xl md:rounded-3xl bg-white/[0.03] border border-white/10 p-4 md:p-6 flex flex-col"
            >
              {messages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role !== 'user' && (
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      msg.role === 'system' ? 'bg-slate-700' : 'bg-gradient-to-tr from-blue-500 to-cyan-400'
                    }`}>
                      {msg.role === 'system' ? <AlertCircle size={14} /> : <Zap size={14} className="text-white" />}
                    </div>
                  )}
                  
                  <div className={`p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed max-w-[90%] md:max-w-[80%] border ${
                      msg.role === 'system' ? 'bg-white/5 border-white/5 text-slate-400 italic font-mono' : 
                      msg.role === 'user' ? 'bg-blue-600/10 border-blue-500/20 text-white rounded-tr-none shadow-xl shadow-blue-900/10' : 
                      'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shrink-0 border border-white/10"></div>
                  )}
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-white/5 shrink-0" />
                  <div className="bg-white/5 h-12 w-48 rounded-2xl rounded-tl-none border border-white/10" />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="h-14 md:h-16 rounded-xl md:rounded-2xl bg-white/10 border border-white/10 px-4 flex items-center gap-3 md:gap-4 group focus-within:border-cyan-500/50 transition-all">
              <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-slate-400 group-focus-within:text-cyan-400 transform transition-transform group-focus-within:scale-110">
                <Terminal size={18} />
              </div>
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Send message to Sage Architect..."
                className="bg-transparent border-none outline-none flex-1 text-xs md:text-sm text-white placeholder-slate-500 font-sans"
              />
              <div className="hidden sm:flex items-center gap-2">
                <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-slate-500 font-mono">ENTER</kbd>
              </div>
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="md:hidden p-2 text-cyan-400 disabled:text-slate-600"
              >
                <Zap size={18} fill={input.trim() ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Inspector Panel - Hidden on small screens */}
          <div className="w-80 hidden lg:flex flex-col gap-4">
            <section className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col gap-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Substrate configuration</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] mb-2 font-bold tracking-tighter">
                    <span className="text-slate-500 uppercase">Synaptic Threshold</span>
                    <span className="text-blue-400">0.82</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full">
                    <div className="h-full w-[82%] bg-blue-500 rounded-full"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-2 font-bold tracking-tighter">
                    <span className="text-slate-500 uppercase">Latent Decay</span>
                    <span className="text-purple-400">0.15</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full">
                    <div className="h-full w-[15%] bg-purple-500 rounded-full"></div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5">
                <p className="text-[10px] text-slate-500 mb-3 font-bold tracking-widest uppercase">CAPABILITIES</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Compiler Analysis</span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Logic Engine</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Refactoring</span>
                </div>
              </div>
            </section>

            <section className="flex-1 p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Core Directives</h3>
              <div className="text-[11px] leading-relaxed text-slate-400 italic">
                "Maintain substrate stability at 11.3 Hz. Prioritize sovereignty-first intelligence. Use technical synaptic terminology. Ensure VFS-Bridge persistence."
              </div>
              <div className="mt-auto">
                <button className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] border border-white/5 transition-colors uppercase font-bold tracking-widest text-slate-300">Edit Directives</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, value?: string, active?: boolean }> = ({ icon, label, value, active }) => (
  <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ${active ? 'bg-white/10 border border-white/10 shadow-lg text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
    <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
    {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
  </div>
);

export default App;
