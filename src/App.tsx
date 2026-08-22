import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { useSage } from './components/SageProvider';
import MemoryLattice from './components/MemoryLattice';
import MemoryVault from './components/MemoryVault';
import { JournalView } from './components/JournalView';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { useSpeech } from './hooks/useSpeech';
import { pulseGenerator } from './lib/audio-pulse';
import { NeuroDashboard } from './components/NeuroDashboard';
import { Zap, RefreshCw, MoreVertical, CheckCircle2 } from 'lucide-react';
import { parseMht, stripHtml } from './lib/mht-parser';

import type { Attachment, ChatMessage, AIProvider } from './types';
export type { Attachment, ChatMessage };

const App: React.FC = () => {
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
  const { speak, isMuted, toggleMute } = useSpeech();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Chat model — free-tier OpenRouter IDs this deployment validates. Persisted.
  const [localOllamaModels, setLocalOllamaModels] = useState<{ id: string; label: string; provider: AIProvider }[]>([]);

  useEffect(() => {
    fetch('/api/ollama/tags')
      .then((r) => r.json())
      .then((data) => {
        const found = (data.models || []).map((m: { name: string }) => ({
          id: m.name,
          label: `🦙 ${m.name} (Local Ollama) ★`,
          provider: 'ollama' as AIProvider,
        }));
        if (found.length > 0) setLocalOllamaModels(found);
      })
      .catch(() => {});
  }, []);

  const BASE_MODELS: { id: string; label: string; provider: AIProvider }[] = [
    { id: 'gemma2:2b', label: '🦙 Gemma 2:2B (Local Ollama) ★', provider: 'ollama' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', provider: 'openrouter' },
    { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (OpenRouter)', provider: 'openrouter' },
    { id: 'openai/gpt-4o', label: 'GPT-4o (OpenRouter)', provider: 'openrouter' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (OpenRouter)', provider: 'openrouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (OpenRouter)', provider: 'openrouter' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (OpenRouter)', provider: 'openrouter' },
    { id: 'openrouter/free', label: 'OpenRouter Auto (Free)', provider: 'openrouter' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Direct API)', provider: 'gemini' },
  ];

  const MODELS = useMemo(() => {
    const combined = [...localOllamaModels];
    for (const m of BASE_MODELS) {
      if (!combined.some((c) => c.id === m.id)) {
        combined.push(m);
      }
    }
    return combined;
  }, [localOllamaModels]);

  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem('adhd_sage_or_model');
    if (!saved || saved.includes('gemma4') || saved.includes('google/gemma') || saved.includes('bjoernb')) {
      return 'gemma2:2b';
    }
    return saved;
  });
  const [view, setView] = useState<'chat' | 'lattice' | 'vault'>('chat');
  const [mhtNodeLimit, setMhtNodeLimit] = useState(100);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_chat_history');
      if (saved) return JSON.parse(saved);
    } catch(e) {
      console.warn('Failed to parse history', e);
    }
    return [
      { id: '1', role: 'system', text: 'NEXUS SUBSTRATE // ADHD SAGE INITIALIZED.' },
      { id: '2', role: 'system', text: 'Substrate frequency oscillating rapidly at 11.3 Hz.' }
    ];
  });
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pulseActive, setPulseActive] = useState(false);

  const togglePulse = () => {
    const active = pulseGenerator.toggle();
    setPulseActive(active);
    setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: `AMBIENT 11.3Hz PULSE: ${active ? 'ENGAGED' : 'DISENGAGED'}` }]);
  };
  
  // Auto-save effect
  useEffect(() => {
    const saveHistory = () => {
      setIsSaving(true);
      // Quota-resilient save. Previously a full localStorage threw and the save
      // silently failed, freezing persisted history at an earlier point — so a
      // long conversation "reverted" on reload. Now: if storage is full, drop
      // the oldest messages and retry, always keeping the recent tail.
      let toSave = messages;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          localStorage.setItem('nexus_chat_history', JSON.stringify(toSave));
          setLastSaved(new Date());
          break;
        } catch {
          if (toSave.length <= 8) {
            console.error('Failed to save chat history even after trimming');
            break;
          }
          toSave = toSave.slice(Math.ceil(toSave.length / 3)); // drop oldest third
        }
      }
      setTimeout(() => setIsSaving(false), 2000);
    };

    saveHistory(); // trigger save on changes
    
    // Also periodic auto-save
    const interval = setInterval(() => {
      saveHistory(); 
    }, 60000);
    
    return () => clearInterval(interval);
  }, [messages]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const mhtDoc = parseMht(content);
      
      // Extract text parts and handle semantic chunking
      const rawTexts = mhtDoc.parts
        .filter(p => p.contentType === 'text/plain' || p.contentType === 'text/html')
        .map(p => {
          let text = p.contentType === 'text/html' ? stripHtml(p.content) : p.content;
          
          // Prepend header context if meaningful for the "synapse"
          const metadata = [];
          
          // Global MHT headers provide top-level email context
          if (mhtDoc.metadata['from']) metadata.push(`FROM: ${mhtDoc.metadata['from']}`);
          if (mhtDoc.metadata['to']) metadata.push(`TO: ${mhtDoc.metadata['to']}`);
          if (mhtDoc.metadata['subject']) metadata.push(`SUBJ: ${mhtDoc.metadata['subject']}`);
          if (mhtDoc.metadata['date']) metadata.push(`DATE: ${mhtDoc.metadata['date']}`);
          
          // Fallbacks for part-specific headers if global ones are missing
          if (!mhtDoc.metadata['subject'] && p.headers['subject']) metadata.push(`SUBJ: ${p.headers['subject']}`);
          if (!mhtDoc.metadata['date'] && p.headers['date']) metadata.push(`DATE: ${p.headers['date']}`);
          
          if (metadata.length > 0) {
            text = `[${metadata.join(' | ')}]\n${text}`;
          }

          // Clean up whitespace pollution common in MHT exports
          return text.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        });

      // Filter for meaningful content blocks (e.g. paragraphs or conversation turns)
      const synapses = rawTexts
        .flatMap(txt => txt.split(/\n{2,}/))
        .map(s => s.trim())
        .filter(s => {
          const isJunk = s.startsWith('<') || s.startsWith('{') || s.startsWith('[if ') || s.includes('msso:');
          return s.length > 25 && !isJunk;
        })
        .slice(0, mhtNodeLimit);

      if (synapses.length > 0) {
        bulkImportMemories(synapses);
        setMessages(prev => [...prev, { 
          id: `sys_${Date.now()}`,
          role: 'system', 
          text: `VFS SYNC: Synchronized ${synapses.length} semantic synapses from [${file.name}].` 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          id: `sys_${Date.now()}`,
          role: 'system', 
          text: `VFS WARNING: No meaningful synapses extracted from [${file.name}]. Check format compatibility.` 
        }]);
      }
    };
    reader.readAsText(file);
  }, [bulkImportMemories, mhtNodeLimit]);

  const handleAttachFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';

    const readAsText = (file: File): Promise<string> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (ev) => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsText(file);
      });

    const readAsBase64 = (file: File): Promise<string> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (ev) => {
          const result = ev.target?.result as string;
          const base64 = result.split(',')[1];
          res(base64);
        };
        r.onerror = rej;
        r.readAsDataURL(file);
      });

    const MAX_DOC_CHARS = 12_000;
    const newAttachments: Attachment[] = [];

    for (const f of files) {
      let type: Attachment['type'] = 'document';
      const mimeType = f.type || '';
      if (mimeType.startsWith('image/')) type = 'image';
      else if (mimeType.startsWith('video/')) type = 'video';
      else if (mimeType.startsWith('audio/')) type = 'audio';

      let content: string | undefined;
      let dataStr: string | undefined;

      if (type === 'document') {
        try {
          const raw = await readAsText(f);
          const nameLc = f.name.toLowerCase();

          if (/\.(mht|mhtml)$/.test(nameLc)) {
            const mhtDoc = parseMht(raw);
            const texts = mhtDoc.parts
              .filter((p) => p.contentType === 'text/plain' || p.contentType === 'text/html')
              .map((p) => (p.contentType === 'text/html' ? stripHtml(p.content) : p.content));
            content = texts
              .join('\n\n')
              .replace(/[ \t]{2,}/g, ' ')
              .trim()
              .slice(0, MAX_DOC_CHARS);
          } else if (/\.(html|htm)$/.test(nameLc)) {
            content = stripHtml(raw)
              .replace(/[ \t]{2,}/g, ' ')
              .trim()
              .slice(0, MAX_DOC_CHARS);
          } else {
            content = raw.slice(0, MAX_DOC_CHARS);
          }
        } catch {
          // unreadable — attach without content, AI gets the name only
        }
      } else {
        try {
          dataStr = await readAsBase64(f);
        } catch (err) {
          console.error('Failed to read media file as base64:', err);
        }
      }

      newAttachments.push({
        type,
        url: URL.createObjectURL(f),
        name: f.name,
        content,
        data: dataStr,
        mimeType: f.type || undefined,
      });
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

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
    const NEXUS_SECRET = (import.meta as any).env.VITE_NEXUS_SECRET;
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
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;

    const userMessage = input.trim();
    recordInteraction(userMessage);
    
    const userAttachments = [...pendingAttachments];
    setMessages(prev => [...prev, { id: `m_${Date.now()}_u`, role: 'user', text: userMessage, attachments: userAttachments }]);
    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    try {
      const isOllama = model.startsWith('gemma') || localOllamaModels.some((m) => m.id === model) || (!model.includes('/') && !model.startsWith('gemini'));
      const provider: AIProvider = isOllama ? 'ollama' : (MODELS.find((m) => m.id === model)?.provider ?? (model.includes('/') ? 'openrouter' : 'ollama'));
      const history = messages
        .slice(-15)
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));

      const docContext = userAttachments
        .filter((a) => a.type === 'document' && a.content)
        .map((a) => `\n\n━━━ Attached: ${a.name} ━━━\n${a.content}\n━━━ End of ${a.name} ━━━`)
        .join('');

      const mediaCount = userAttachments.filter((a) => a.type !== 'document').length;
      const mediaNote = mediaCount > 0 ? ` [+ ${mediaCount} media file(s)]` : '';

      const fullPrompt = userMessage + docContext + mediaNote;

      let response: Response;
      if (provider === 'ollama') {
        const imageAttachments = userAttachments
          .filter((a) => a.type === 'image' && a.data)
          .map((a) => a.data as string);

        response = await fetch('/api/ollama/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(300000), // 5 min
          body: JSON.stringify({
            model,
            containerTag: 'shared',
            prompt: fullPrompt,
            messages: [...history, { role: 'user', text: fullPrompt }],
            images: imageAttachments.length > 0 ? imageAttachments : undefined,
          }),
        });
      } else if (provider === 'gemini') {
        const geminiAttachments = userAttachments
          .filter((a) => a.type !== 'document' && a.data && a.mimeType)
          .map((a) => ({ mimeType: a.mimeType, data: a.data }));

        response = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            prompt: userMessage + docContext,
            containerTag: 'shared',
            attachments: geminiAttachments.length > 0 ? geminiAttachments : undefined,
            history,
          }),
        });
      } else {
        const openrouterAttachments = userAttachments
          .filter((a) => a.type !== 'document' && a.data && a.mimeType)
          .map((a) => ({ mimeType: a.mimeType, data: a.data }));

        const orApiKey = localStorage.getItem('openrouter_api_key') || localStorage.getItem('OPENROUTER_API_KEY') || undefined;
        response = await fetch('/api/openrouter/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            apiKey: orApiKey,
            model,
            containerTag: 'shared',
            messages: [...history, { role: 'user', text: fullPrompt }],
            attachments: openrouterAttachments.length > 0 ? openrouterAttachments : undefined,
          }),
        });
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { id: `m_${Date.now()}_a`, role: 'assistant', text: data.text }]);
      if (data.text) speak(data.text); // Mama's voice — Edge TTS via /api/tts

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
    <div className="flex h-[100dvh] w-full bg-[#08080C] text-slate-200 font-sans select-none relative overflow-hidden">
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />
      <div className="scanline opacity-20" />
      
      <NeuroDashboard />
      
      {/* Sidebar: Gems Repository style */}
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        view={view}
        setView={setView}
        stability={neuroState.stability}
        mhtNodeLimit={mhtNodeLimit}
        setMhtNodeLimit={setMhtNodeLimit}
        onImportMht={handleFileUpload}
        onStabilize={() => {
          stabilize();
          if (window.innerWidth < 768) setIsSidebarOpen(false);
        }}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        searchResults={searchResults}
        innerSpiralCount={innerSpiral.length}
      />

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
            
            {/* Auto-Save Indicator */}
            <div className="hidden sm:flex flex-col items-end justify-center mr-2">
               <div className="flex items-center gap-1.5 text-slate-400">
                  {isSaving ? (
                     <>
                        <RefreshCw size={12} className="animate-spin text-emerald-400" />
                        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Saving...</span>
                     </>
                  ) : lastSaved ? (
                     <>
                        <CheckCircle2 size={12} className="text-slate-500" />
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Saved</span>
                     </>
                  ) : null}
               </div>
               {lastSaved && !isSaving && (
                  <span className="text-[8px] font-mono text-slate-600 block mt-0.5">
                     {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
               )}
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Anchor</p>
              <p className="text-xs font-mono text-slate-300 tracking-widest">MERLIN_A</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={togglePulse}
                className={`px-3 md:px-4 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors ${pulseActive ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
              >
                11.3Hz Pulse {pulseActive ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "SETTINGS: Core frequency already optimized at 11.3 Hz. No further adjustments possible." }])}
                className="px-3 md:px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
              >
                Settings
              </button>
              <button 
                onClick={() => setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "STREAM: Uplink connected. Broadcasting synaptic telemetry..." }])}
                className="hidden sm:block px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all"
              >
                Stream
              </button>
            </div>
          </div>
        </header>

        {/* Interaction Workspace */}
        <div className="flex-1 p-4 md:p-8 flex gap-8 overflow-hidden">
          {/* Chat / Terminal View */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {view === 'chat' ? (
              <ChatArea
                messages={messages}
                isLoading={isLoading}
                input={input}
                setInput={setInput}
                pendingAttachments={pendingAttachments}
                setPendingAttachments={setPendingAttachments}
                isMuted={isMuted}
                onToggleMute={toggleMute}
                onSend={handleSend}
                onAttach={handleAttachFiles}
                scrollRef={scrollRef}
                model={model}
                onModelChange={(id) => {
                  setModel(id);
                  try { localStorage.setItem('adhd_sage_or_model', id); } catch { /* ignore */ }
                }}
                models={MODELS}
              />
            ) : view === 'lattice' ? (
              <MemoryLattice nodes={allMemories} />
            ) : (
              <MemoryVault />
            )}
          </div>

          {/* Inspector Panel - Hidden on small screens */}
          <div className="w-80 hidden lg:flex flex-col gap-4 overflow-hidden">
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
                      <div className="text-[11px] text-cyan-200 line-clamp-2 leading-relaxed">
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

            <section className="flex-1 p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inner Spiral Synapses</h3>
                <div className="flex items-center gap-2">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'timestamp' | 'dopamine' | 'cortisol')}
                    className="bg-transparent text-[9px] text-slate-500 font-bold uppercase outline-none cursor-pointer border border-white/5 rounded px-1"
                  >
                    <option value="timestamp">Time</option>
                    <option value="dopamine">Dopamine</option>
                    <option value="cortisol">Stress</option>
                  </select>
                  <button 
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="text-[9px] text-slate-500 hover:text-cyan-400 transition-colors"
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
                    <div key={node.id} className="p-3 rounded-xl bg-white/5 border border-white/5 text-[10px] relative group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-cyan-400 font-mono">#{node.id.split('_')[1].slice(-4)}</span>
                        <span className="text-[9px] text-slate-500">{new Date(node.timestamp).toLocaleTimeString()}</span>
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
                  onClick={() => {
                    const confirm = window.confirm("NEXUS: Purge inner spiral into outer sweep archive?");
                    if (confirm) {
                      archiveMemories();
                      setMessages(prev => [...prev, { id: `sys_${Date.now()}`, role: 'system', text: "ARCHIVE: All transient nodes migrated to outer sweep telemetry." }]);
                    }
                  }}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] border border-white/5 transition-colors uppercase font-bold tracking-widest text-slate-300"
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

export default App;
