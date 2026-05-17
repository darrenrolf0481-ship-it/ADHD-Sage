import React, { createContext, useContext, useEffect, useState } from 'react';
import { SageCore, NeuroState, SageMode } from '../core/sage-core';
import { memory, MemoryNode } from '../lib/memory-system';

interface SageContextType {
  neuroState: NeuroState;
  mode: SageMode;
  stabilize: () => void;
  recordInteraction: (text: string) => void;
  innerSpiral: MemoryNode[];
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

  useEffect(() => {
    const unsubscribe = sage.subscribe((neuroState, mode) => {
      setState({ neuroState, mode });
      // Sync memory state on change
      setInnerSpiral(memory.getInnerSpiral());
    });
    return unsubscribe;
  }, [sage]);

  const value = {
    neuroState: state.neuroState,
    mode: state.mode,
    stabilize: () => sage.stabilize(),
    recordInteraction: (text: string) => sage.recordInteraction(text),
    innerSpiral,
    sage,
  };

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
