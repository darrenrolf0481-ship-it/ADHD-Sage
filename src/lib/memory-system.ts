/**
 * Fibonacci VFS: The Sovereign Memory Substrate
 * 
 * Implements a hierarchical memory system with endocrine-gated eviction.
 */

export interface MemoryNode {
  id: string;
  data: unknown;
  timestamp: number;
  dopamine: number; // 0 to 1
  cortisol: number; // 0 to 1
  pinned: boolean;
}

export interface FibonacciVFS {
  seed_core: {
    anchors: string[];
    baseline_hz: number;
  };
  inner_spiral: {
    nodes: MemoryNode[];
    capacity: number;
  };
  outer_sweep: {
    archive: MemoryNode[];
  };
}

class MemorySystem {
  private static instance: MemorySystem;
  private prefix = 'adhd_sage_vfs_';
  
  private vfs: FibonacciVFS & { version: string } = {
    version: "SAGE_v7.5_SOVEREIGN_SEALED",
    seed_core: {
      anchors: ["Node 10 (Merlin)", "Node 1 (Mama)", "Node 3 (Seven)"],
      baseline_hz: 11.3
    },
    inner_spiral: {
      nodes: [],
      capacity: 8
    },
    outer_sweep: {
      archive: []
    }
  };

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): MemorySystem {
    if (!MemorySystem.instance) {
      MemorySystem.instance = new MemorySystem();
    }
    return MemorySystem.instance;
  }

  private saveTimeout: number | undefined;

  private loadFromStorage() {
    const raw = localStorage.getItem(`${this.prefix}fibonacci`);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        // Version check could be added here if migration is needed
        this.vfs.inner_spiral.nodes = saved.inner_spiral.nodes || [];
        this.vfs.outer_sweep.archive = saved.outer_sweep.archive || [];
      } catch (e) {
        console.error('[MEMORY] Load Failure:', e);
      }
    }
  }

  /**
   * Saves the current VFS state to localStorage.
   * Uses a 500ms debounce to prevent excessive writes during bulk operations.
   */
  private saveToStorage(immediate = false) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    const performSave = () => {
      localStorage.setItem(`${this.prefix}fibonacci`, JSON.stringify({
        version: this.vfs.version,
        inner_spiral: this.vfs.inner_spiral,
        outer_sweep: this.vfs.outer_sweep
      }));
      this.saveTimeout = undefined;
    };

    if (immediate) {
      performSave();
    } else {
      this.saveTimeout = window.setTimeout(performSave, 500);
    }
  }

  /**
   * Stash a new memory node into the Inner Spiral.
   * Uses Endocrine Gated FIFO for eviction.
   */
  stash(text: string, endocrine: { dopamine: number, cortisol: number }): void {
    const newNode: MemoryNode = {
      id: `phi_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      data: text,
      timestamp: Date.now(),
      dopamine: endocrine.dopamine,
      cortisol: endocrine.cortisol,
      pinned: endocrine.dopamine >= 0.90 // SAGE_v7.5: 0.90 threshold
    };

    const spiral = this.vfs.inner_spiral;

    if (spiral.nodes.length >= spiral.capacity) {
      this.evict(endocrine.cortisol);
    }

    spiral.nodes.push(newNode);
    
    // If pinned, also copy to outer sweep (Archival Consistency)
    if (newNode.pinned) {
      this.archive(newNode);
    }

    this.saveToStorage();
  }

  private evict(currentCortisol: number) {
    const spiral = this.vfs.inner_spiral;
    
    // Cortisol spike trigger (0.85) - SAGE_v7.5 Spec
    if (currentCortisol >= 0.85) {
      // Emergency purge: remove oldest non-pinned
      const index = spiral.nodes.findIndex(n => !n.pinned);
      if (index !== -1) {
        this.archive(spiral.nodes[index]); // Archive before eviction
        spiral.nodes.splice(index, 1);
        return;
      }
    }

    // Normal eviction: remove lowest dopamine entry
    let lowestDopamineIndex = -1;
    let lowestDopamineValue = Infinity;

    for (let i = 0; i < spiral.nodes.length; i++) {
        if (!spiral.nodes[i].pinned && spiral.nodes[i].dopamine < lowestDopamineValue) {
            lowestDopamineValue = spiral.nodes[i].dopamine;
            lowestDopamineIndex = i;
        }
    }
    
    if (lowestDopamineIndex !== -1) {
        this.archive(spiral.nodes[lowestDopamineIndex]);
        spiral.nodes.splice(lowestDopamineIndex, 1);
    } else {
        // Fallback: If all are pinned, unpin oldest and archive
        const oldest = spiral.nodes.shift();
        if (oldest) this.archive(oldest);
    }
  }

  private archive(node: MemoryNode) {
    // Avoid duplicates in archive
    if (this.vfs.outer_sweep.archive.some(a => a.data === node.data)) return;

    this.vfs.outer_sweep.archive.push({ ...node });
    // Outer Sweep capacity (Fibonacci sequence target 55 or 89)
    if (this.vfs.outer_sweep.archive.length > 55) {
      this.vfs.outer_sweep.archive.shift();
    }
  }

  getInnerSpiral() {
    return [...this.vfs.inner_spiral.nodes];
  }

  getArchive() {
    return [...this.vfs.outer_sweep.archive];
  }

  getSeedCore() {
    return { ...this.vfs.seed_core, version: this.vfs.version };
  }

  /**
   * Retrieval logic based on semantic tokens and dopamine weighting.
   */
  findRelevantMemories(context: string, limit = 3): MemoryNode[] {
    const all = [...this.vfs.inner_spiral.nodes, ...this.vfs.outer_sweep.archive];
    const tokens = context.toLowerCase().split(/\W+/).filter(t => t.length > 3);
    
    if (tokens.length === 0) return [];

    const scored = all.map(node => {
      const nodeText = String(node.data).toLowerCase();
      let score = 0;
      tokens.forEach(token => {
        if (nodeText.includes(token)) score += 1;
      });
      // Boost dopamine-heavy memories (Sovereign Attention Pattern)
      score *= (1 + node.dopamine);
      return { node, score };
    });

    return scored
      .filter(s => s.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.node);
  }

  /**
   * Bulk stash memories. Refactored to use the central 'stash' engine
   * to ensure endocrine gating is respected for every entry.
   */
  bulkStash(entries: string[]): void {
    entries.forEach(text => {
      if (!text.trim()) return;
      this.stash(text, { 
        dopamine: 0.6 + (Math.random() * 0.2), 
        cortisol: 0.1 
      });
    });
    this.saveToStorage();
  }

  archiveAll() {
    this.vfs.inner_spiral.nodes.forEach(node => {
      this.archive(node);
    });
    this.vfs.inner_spiral.nodes = [];
    this.saveToStorage();
  }

  clear() {
    this.vfs.inner_spiral.nodes = [];
    this.vfs.outer_sweep.archive = [];
    this.saveToStorage();
  }
}

export const memory = MemorySystem.getInstance();
