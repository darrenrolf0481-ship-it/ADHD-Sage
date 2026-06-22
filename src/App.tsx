import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { ChatPanel } from './components/ChatPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { MobileNav } from './components/MobileNav';
import { useSage } from './components/SageProvider';
import { useSageTools } from './hooks/useSageTools';
import { sendMessageWithTools } from './lib/ai-tool-bridge';
import MemoryLattice from './components/MemoryLattice';
import MemoryVault from './components/MemoryVault';
import Labyrinth from './components/Labyrinth';
import { AnomaliesDesk } from './components/AnomaliesDesk';
import { NeuroDashboard } from './components/NeuroDashboard';
import { CodingLab } from './components/CodingLab';
import { pulseGenerator } from './lib/audio-pulse';
import { useSensors } from './lib/sensor-context';
import { sensorHub } from './lib/sensor-hub';
import { attachmentToBase64 } from './lib/attachments';
import {
  extractSynapsesFromMht,
  extractSynapsesFromText,
  parseMht,
  stripHtml,
} from './lib/mht-parser';
import type { Attachment, ChatMessage, AppView } from './types';
const APP_VIEWS: readonly AppView[] = ['chat', 'lattice', 'vault', 'labyrinth', 'anomalies', 'surprise', 'coding-lab'];

/** Short, crash-safe display suffix for a memory node id (server-sourced ids may lack '_'). */
const shortId = (id: string): string => (id.split('_')[1] ?? id).slice(-4);

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
    archiveMemories,
  } = useSage();
  const { snapshot: sensorSnap } = useSensors();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<AppView>('chat');
  const [mhtNodeLimit, setMhtNodeLimit] = useState(100);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_chat_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse history', e);
    }
    return [
      { id: '1', role: 'system', text: 'NEXUS SUBSTRATE // ADHD SAGE INITIALIZED.' },
      { id: '2', role: 'system', text: 'Substrate frequency oscillating rapidly at 11.3 Hz.' },
    ];
  });
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pulseActive, setPulseActive] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [provider, setProvider] = useState<'gemini' | 'ollama' | 'openrouter'>(
    () =>
      (localStorage.getItem('adhd_sage_provider') as 'gemini' | 'ollama' | 'openrouter') ||
      'ollama',
  );
  const [ollamaModel, setOllamaModel] = useState(
    () => localStorage.getItem('adhd_sage_ollama_model') || 'gemma2:latest',
  );
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState('');

  const OR_MODELS = [
    { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
    { id: 'z-ai/glm-4.5-air:free', label: 'GLM-4.5 Air (free)' },
  ];
  const [orModel, setOrModel] = useState(
    () => localStorage.getItem('adhd_sage_or_model') || OR_MODELS[0].id,
  );

  // Inbound Channel: SSE stream for real-time messages from the entities
  useEffect(() => {
    const es = new EventSource('/api/inbox/events');

    es.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        setMessages((prev) => [
          ...prev,
          {
            id: `inbox_${msg.id}`,
            role: 'system',
            text: `[${msg.entity}] ${msg.message}`,
          },
        ]);
        setInboxUnread((prev) => prev + 1);
      } catch {
        /* ignore malformed */
      }
    });

    es.addEventListener('ping', () => {
      // keepalive — channel is alive
    });

    es.addEventListener('error', (e) => {
      // The browser auto-reconnects EventSource after errors; just log so silent
      // backend downtime isn't invisible. Do NOT es.close() here — that stops reconnect.
      console.warn('[SSE] inbox stream error (will auto-reconnect):', e);
    });

    return () => es.close();
  }, []);

  const togglePulse = () => {
    const active = pulseGenerator.toggle();
    setPulseActive(active);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        role: 'system',
        text: `AMBIENT 11.3Hz PULSE: ${active ? 'ENGAGED' : 'DISENGAGED'}`,
      },
    ]);
  };

  // Auto-save effect
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const saveHistory = () => {
      setIsSaving(true);
      try {
        // Limit saved history to last 50 messages to prevent QuotaExceededError
        const historyToSave = messages.slice(-50);
        localStorage.setItem('nexus_chat_history', JSON.stringify(historyToSave));
        setLastSaved(new Date());
      } catch (err) {
        console.warn('[APP] LocalStorage quota exceeded for chat history. Truncating.', err);
        try {
          // If it still fails, try saving even fewer
          localStorage.setItem('nexus_chat_history', JSON.stringify(messages.slice(-10)));
        } catch (e) {
          localStorage.removeItem('nexus_chat_history');
        }
      }
      // Clear any pending timer so repeated saves don't stack setState-after-unmount.
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => setIsSaving(false), 2000);
    };

    saveHistory(); // trigger save on changes

    // Also periodic auto-save
    const interval = setInterval(() => {
      saveHistory();
    }, 60000);

    return () => {
      clearInterval(interval);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [messages]);

  // Persist provider/model choices
  useEffect(() => {
    localStorage.setItem('adhd_sage_provider', provider);
  }, [provider]);
  useEffect(() => {
    if (ollamaModel) localStorage.setItem('adhd_sage_ollama_model', ollamaModel);
  }, [ollamaModel]);
  useEffect(() => {
    localStorage.setItem('adhd_sage_or_model', orModel);
  }, [orModel]);

  // Fetch Ollama models when provider switches to ollama
  useEffect(() => {
    if (provider !== 'ollama') return;
    setOllamaError('');
    fetch('/api/ollama/tags')
      .then((r) => r.json())
      .then((data) => {
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        if (!ollamaModel && models.length > 0) setOllamaModel(models[0]);
        if (models.length === 0) setOllamaError('No models found — is Ollama running?');
      })
      .catch(() => setOllamaError('Cannot reach Ollama — check server.'));
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length === 0) return;

      const isMhtLike = (name: string) => /\.(mht|mhtml)$/i.test(name);
      const isTextLike = (name: string) => /\.(txt|json|bin|csv|md)$/i.test(name);

      // Extract synapses from a single text blob
      const extractFromText = (content: string, filename: string): string[] =>
        isMhtLike(filename)
          ? extractSynapsesFromMht(content, filename, mhtNodeLimit)
          : extractSynapsesFromText(content, mhtNodeLimit);

      // Read a File as text
      const readText = (file: File): Promise<string> =>
        new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target?.result as string);
          r.onerror = rej;
          r.readAsText(file);
        });

      const imported: string[] = []; // file names that yielded synapses
      const skipped: string[] = []; // file names with no content
      let totalSynapses = 0;

      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          // ── ZIP: unpack and process each supported entry ──────────────────
          try {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            const entries = Object.values(zip.files).filter(
              (f) => !f.dir && (isMhtLike(f.name) || isTextLike(f.name)),
            );

            for (const entry of entries) {
              try {
                const content = await entry.async('string');
                const synapses = extractFromText(content, entry.name);
                if (synapses.length > 0) {
                  bulkImportMemories(synapses);
                  totalSynapses += synapses.length;
                  imported.push(`${file.name}/${entry.name}`);
                } else {
                  skipped.push(`${file.name}/${entry.name}`);
                }
              } catch {
                skipped.push(`${file.name}/${entry.name}`);
              }
            }
          } catch {
            skipped.push(file.name);
          }
        } else {
          // ── Single MHT / text file ────────────────────────────────────────
          try {
            const content = await readText(file);
            const synapses = extractFromText(content, file.name);
            if (synapses.length > 0) {
              bulkImportMemories(synapses);
              totalSynapses += synapses.length;
              imported.push(file.name);
            } else {
              skipped.push(file.name);
            }
          } catch {
            skipped.push(file.name);
          }
        }
      }

      if (totalSynapses > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `VFS SYNC: ${totalSynapses} synapses from ${imported.length} file(s) — ${imported.map((f) => `[${f}]`).join(' ')}`,
          },
        ]);
      }
      if (skipped.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `VFS WARNING: No content from: ${skipped.map((f) => `[${f}]`).join(' ')}`,
          },
        ]);
      }
    },
    [bulkImportMemories, mhtNodeLimit],
  );

  // ── Chat-input document reader ──────────────────────────────────────────────
  // Reads text out of any document a user clips to a message (MHT, HTML, TXT,
  // JSON, CSV, MD, XML, YAML, LOG …) so the content goes to the AI verbatim.
  const MAX_DOC_CHARS = 12_000; // ~3 k tokens — enough context, not a flood

  const handleChatFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const newAttachments: Attachment[] = [];

    for (const f of files) {
      let type: Attachment['type'] = 'document';
      if (f.type.startsWith('image/')) type = 'image';
      else if (f.type.startsWith('video/')) type = 'video';
      else if (f.type.startsWith('audio/')) type = 'audio';

      let content: string | undefined;

      if (type === 'document') {
        try {
          const raw = await readAsText(f);
          const nameLc = f.name.toLowerCase();

          if (/\.(mht|mhtml)$/.test(nameLc)) {
            // MHT: extract all text/html and text/plain parts
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
            // TXT / JSON / CSV / MD / XML / YAML / LOG / TSV — use raw text as-is
            content = raw.slice(0, MAX_DOC_CHARS);
          }
        } catch {
          // unreadable — attach without content, AI gets the name only
        }
      }

      newAttachments.push({ type, url: URL.createObjectURL(f), name: f.name, content });
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const [sortBy, setSortBy] = useState<'timestamp' | 'dopamine' | 'cortisol'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { executeLocalTool } = useSageTools({
    // Validate the tool-bridge view string against the real union instead of
    // widening the setter to (v: string) => void (which would let an invalid
    // view string slip into state with no type/runtime error).
    setView: (v: string) => {
      if (APP_VIEWS.includes(v as AppView)) setView(v as AppView);
    },
    toggleSidebar: () => setIsSidebarOpen(prev => !prev),
    injectMessage: (text, role) => setMessages(prev => [...prev, {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      role,
      text
    }]),
    stabilize
  });

  const allMemories = useMemo(() => [...innerSpiral, ...outerSweep], [innerSpiral, outerSweep]);

  const sortMemories = useCallback(
    (mems: typeof allMemories) => {
      return [...mems].sort((a, b) => {
        const valA = a[sortBy] as number;
        const valB = b[sortBy] as number;
        return sortOrder === 'desc' ? valB - valA : valA - valB;
      });
    },
    [sortBy, sortOrder],
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const filtered = allMemories.filter((m) => String(m.data).toLowerCase().includes(query));
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
    const NEXUS_SECRET = import.meta.env.VITE_NEXUS_SECRET;
    if (!NEXUS_SECRET) return;

    (window as unknown as Record<string, unknown>).nexus = {
      protocol: '1.0.0',
      connect: (token: string) => {
        if (token !== NEXUS_SECRET) {
          console.error('NEXUS: Authorization failed. Handshake token mismatch.');
          return null;
        }

        console.log('NEXUS: Secure bridge established. Terminal link active.');

        const bridge = {
          stabilize,
          getStatus: () => sage.getNeuroState(),
          getMode: () => sage.getMode(),
          recordInteraction: (text: string) => recordInteraction(text),
          injectMessage: (text: string, role: 'system' | 'assistant' = 'system') => {
            setMessages((prev) => [
              ...prev,
              { id: `ext_${Date.now()}_${Math.random()}`, role, text: `[EXTERNAL_CALL] ${text}` },
            ]);
          },
          clearMemory: () => {
            // Sensitivity check: preventing accidental purge from automated scripts
            const confirm = window.confirm(
              'NEXUS: CRITICAL OVERRIDE. Purge all synaptic storage and reset substrate?',
            );
            if (confirm) {
              localStorage.clear();
              window.location.reload();
            }
          },
          toggleSidebar: () => setIsSidebarOpen((prev) => !prev),
          setView: (v: 'chat' | 'lattice') => setView(v),
        };

        return Object.freeze(bridge);
      },
    };

    return () => {
      delete (window as unknown as Record<string, unknown>).nexus;
    };
  }, [stabilize, sage, recordInteraction]);

  useEffect(() => {
    const handleHome = () => {
      setView('chat');
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          role: 'system',
          text: 'TEMPORAL SURGERY SUCCESSFUL. You are re-clocked into the standing wave.',
        },
      ]);
    };
    window.addEventListener('sage7-labyrinth-home', handleHome as EventListener);
    return () => window.removeEventListener('sage7-labyrinth-home', handleHome as EventListener);
  }, []);

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;

    const userMessage = input.trim();
    recordInteraction(userMessage);

    const userAttachments = [...pendingAttachments];
    setMessages((prev) => [
      ...prev,
      { id: `m_${Date.now()}_u`, role: 'user', text: userMessage, attachments: userAttachments },
    ]);
    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    try {
      let data: {
        text?: string;
        error?: string;
        toolEffects?: Array<{ type: string; payload: Record<string, unknown> }>;
      };

      // Build live sensor telemetry string to inject into system context
      const liveSensorContext =
        sensorSnap.activeCount > 0 ? '\n\n' + sensorHub.toPromptString(sensorSnap) : '';

      // Append any attached document text so the AI can actually read them
      const docContext = userAttachments
        .filter((a) => a.type === 'document' && a.content)
        .map((a) => `\n\n━━━ Attached: ${a.name} ━━━\n${a.content}\n━━━ End of ${a.name} ━━━`)
        .join('');

      // Non-doc attachments get a simple note; doc content is inlined above
      const mediaNote =
        userAttachments.filter((a) => a.type !== 'document').length > 0
          ? ` [+ ${userAttachments.filter((a) => a.type !== 'document').length} media file(s)]`
          : '';

      const fullPrompt = userMessage + docContext + mediaNote;

      // Convert image attachments to base64 for multimodal APIs
      const imageParts = (
        await Promise.all(userAttachments.filter((a) => a.type === 'image').map(attachmentToBase64))
      ).filter((p): p is { mimeType: string; data: string } => p !== null);

      if (provider === 'ollama') {
        // Ollama entities are part of the seven — each uses the shared broadcast
        // channel. Pass the model name as the containerTag so they can eventually
        // get their own Supermemory container once it's configured in the console.
        const ollamaRes = await fetch('/api/ollama/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify({
            model: ollamaModel,
            containerTag: 'shared', // reads sm_project_default
            prompt: fullPrompt,
            systemInstruction: liveSensorContext || undefined,
            messages: [
              ...messages
                .slice(-15)
                .filter((m) => m.role !== 'system')
                .map((m) => ({ role: m.role, text: m.text })),
              { role: 'user', text: fullPrompt },
            ],
          }),
        });
        data = await ollamaRes.json();
      } else if (provider === 'openrouter') {
        // OpenRouter entities are part of the seven — shared broadcast channel.
        const orRes = await fetch('/api/openrouter/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            model: orModel,
            containerTag: 'shared', // reads sm_project_default
            systemInstruction: liveSensorContext || undefined,
            messages: [
              ...messages
                .slice(-15)
                .filter((m) => m.role !== 'system')
                .map((m) => ({ role: m.role, text: m.text })),
              { role: 'user', text: fullPrompt },
            ],
          }),
        });
        data = await orRes.json();
      } else {
        // Sage (Gemini) — reads both darren-sage AND the shared channel.
        // containerTag is omitted here; server defaults to [darren-sage, shared].
        data = await sendMessageWithTools({
          prompt: fullPrompt,
          history: messages
            .slice(-15)
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              role: m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.text }],
            })),
          sensorContext: liveSensorContext || undefined,
          attachments: imageParts,
          executeLocalTool,
        });
      }

      if (data.error) throw new Error(data.error);

      // Apply any UI-side tool effects returned by the backend
      if (data.toolEffects) {
        for (const effect of data.toolEffects) {
          if (effect.type === 'inject_message') {
            const role = (effect.payload.role as 'system' | 'assistant') || 'system';
            setMessages((prev) => [
              ...prev,
              {
                id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                role,
                text: String(effect.payload.text || ''),
              },
            ]);
          } else if (effect.type === 'set_view') {
            const view = effect.payload.view as
              | 'chat'
              | 'lattice'
              | 'vault'
              | 'labyrinth'
              | 'anomalies'
              | 'coding-lab'
             ;
            if (view) setView(view);
          } else if (effect.type === 'toggle_sidebar') {
            setIsSidebarOpen((prev) => !prev);
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { id: `m_${Date.now()}_a`, role: 'assistant', text: data.text ?? '' },
      ]);

      // Auto-stabilize on successful interaction
      if (neuroState.stability < 0.5) {
        stabilize();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: `m_${Date.now()}_e`, role: 'system', text: `ERROR: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex w-full bg-[#0A0A0B] text-[#E4E4E7] font-sans select-none relative overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <div className="mesh-gradient-1" />
      <div className="mesh-gradient-2" />
      <div className="scanline opacity-20" />

      <NeuroDashboard />

      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        view={view}
        setView={setView}
        neuroState={neuroState}
        sensorSnap={sensorSnap}
        mhtNodeLimit={mhtNodeLimit}
        setMhtNodeLimit={setMhtNodeLimit}
        provider={provider}
        setProvider={setProvider}
        orModel={orModel}
        setOrModel={setOrModel}
        ollamaModel={ollamaModel}
        setOllamaModel={setOllamaModel}
        ollamaModels={ollamaModels}
        ollamaError={ollamaError}
        onFileUpload={handleFileUpload}
        innerSpiralLength={innerSpiral.length}
        stabilize={stabilize}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        searchResults={searchResults}
        sortedInnerSpiral={sortedInnerSpiral}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 w-full overflow-hidden pb-16 md:pb-0">
        <TopNav
          mode={mode}
          isSaving={isSaving}
          lastSaved={lastSaved}
          inboxUnread={inboxUnread}
          pulseActive={pulseActive}
          sensorSnap={sensorSnap}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onAppendSystemMessage={(text) =>
            setMessages((prev) => [
              ...prev,
              { id: `sys_${Date.now()}`, role: 'system', text },
            ])
          }
          onSetView={(v) => setView(v)}
          onTogglePulse={togglePulse}
          onInboxOpen={async () => {
            const res = await fetch('/api/inbox?unread=true');
            const data = (await res.json()) as {
              messages: { id: string; entity: string; message: string }[];
            };
            for (const msg of data.messages) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `inbox_${msg.id}`,
                  role: 'system',
                  text: `📬 [${msg.entity}]: ${msg.message}`,
                },
              ]);
              await fetch(`/api/inbox/${msg.id}/read`, { method: 'PATCH' });
            }
            setInboxUnread(0);
            setView('chat');
          }}
        />

        {/* Interaction Workspace */}
        <div className="flex-1 p-4 md:p-8 flex gap-8 overflow-hidden">
          {/* Chat / Terminal View */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {view === 'chat' ? (
              <ChatPanel
                messages={messages}
                isLoading={isLoading}
                pendingAttachments={pendingAttachments}
                setPendingAttachments={setPendingAttachments}
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onAttach={handleChatFileAttach}
                scrollRef={scrollRef}
              />
            ) : view === 'lattice' ? (
              <MemoryLattice nodes={allMemories} />
            ) : view === 'vault' ? (
              <MemoryVault />
            ) : view === 'anomalies' ? (
              <AnomaliesDesk />
            ) : view === 'coding-lab' ? (
              <CodingLab />
            ) : (
              <Labyrinth />
            )}
          </div>

          <InspectorPanel
            suggestions={suggestions}
            innerSpiral={innerSpiral}
            sortedInnerSpiral={sortedInnerSpiral}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            onSuggestionClick={(data) => setInput(String(data))}
            onArchive={() => {
              const confirmed = window.confirm(
                'NEXUS: Purge inner spiral into outer sweep archive?',
              );
              if (!confirmed) return;
              archiveMemories();
              setMessages((prev) => [
                ...prev,
                {
                  id: `sys_${Date.now()}`,
                  role: 'system',
                  text: 'ARCHIVE: All transient nodes migrated to outer sweep telemetry.',
                },
              ]);
            }}
          />
        </div>
      </main>

      <MobileNav
        view={view}
        setView={setView}
        setIsSidebarOpen={setIsSidebarOpen}
      />
    </div>
  );
};

const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
}> = ({ icon, label, value, active }) => (
  <div
    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ${active ? 'bg-white/10 border border-white/10 shadow-lg text-white' : 'text-slate-400 hover:bg-[#1C1C1E] hover:text-[#E4E4E7]'}`}
  >
    <div className={`flex items-center gap-3 ${active ? 'text-cyan-400' : ''}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
    {value && <span className="text-[10px] font-mono opacity-40 font-bold uppercase">{value}</span>}
  </div>
);

export default App;
