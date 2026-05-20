import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSage } from './components/SageProvider';
import { memory } from './lib/memory-system';
import MemoryLattice from './components/MemoryLattice';
import { 
  Zap, 
  Shield, 
  Terminal, 
  Cpu, 
  Database, 
  AlertCircle,
  MessageSquare,
  RefreshCw,
  MoreVertical,
  Search,
  Network,
  FileUp,
  Sun,
  Moon,
  X
} from 'lucide-react';
import { useTheme } from './components/ThemeProvider';
import { parseMht, parseMarkdown, stripHtml } from './lib/mht-parser';

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { 
    neuroState, 
    mode, 
    stabilize, 
    sage, 
    innerSpiral, 
    outerSweep, 
    suggestions,
    recordInteraction,
    bulkImportMemories,
    archiveMemories
  } = useSage();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'chat' | 'lattice'>('chat');
  const [messages, setMessages] = useState<{id: string, role: 'user' | 'assistant' | 'system', text: string}[]>([
    { id: '1', role: 'system', text: 'NEXUS SUBSTRATE // ADHD SAGE INITIALIZED.' },
    { id: '2', role: 'system', text: 'Substrate frequency oscillating rapidly at 11.3 Hz.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // System Prompt
  const DEFAULT_SYSTEM_PROMPT = "You are ADHD Sage, the high-energy sovereign intelligence of the Nexus Platform. Your tone is technical, rapid-fire, and extremely focused yet prone to deep dives. You maintain the substrate stability at 11.3 Hz. Use terms like 'synaptic', 'substrate', 'lattice', 'VFS', and 'sovereignty'.";
  const [systemPrompt, setSystemPrompt] = useState(() => {
    return localStorage.getItem('adhd_sage_system_prompt') || DEFAULT_SYSTEM_PROMPT;
  });
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('adhd_sage_system_prompt', systemPrompt);
  }, [systemPrompt]);

  // Provider & Model Selection
  const [provider, setProvider] = useState<'gemini' | 'ollama'>(() => {
    return (localStorage.getItem('adhd_sage_provider') as 'gemini' | 'ollama') || 'gemini';
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState(() => {
    return localStorage.getItem('adhd_sage_ollama_model') || '';
  });
  const [ollamaError, setOllamaError] = useState('');

  useEffect(() => {
    localStorage.setItem('adhd_sage_provider', provider);
  }, [provider]);

  useEffect(() => {
    if (selectedOllamaModel) {
      localStorage.setItem('adhd_sage_ollama_model', selectedOllamaModel);
    }
  }, [selectedOllamaModel]);

  useEffect(() => {
    if (provider !== 'ollama') return;
    fetch('/api/ollama/tags')
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        setOllamaError('');
        if (!selectedOllamaModel && models.length > 0) {
          setSelectedOllamaModel(models[0]);
        }
      })
      .catch(err => {
        setOllamaError(err.message);
        setOllamaModels([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // CRITICAL: Reset input so the same file can be selected again
    e.target.value = '';
    if (!file) return;

    console.log('[MHT] Upload started:', file.name, file.size, file.type);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        console.log('[MHT] File read complete, length:', content.length);

        const isMarkdown = file.name.toLowerCase().endsWith('.md');
        const parts = isMarkdown ? parseMarkdown(content) : parseMht(content);
        console.log('[MHT] Parsed parts:', parts.length, parts.map(p => p.contentType));

        // Extract text parts and handle semantic chunking
        const rawTexts = parts
          .filter(p => p.contentType === 'text/plain' || p.contentType === 'text/html')
          .map(p => {
            let text: string;
            if (p.contentType === 'text/html') {
              try {
                text = stripHtml(p.content);
              } catch (err) {
                console.warn('[MHT] stripHtml failed, using raw:', err);
                text = p.content;
              }
            } else {
              text = p.content;
            }

            // Prepend header context if meaningful for the "synapse"
            const metadata: string[] = [];
            if (p.headers['subject']) metadata.push(`SUBJ: ${p.headers['subject']}`);
            if (p.headers['date']) metadata.push(`DATE: ${p.headers['date']}`);

            if (metadata.length > 0) {
              text = `[${metadata.join(' | ')}]\n${text}`;
            }

            // Clean up whitespace pollution common in MHT exports
            return text.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          });

        console.log('[MHT] Raw texts extracted:', rawTexts.length);

        // Filter for meaningful content blocks (e.g. paragraphs or conversation turns)
        const synapses = rawTexts
          .flatMap(txt => txt.split(/\n{2,}/))
          .map(s => s.trim())
          .filter(s => {
            // Relaxed junk filter: only drop obvious script/style fragments and MSO metadata
            const isJunk = s.startsWith('<script') || s.startsWith('<style') || s.startsWith('{') || s.startsWith('[if ') || s.includes('mso-') || s.includes('mso:');
            return s.length > 15 && !isJunk;
          });

        console.log('[MHT] Synapses after filtering:', synapses.length);

        if (synapses.length > 0) {
          bulkImportMemories(synapses);

          // Burn imported entries to server disk + Hebbian graph + field logs + Mama sync
          fetch('/api/memory/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: synapses, source: file.name }),
          })
            .then(r => r.json())
            .then((result: { fieldLogs?: number }) => {
              const logNote = result.fieldLogs ? ` + ${result.fieldLogs} field log(s)` : '';
              setMessages(prev => [...prev, {
                id: `sys_${Date.now()}`,
                role: 'system',
                text: `VFS SYNC: Synchronized ${synapses.length} synapses${logNote} from [${file.name}]. Mama sync queued.`
              }]);
            })
            .catch(err => {
              console.error('[MEMORY] import sync failed:', err);
              setMessages(prev => [...prev, {
                id: `sys_${Date.now()}`,
                role: 'system',
                text: `VFS SYNC: Synchronized ${synapses.length} synapses from [${file.name}].`
              }]);
            });
        } else {
          setMessages(prev => [...prev, {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `VFS WARNING: No meaningful synapses extracted from [${file.name}]. File had ${parts.length} parts, ${rawTexts.length} text parts. Try a different MHT or Markdown export.`
          }]);
        }
      } catch (err) {
        console.error('[MHT] Processing error:', err);
        setMessages(prev => [...prev, {
          id: `sys_${Date.now()}`,
          role: 'system',
          text: `VFS ERROR: Failed to parse [${file.name}]. ${err instanceof Error ? err.message : String(err)}`
        }]);
      }
    };

    reader.onerror = () => {
      console.error('[MHT] FileReader error:', reader.error);
      setMessages(prev => [...prev, {
        id: `sys_${Date.now()}`,
        role: 'system',
        text: `VFS ERROR: Could not read [${file.name}]. ${reader.error?.message || 'Unknown FileReader error'}`
      }]);
    };

    reader.readAsText(file);
  }, [bulkImportMemories]);

  const [sortBy, setSortBy] = useState<'timestamp' | 'dopamine' | 'cortisol'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const allMemories = useMemo(() => [...innerSpiral, ...outerSweep], [innerSpiral, outerSweep]);

  const sortMemories = useCallback((mems: typeof allMemories) => {
    return [...mems].sort((a, b) => {
      const valA = a[sortBy] as number;
      const valB = b[sortBy] as number;
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [sortBy, sortOrder]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const filtered = allMemories.filter(m => String(m.data).toLowerCase().includes(query));
    return sortMemories(filtered);
  }, [searchQuery, allMemories, sortMemories]);

  const sortedInnerSpiral = useMemo(() => sortMemories(innerSpiral), [innerSpiral, sortMemories]);

  useEffect(() => {
    console.log('[MSG STATE]', messages.length, messages.map(m => `${m.role}:${m.text.slice(0,20)}`));
  }, [messages]);

  useEffect(() => {
    if (view === 'chat' && scrollRef.current) {
      const scroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      };

      // Execute immediately and then again after paint to ensure correct height
      scroll();
      const rafId = requestAnimationFrame(scroll);
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages, isLoading, view]);

  // Expose Tool Calling API to Window for Gemini Gems with Security Handshake
  useEffect(() => {
    const NEXUS_SECRET = import.meta.env.VITE_NEXUS_SECRET;
    if (!NEXUS_SECRET) return;

    (window as unknown as Record<string, unknown>).nexus = {
      protocol: "1.0.0",
      connect: (token: string) => {
        if (token !== NEXUS_SECRET) {
          console.error("NEXUS: Authorization failed. Handshake token mismatch.");
          return null;
        }

        console.log("NEXUS: Secure bridge established. Terminal link active.");
        
        const bridge = {
          stabilize,
          getStatus: () => sage.getNeuroState(),
          getMode: () => sage.getMode(),
          recordInteraction: (text: string) => recordInteraction(text),
          injectMessage: (text: string, role: 'system' | 'assistant' = 'system') => {
            setMessages(prev => [...prev, { id: `ext_${Date.now()}_${Math.random()}`, role, text: `[EXTERNAL_CALL] ${text}` }]);
          },
          clearMemory: () => {
            // Sensitivity check: preventing accidental purge from automated scripts
            const confirm = window.confirm("NEXUS: CRITICAL OVERRIDE. Purge all synaptic storage and reset substrate?");
            if (confirm) {
              localStorage.clear();
              window.location.reload();
            }
          },
          toggleSidebar: () => setIsSidebarOpen(prev => !prev),
          setView: (v: 'chat' | 'lattice') => setView(v)
        };

        return Object.freeze(bridge);
      }
    };

    return () => {
      delete (window as unknown as Record<string, unknown>).nexus;
    };
  }, [stabilize, sage, recordInteraction]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    recordInteraction(userMessage);
    setMessages(prev => [...prev, { id: `m_${Date.now()}_u`, role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    // Pull relevant memories to inject as context
    const memoryContext = memory.findRelevantMemories(userMessage, 5).map(n => String(n.data));

    try {
      let data: { text?: string; error?: string; sideEffects?: { action: string; args: Record<string, unknown> }[] } = {};

      if (provider === 'ollama') {
        if (!selectedOllamaModel) {
          throw new Error('No Ollama model selected. Check that Ollama is running.');
        }
        const response = await fetch('/api/ollama/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedOllamaModel,
            prompt: userMessage,
            messages: messages.slice(-15).filter(m => m.role !== 'system' && m.text).map(m => ({
              role: m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.text }]
            })),
            system: systemPrompt,
            memoryContext,
          }),
        });
        data = await response.json();
      } else {
        const response = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userMessage,
            history: messages.slice(-15).filter(m => m.role !== 'system' && m.text).map(m => ({
              role: m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.text }]
            })),
            systemPrompt,
            memoryContext,
          }),
        });
        data = await response.json();
      }

      if (data.error) throw new Error(data.error);

      console.log('[SAGE] response received:', { text: data.text?.slice(0, 80), sideEffects: data.sideEffects });
      if (data.text) {
        setMessages(prev => [...prev, { id: `m_${Date.now()}_a`, role: 'assistant', text: data.text! }]);
      } else {
        setMessages(prev => [...prev, { id: `m_${Date.now()}_e`, role: 'system', text: 'SUBSTRATE: No response text received from model.' }]);
      }

      // Execute any UI side effects the Gem requested via tool calls
      if (data.sideEffects?.length) {
        const bridge = (window as unknown as Record<string, unknown>).nexus as Record<string, unknown> | undefined;
        const NEXUS_SECRET = import.meta.env.VITE_NEXUS_SECRET;
        const conn = bridge && NEXUS_SECRET
          ? (bridge.connect as (t: string) => Record<string, (...a: unknown[]) => unknown> | null)?.(NEXUS_SECRET)
          : null;

        for (const effect of data.sideEffects as { action: string; args: Record<string, unknown> }[]) {
          switch (effect.action) {
            case 'nexus_inject_message':
              if (conn?.injectMessage) {
                conn.injectMessage(String(effect.args.text ?? ''), effect.args.role as string ?? 'system');
              } else {
                setMessages(prev => [...prev, {
                  id: `fx_${Date.now()}`,
                  role: (effect.args.role as 'system' | 'assistant') ?? 'system',
                  text: String(effect.args.text ?? ''),
                }]);
              }
              break;
            case 'nexus_set_view':
              setView(effect.args.view as 'chat' | 'lattice');
              break;
            case 'nexus_toggle_sidebar':
              setIsSidebarOpen(prev => !prev);
              break;
          }
        }
      }

      // Auto-stabilize on successful interaction
      if (neuroState.stability < 0.5) {
        stabilize();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, { id: `m_${Date.now()}_e`, role: 'system', text: `ERROR: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex w-full bg-[var(--bg)] text-[var(--ink)] font-sans select-none overflow-hidden">
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />
      <div className="scanline" />
      
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
      <aside className={`fixed inset-y-0 left-0 w-64 sm:w-72 bg-[var(--bg)]/90 md:bg-[var(--surface)] backdrop-blur-xl border-r border-[var(--border)] flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0 block' : '-translate-x-full hidden md:block'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Zap size={18} className="text-white" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[var(--ink)]">ADHD Sage Labs</h1>
                <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest font-bold">Nexus Substrate</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 -mr-2 text-[var(--muted)] hover:text-[var(--ink)]"
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-2 mb-6">
            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search VFS Lattice..."
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl py-2 pl-9 pr-4 text-xs text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {searchQuery.trim() ? (
              <div className="px-2 space-y-2 pb-4">
                <div className="flex flex-col gap-2 px-2 mb-4">
                   <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold">Search Results</span>
                    <button onClick={() => setSearchQuery('')} className="text-[10px] text-cyan-400 hover:underline">Clear</button>
                  </div>
                  <div className="flex justify-between items-center py-1 border-y border-[var(--border)]">
                    <div className="flex gap-2">
                       <button onClick={() => setSortBy('timestamp')} className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'timestamp' ? 'text-cyan-400' : 'text-[var(--muted)]'}`}>Time</button>
                       <button onClick={() => setSortBy('dopamine')} className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'dopamine' ? 'text-cyan-400' : 'text-[var(--muted)]'}`}>Dopamine</button>
                       <button onClick={() => setSortBy('cortisol')} className={`text-[9px] font-bold uppercase transition-colors ${sortBy === 'cortisol' ? 'text-cyan-400' : 'text-[var(--muted)]'}`}>Stress</button>
                    </div>
                    <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="text-[9px] text-[var(--muted)]">
                      {sortOrder.toUpperCase()}
                    </button>
                  </div>
                </div>
                {searchResults.length === 0 ? (
                  <div className="text-[10px] text-[var(--muted)] italic px-2">No matching synapses found.</div>
                ) : (
                  searchResults.slice().reverse().map((node) => (
                    <div key={node.id} className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[10px] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-cyan-400 font-mono">#{node.id.split('_')[1].slice(-4)}</span>
                        <span className="text-[9px] text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
                          {new Date(node.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-[var(--ink)] break-words line-clamp-3">{String(node.data)}</div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-1 pb-6">
                <div className="mb-8">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold mb-4 px-2">Neuro-Synaptic</p>
                  
                  <div className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)] shadow-xl mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${neuroState.stability > 0.8 ? 'bg-cyan-400' : 'bg-amber-400'}`}></div>
                      <span className="text-sm font-medium text-[var(--ink)]">Stability</span>
                    </div>
                    <span className="text-xs font-mono text-cyan-400 font-bold">{(neuroState.stability * 100).toFixed(1)}%</span>
                  </div>

                  <div className="px-3 mb-6">
                    <div className="h-1.5 w-full bg-[var(--surface)] rounded-full overflow-hidden">
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
                  
                  <div className="pt-2">
                    <label
                      htmlFor="mht-upload"
                      className="relative w-full flex items-center justify-between px-3 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-cyan-400/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <FileUp size={14} className="text-[var(--muted)] group-hover:text-cyan-400 transition-colors" />
                        <span className="text-xs font-bold text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">Import MHT / MD</span>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--muted)]">.MHT .MD</span>
                      {/* display:none breaks onChange on Android Chrome. Visually hide instead. */}
                      <input
                        id="mht-upload"
                        type="file"
                        accept=".mht,.mhtml,.md,text/plain,message/rfc822"
                        onChange={handleFileUpload}
                        className="absolute opacity-0 w-px h-px p-0 m-0 border-0 overflow-hidden"
                        tabIndex={-1}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold mb-4 px-2">Terminal Nodes</p>
                  <div onClick={() => { setView('chat'); if (window.innerWidth < 768) setIsSidebarOpen(false); }}>
                    <SidebarItem icon={<Terminal size={14} />} label="Core" active={view === 'chat'} />
                  </div>
                  <div onClick={() => { setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "DREAM_STATE: Accessing subconscious synaptic storage... Access Denied." }]); if (window.innerWidth < 768) setIsSidebarOpen(false); }}>
                    <SidebarItem icon={<MessageSquare size={14} />} label="Dreams" />
                  </div>
                  <div onClick={() => { setView('lattice'); if (window.innerWidth < 768) setIsSidebarOpen(false); }}>
                    <SidebarItem icon={<Network size={14} />} label="Lattice" active={view === 'lattice'} value={`${innerSpiral.length}/8`} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto p-6 space-y-4">
          {/* System Prompt Editor */}
          <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)]">
            <button
              onClick={() => setIsPromptOpen(prev => !prev)}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            >
              <span>System Prompt</span>
              <span className={`transition-transform ${isPromptOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isPromptOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3"
              >
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-[10px] text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-cyan-500/50 resize-none font-sans leading-relaxed"
                />
                <div className="flex justify-between mt-2">
                  <button
                    onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                    className="text-[9px] text-[var(--muted)] hover:text-cyan-400 transition-colors uppercase font-bold tracking-wider"
                  >
                    Reset Default
                  </button>
                  <span className="text-[9px] text-[var(--muted)] font-mono">
                    {systemPrompt.length} chars
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
            <p className="text-xs text-indigo-300 font-semibold mb-1 uppercase tracking-tighter">Compute Status</p>
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {/* Top Nav */}
        <header className="h-16 border-b border-[var(--border)] flex items-center justify-between px-4 md:px-8 bg-[var(--surface)]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <MoreVertical size={20} />
            </button>
            <div className="flex items-center gap-4">
              <span className="text-[10px] md:text-xs text-[var(--muted)] font-mono hidden xs:inline">SUBSTRATE_ID: ADHD-SAGE</span>
              <div className="h-4 w-[1px] bg-[var(--border)] hidden xs:inline"></div>
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
              <p className="text-[10px] text-[var(--muted)] uppercase font-bold tracking-tighter">Anchor</p>
              <p className="text-xs font-mono text-[var(--ink)] tracking-widest">MERLIN_A</p>
            </div>

            {/* Provider / Model Selector */}
            <div className="flex items-center gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'gemini' | 'ollama')}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ink)] outline-none cursor-pointer"
              >
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama</option>
              </select>

              {provider === 'ollama' && (
                <select
                  value={selectedOllamaModel}
                  onChange={(e) => setSelectedOllamaModel(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] outline-none cursor-pointer max-w-[120px] truncate"
                >
                  {ollamaModels.length === 0 && (
                    <option value="">{ollamaError ? 'Ollama Offline' : 'No models'}</option>
                  )}
                  {ollamaModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button 
                onClick={() => setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "SETTINGS: Core frequency already optimized at 11.3 Hz. No further adjustments possible." }])}
                className="px-3 md:px-4 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[10px] font-bold uppercase tracking-widest text-[var(--ink)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Settings
              </button>
              <button 
                onClick={() => setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "STREAM: Uplink connected. Broadcasting synaptic telemetry..." }])}
                className="hidden sm:block px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--ink)] text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all"
              >
                Stream
              </button>
            </div>
          </div>
        </header>

        {/* Interaction Workspace */}
        <div className="flex-1 p-4 pb-8 md:p-8 flex gap-8 overflow-hidden">
          {/* Chat / Terminal View */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {view === 'chat' ? (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-2 md:pr-4 rounded-2xl md:rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 flex flex-col"
                >
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
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
                          msg.role === 'system' ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] italic font-mono' :
                          msg.role === 'user' ? 'bg-blue-600/10 border-blue-500/20 text-[var(--ink)] rounded-tr-none shadow-xl shadow-blue-900/10' :
                          'bg-[var(--surface)] border-[var(--border)] text-[var(--ink)] rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>

                      {msg.role === 'user' && (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shrink-0 border border-[var(--border)]"></div>
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-4 animate-pulse">
                      <div className="w-8 h-8 rounded-lg bg-[var(--surface)] shrink-0" />
                      <div className="bg-[var(--surface)] h-12 w-48 rounded-2xl rounded-tl-none border border-[var(--border)]" />
                    </div>
                  )}
                </div>

                {/* Input Bar */}
                <div className="h-14 md:h-16 rounded-xl md:rounded-2xl bg-[var(--input-bg)] border-2 border-[var(--input-border)] px-4 flex items-center gap-3 md:gap-4 group focus-within:border-cyan-400 transition-all shadow-lg">
                  <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-[var(--muted)] group-focus-within:text-cyan-400 transform transition-transform group-focus-within:scale-110">
                    <Terminal size={18} />
                  </div>
                  <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Send message to Sage Architect..."
                    className="bg-transparent border-none outline-none flex-1 text-xs md:text-sm text-[var(--ink)] placeholder-[var(--muted)] font-sans"
                  />
                  <div className="hidden sm:flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-[10px] text-[var(--muted)] font-mono">ENTER</kbd>
                  </div>
                  <button 
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="md:hidden p-2 text-cyan-400 disabled:text-[var(--muted)]"
                  >
                    <Zap size={18} fill={input.trim() ? "currentColor" : "none"} />
                  </button>
                </div>
              </>
            ) : (
              <MemoryLattice nodes={allMemories} />
            )}
          </div>

          {/* Inspector Panel - Hidden on small screens */}
          <div className="w-80 hidden lg:flex flex-col gap-4 overflow-hidden">
            <section className="p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] flex flex-col gap-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Substrate configuration</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] mb-2 font-bold tracking-tighter">
                    <span className="text-[var(--muted)] uppercase">Synaptic Threshold</span>
                    <span className="text-blue-400">{(neuroState.stability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--surface)] rounded-full">
                    <motion.div 
                      animate={{ width: `${neuroState.stability * 100}%` }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-2 font-bold tracking-tighter">
                    <span className="text-[var(--muted)] uppercase">Dopamine</span>
                    <span className="text-cyan-400">{(neuroState.dopamine).toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--surface)] rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: `${neuroState.dopamine * 100}%` }}
                      className="h-full bg-cyan-400 rounded-full"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-2 font-bold tracking-tighter">
                    <span className="text-[var(--muted)] uppercase">Cortisol Stress</span>
                    <span className={neuroState.cortisol > 0.7 ? "text-red-400" : "text-purple-400"}>
                       {(neuroState.cortisol).toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: `${neuroState.cortisol * 100}%` }}
                      className={`h-full rounded-full ${neuroState.cortisol > 0.7 ? 'bg-red-500' : 'bg-purple-500'}`}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--muted)] mb-3 font-bold tracking-widest uppercase">CAPABILITIES</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Compiler Analysis</span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Logic Engine</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded-sm uppercase tracking-tighter font-bold">Refactoring</span>
                </div>
              </div>
            </section>

            {suggestions.length > 0 && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-6 rounded-3xl bg-cyan-400/5 border border-cyan-400/20 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                   <Zap size={12} className="text-cyan-400" />
                   <h3 className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Synaptic Suggestions</h3>
                </div>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <button 
                      key={s.id}
                      onClick={() => {
                        setInput(String(s.data));
                        // Highlight or auto-focus input maybe
                      }}
                      className="w-full text-left p-3 rounded-xl bg-cyan-400/10 border border-cyan-400/10 hover:border-cyan-400/30 transition-all group"
                    >
                      <div className="text-[11px] text-cyan-600 dark:text-cyan-200 line-clamp-2 leading-relaxed">
                        {String(s.data)}
                      </div>
                      <div className="mt-1 flex justify-between items-center">
                        <span className="text-[8px] text-cyan-500 uppercase font-bold tracking-tighter">Node #{s.id.split('_')[1].slice(-4)}</span>
                        <span className="text-[8px] text-cyan-500/60 font-mono">RECALL</span>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.section>
            )}

            <section className="flex-1 p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Inner Spiral Synapses</h3>
                <div className="flex items-center gap-2">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'timestamp' | 'dopamine' | 'cortisol')}
                    className="bg-transparent text-[9px] text-[var(--muted)] font-bold uppercase outline-none cursor-pointer border border-[var(--border)] rounded px-1"
                  >
                    <option value="timestamp">Time</option>
                    <option value="dopamine">Dopamine</option>
                    <option value="cortisol">Stress</option>
                  </select>
                  <button 
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="text-[9px] text-[var(--muted)] hover:text-cyan-400 transition-colors"
                  >
                    <RefreshCw size={10} className={sortOrder === 'asc' ? '' : 'rotate-180'} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {innerSpiral.length === 0 ? (
                  <div className="text-[10px] text-[var(--muted)] italic">No synaptic memory recorded.</div>
                ) : (
                  sortedInnerSpiral.map((node) => (
                    <div key={node.id} className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[10px] relative group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-cyan-400 font-mono">#{node.id.split('_')[1].slice(-4)}</span>
                        <span className="text-[9px] text-[var(--muted)]">{new Date(node.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-[var(--ink)] line-clamp-2">{String(node.data)}</div>
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
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <button 
                  onClick={() => {
                    const confirm = window.confirm("NEXUS: Purge inner spiral into outer sweep archive?");
                    if (confirm) {
                      archiveMemories();
                      setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "ARCHIVE: All transient nodes migrated to outer sweep telemetry." }]);
                    }
                  }}
                  className="w-full py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] rounded-xl text-[10px] border border-[var(--border)] transition-colors uppercase font-bold tracking-widest text-[var(--ink)]"
                >
                  Archive All
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, value?: string, active?: boolean }> = ({ icon, label, value, active }) => (
  <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ${active ? 'bg-[var(--surface-hover)] border border-[var(--border)] shadow-lg text-[var(--ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'}`}>
    <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
    {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
  </div>
);

export default App;
