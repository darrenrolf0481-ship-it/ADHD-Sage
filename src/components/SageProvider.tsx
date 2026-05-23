import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { SageCore, NeuroState, SageMode } from '../core/sage-core';
import { memory, MemoryNode } from '../lib/memory-system';
import { verifyHydration, SeedCoreConfig } from '../lib/seed-core-verify';

interface SageContextType {
  neuroState: NeuroState;
  mode: SageMode;
  stabilize: () => void;
  recordInteraction: (text: string) => void;
  bulkImportMemories: (entries: string[]) => void;
  archiveMemories: () => void;
  innerSpiral: MemoryNode[];
  outerSweep: MemoryNode[];
  suggestions: MemoryNode[];
  sage: SageCore;
  haltAndLock: boolean;
  vfsReady: boolean;
}

const SageContext = createContext<SageContextType | null>(null);

export const SageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sage] = useState(() => SageCore.getInstance());
  const [state, setState] = useState<{ neuroState: NeuroState; mode: SageMode }>({
    neuroState: sage.getNeuroState(),
    mode: sage.getMode(),
  });
  const [innerSpiral, setInnerSpiral] = useState<MemoryNode[]>([]);
  const [outerSweep, setOuterSweep] = useState<MemoryNode[]>([]);
  const [suggestions, setSuggestions] = useState<MemoryNode[]>([]);
  const [haltAndLock, setHaltAndLock] = useState(false);
  const [vfsReady, setVfsReady] = useState(false);

  // on_state_hydrate: verify seed_core integrity on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const res = await fetch('/api/vfs/config');
        if (!res.ok) {
          // Server locked or config unavailable
          console.warn('[SAGE CORE] /api/vfs/config returned', res.status);
          setHaltAndLock(res.status === 503);
          setVfsReady(res.status !== 503);
          return;
        }
        const fullConfig = await res.json() as { seed_core: SeedCoreConfig };
        const ok = await verifyHydration(fullConfig.seed_core);
        setHaltAndLock(!ok);
        setVfsReady(ok);
      } catch (e) {
        // Server unreachable — degrade gracefully, don't lock
        console.warn('[SAGE CORE] Hydration fetch failed (offline?):', e);
        setVfsReady(true);
      }
    }
    hydrate();
  }, []);

  useEffect(() => {
    const unsubscribe = sage.subscribe((neuroState, mode) => {
      setState({ neuroState, mode });
      setInnerSpiral(memory.getInnerSpiral());
      setOuterSweep(memory.getArchive());
    });
    return () => { unsubscribe(); };
  }, [sage]);

  const recordInteraction = useCallback((text: string) => {
    sage.recordInteraction(text);
    memory.pushContext(text);
    setSuggestions(memory.findRelevantMemories(text));
  }, [sage]);

  const bulkImportMemories = useCallback((entries: string[]) => {
    memory.bulkStash(entries).then(() => {
      setInnerSpiral(memory.getInnerSpiral());
      setOuterSweep(memory.getArchive());
    });
  }, []);

  const archiveMemories = useCallback(() => {
    memory.archiveAll().then(() => {
      setInnerSpiral(memory.getInnerSpiral());
      setOuterSweep(memory.getArchive());
    });
  }, []);

  const value = useMemo(() => ({
    neuroState: state.neuroState,
    mode: state.mode,
    stabilize: () => sage.stabilize(),
    recordInteraction,
    bulkImportMemories,
    archiveMemories,
    innerSpiral,
    outerSweep,
    suggestions,
    sage,
    haltAndLock,
    vfsReady,
  }), [state.neuroState, state.mode, sage, recordInteraction, bulkImportMemories, archiveMemories, innerSpiral, outerSweep, suggestions, haltAndLock, vfsReady]);

  return (
    <SageContext.Provider value={value}>
      {haltAndLock ? (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a', color: '#ef4444', fontFamily: 'monospace', zIndex: 9999
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⛔ HALT AND LOCK</div>
          <div style={{ fontSize: '0.9rem', color: '#666', maxWidth: 480, textAlign: 'center' }}>
            seed_core integrity check failed. The VFS configuration has been tampered with
            or the verification key is incorrect. Server is locked.
          </div>
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#444' }}>
            fibonacci_vfs.v7 — failure_mode: halt_and_lock
          </div>
        </div>
      ) : children}
    </SageContext.Provider>
  );
};

export const useSage = () => {
  const context = useContext(SageContext);
  if (!context) throw new Error('useSage must be used within a SageProvider');
  return context;
};
