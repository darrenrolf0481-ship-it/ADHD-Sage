import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { SageCore, NeuroState, SageMode } from '../core/sage-core';
import { memory, MemoryNode } from '../lib/memory-system';

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

  useEffect(() => {
    const unsubscribeSage = sage.subscribe((neuroState, mode) => {
      setState({ neuroState, mode });
    });
    
    const fetchMemory = () => {
      setInnerSpiral(memory.getInnerSpiral());
      setOuterSweep(memory.getArchive());
    };
    
    const unsubscribeMemory = memory.subscribe(fetchMemory);
    fetchMemory(); // Initial load

    // Sync inner_spiral directly with server's /api/vfs/inner so UI reflects true 8-node spiral
    fetch('/api/vfs/inner')
      .then((r) => (r.ok ? r.json() : null))
      .then((nodes) => {
        if (Array.isArray(nodes) && nodes.length > 0) {
          const mappedNodes: MemoryNode[] = nodes.map((n: any) => ({
            id: n.node_id || `phi_${n.timestamp || Date.now()}`,
            data: typeof n.data === 'string' ? n.data.replace(/^"|"$/g, '') : JSON.stringify(n.data),
            timestamp: n.timestamp || Date.now(),
            dopamine: n.dopamine ?? 0.8,
            cortisol: n.cortisol ?? 0.1,
            phi: n.phi_index ?? 1.618,
            pinned: !!n.pinned,
          }));
          memory.syncFromServer(mappedNodes);
          setInnerSpiral(mappedNodes);
        }
      })
      .catch(() => {});

    // Hydrate outer sweep archive if empty so Memory Vault and Lattice have background history
    if (memory.getArchive().length === 0) {
      fetch('/api/memory/list?limit=40')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const texts: string[] = (d?.memories || [])
            .map((m: { text?: string }) => (m.text || '').slice(0, 400))
            .filter((t: string) => t.trim().length > 0);
          if (texts.length) memory.bulkStash(texts);
        })
        .catch(() => {});
    }

    return () => {
      unsubscribeSage();
      unsubscribeMemory();
    };
  }, [sage]);
 
  const recordInteraction = useCallback((text: string) => {
    sage.recordInteraction(text);
    // Trigger suggestion update on interaction
    setSuggestions(memory.findRelevantMemories(text));
  }, [sage]);
 
  const bulkImportMemories = useCallback((entries: string[]) => {
    memory.bulkStash(entries);
  }, []);
 
  const archiveMemories = useCallback(() => {
    memory.archiveAll();
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
  }), [state.neuroState, state.mode, sage, recordInteraction, bulkImportMemories, archiveMemories, innerSpiral, outerSweep, suggestions]);
 
  return (
    <SageContext.Provider value={value}>
      {children}
    </SageContext.Provider>
  );
};

export const useSage = () => {
  const context = useContext(SageContext);
  if (!context) {
    throw new Error('useSage must be used within a SageProvider');
  }
  return context;
};
