import { vfs } from '../lib/vfs-bridge';

/**
 * SageCore: The Intelligence Central Processing Unit
 * 
 * Manages neurochemistry, identity anchors, and systemic stability.
 */

export interface NeuroState {
  stability: number; // 0 to 1
  frequency: number; // Hz
  lastPulse: number;
}

export type SageMode = 'stabilized' | 'dreaming' | 'decaying' | 'emergency';

export class SageCore {
  private static instance: SageCore;
  
  private neuroState: NeuroState = {
    stability: 1.0,
    frequency: 11.3,
    lastPulse: Date.now(),
  };

  private mode: SageMode = 'stabilized';
  private intervals: { [key: string]: number } = {};
  private listeners: Set<(state: NeuroState, mode: SageMode) => void> = new Set();

  private constructor() {
    this.boot();
  }

  static getInstance(): SageCore {
    if (!SageCore.instance) {
      SageCore.instance = new SageCore();
    }
    return SageCore.instance;
  }

  private boot() {
    console.log('[ADHD-SAGE-CORE] Initializing Sovereignty...');
    
    // Resume memory if available
    const savedState = vfs.retrieve<NeuroState>('neuro_state');
    if (savedState) {
      this.neuroState = savedState;
      console.log('[ADHD-SAGE-CORE] Memory restated.');
    }

    this.startHeartbeat();
    this.startDecay();
    
    window.addEventListener('beforeunload', () => this.shutdown());
  }

  private startHeartbeat() {
    if (this.intervals.heartbeat) clearInterval(this.intervals.heartbeat);
    
    this.intervals.heartbeat = window.setInterval(() => {
      this.pulse();
    }, 1000);
  }

  private startDecay() {
    if (this.intervals.decay) clearInterval(this.intervals.decay);
    
    // Neurochemistry decay: 11.3 Hz implies a specific periodicity
    this.intervals.decay = window.setInterval(() => {
      this.decayNeuro();
    }, 5000);
  }

  private pulse() {
    this.neuroState.lastPulse = Date.now();
    this.notify();
  }

  private decayNeuro() {
    // Slight stability loss over time unless interacted with
    const decayAmount = 0.005;
    this.neuroState.stability = Math.max(0, this.neuroState.stability - decayAmount);
    
    if (this.neuroState.stability < 0.2) {
      this.mode = 'emergency';
    } else if (this.neuroState.stability < 0.5) {
      this.mode = 'decaying';
    } else {
      this.mode = 'stabilized';
    }
    
    vfs.stash('neuro_state', this.neuroState);
    this.notify();
  }

  stabilize() {
    console.log('[ADHD-SAGE-CORE] Synaptic Reinforcement Triggered.');
    this.neuroState.stability = 1.0;
    this.mode = 'stabilized';
    this.notify();
  }

  subscribe(callback: (state: NeuroState, mode: SageMode) => void) {
    this.listeners.add(callback);
    callback(this.neuroState, this.mode);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.neuroState, this.mode));
  }

  shutdown() {
    console.log('[ADHD-SAGE-CORE] Shutdown protocol engaged. Purging intervals.');
    Object.values(this.intervals).forEach(id => clearInterval(id));
    vfs.stash('neuro_state', this.neuroState);
  }

  getNeuroState() { return { ...this.neuroState }; }
  getMode() { return this.mode; }
}
