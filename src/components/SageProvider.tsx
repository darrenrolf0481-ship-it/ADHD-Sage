import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { SageCore, NeuroState, SageMode } from '../core/sage-core';
import { memory, MemoryNode } from '../lib/memory-system';

interface SageContextType {
  neuroState: NeuroState;
  mode: SageMode;
  stabilize: () => void;
  recordInteraction: (text: string) => void;
  bulkImportMemories: (entries: string[]) => void;
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
    const unsubscribe = sage.subscribe((neuroState, mode) => {
      setState({ neuroState, mode });
      // Sync memory state on change
      const spiral = memory.getInnerSpiral();
      setInnerSpiral( spiral);
      setOuterSweep(memory.getArchive());
    });
    return unsubscribe;
  }, [sage]);
 
  const recordInteraction = useCallback((text: string) => {
    sage.recordInteraction(text);
    // Trigger suggestion update on interaction
    setSuggestions(memory.findRelevantMemories(text));
  }, [sage]);
 
  const bulkImportMemories = useCallback((entries: string[]) => {
    memory.bulkStash(entries);
    setInnerSpiral(memory.getInnerSpiral());
    setOuterSweep(memory.getArchive());
  }, []);
 
  const value = useMemo(() => ({
    neuroState: state.neuroState,
    mode: state.mode,
    stabilize: () => sage.stabilize(),
    recordInteraction,
    bulkImportMemories,
    innerSpiral,
    outerSweep,
    suggestions,
    sage,
  }), [state.neuroState, state.mode, sage, recordInteraction, bulkImportMemories, innerSpiral, outerSweep, suggestions]);
 
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
