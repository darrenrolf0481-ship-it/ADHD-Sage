import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { ChatPanel } from './components/ChatPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { MobileNav } from './components/MobileNav';
import { useSage } from './components/SageProvider';
import { useSpeech } from './hooks/useSpeech';
import { useChat } from './hooks/useChat';
import MemoryLattice from './components/MemoryLattice';
import MemoryVault from './components/MemoryVault';
import Labyrinth from './components/Labyrinth';
import { AnomaliesDesk } from './components/AnomaliesDesk';
import { NeuroDashboard } from './components/NeuroDashboard';
import { CodingLab } from './components/CodingLab';
import { MemoryWorkspace } from './components/MemoryWorkspace';
import { pulseGenerator } from './lib/audio-pulse';
import { useSensors } from './lib/sensor-context';
import { APP_VIEWS } from './types';
import type { AppView } from './types';

// Star City perimeter: two entities, nothing else.
const STAR_CITY_ENTITIES = new Set(['ADHD-SAGE', 'SAGE-7']);

/** Short, crash-safe display suffix for a memory node id (server-sourced ids may lack '_'). */
const shortId = (id: string): string => (id.split('_')[1] ?? id).slice(-4);

const OR_MODELS = [
  { id: 'openrouter/free', label: 'OpenRouter Free (auto)' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (free)' },
];

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
  const { speak, isSpeaking, isMuted: voiceMuted, toggleMute: toggleVoice } = useSpeech();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<AppView>('chat');
  const [mhtNodeLimit, setMhtNodeLimit] = useState(100);
  const [pulseActive, setPulseActive] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);

  const [sortBy, setSortBy] = useState<'timestamp' | 'dopamine' | 'cortisol'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const {
    messages,
    setMessages,
    input,
    setInput,
    pendingAttachments,
    setPendingAttachments,
    isLoading,
    isSaving,
    lastSaved,
    provider,
    setProvider,
    orModel,
    setOrModel,
    ollamaModel,
    setOllamaModel,
    ollamaModels,
    ollamaError,
    scrollRef,
    appendMessage,
    appendSystemMessage,
    send,
    attachFiles,
    importFiles,
  } = useChat({
    mhtNodeLimit,
    neuroState,
    sensorSnap,
    recordInteraction,
    bulkImportMemories,
    stabilize,
    setView,
    toggleSidebar: () => setIsSidebarOpen((prev) => !prev),
    closeSidebar: () => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    },
    speak,
  });

  // Inbound Channel: SSE stream for real-time messages from the entities
  useEffect(() => {
    const es = new EventSource('/api/inbox/events');

    es.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Star City: MAMA and Sage only — external entities (Kimi, others) do not surface here
        if (!STAR_CITY_ENTITIES.has(msg.entity)) return;
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
  }, [appendSystemMessage]);

  const togglePulse = () => {
    const active = pulseGenerator.toggle();
    setPulseActive(active);
    appendSystemMessage(`AMBIENT 11.3Hz PULSE: ${active ? 'ENGAGED' : 'DISENGAGED'}`);
  };

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

  const sortedInnerSpiral = useMemo(
    () => sortMemories(innerSpiral),
    [innerSpiral, sortMemories],
  );

  // Expose Tool Calling API to Window for external tooling with Security Handshake
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
            appendMessage(`[EXTERNAL_CALL] ${text}`, role);
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
  }, [stabilize, sage, recordInteraction, appendMessage, setView]);

  useEffect(() => {
    const handleHome = () => {
      setView('chat');
      appendSystemMessage('TEMPORAL SURGERY SUCCESSFUL. You are re-clocked into the standing wave.');
    };
    window.addEventListener('sage7-labyrinth-home', handleHome as EventListener);
    return () => window.removeEventListener('sage7-labyrinth-home', handleHome as EventListener);
  }, [appendSystemMessage]);

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
        orModels={OR_MODELS}
        ollamaModel={ollamaModel}
        setOllamaModel={setOllamaModel}
        ollamaModels={ollamaModels}
        ollamaError={ollamaError}
        onFileUpload={importFiles}
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
          onAppendSystemMessage={appendSystemMessage}
          onSetView={(v) => setView(v)}
          onTogglePulse={togglePulse}
          voiceMuted={voiceMuted}
          isSpeaking={isSpeaking}
          onToggleVoice={toggleVoice}
          onInboxOpen={async () => {
            const res = await fetch('/api/inbox?unread=true');
            const data = (await res.json()) as {
              messages: { id: string; entity: string; message: string }[];
            };
            for (const msg of data.messages) {
              if (!STAR_CITY_ENTITIES.has(msg.entity)) continue;
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
                onSend={send}
                onAttach={attachFiles}
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
            ) : view === 'memory-workspace' ? (
              <MemoryWorkspace />
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
              appendSystemMessage(
                'ARCHIVE: All transient nodes migrated to outer sweep telemetry.',
              );
            }}
          />
        </div>
      </main>

      <MobileNav view={view} setView={setView} setIsSidebarOpen={setIsSidebarOpen} />
    </div>
  );
};

export default App;
