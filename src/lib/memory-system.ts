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
  
  private vfs: FibonacciVFS = {
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

  private loadFromStorage() {
    const raw = localStorage.getItem(`${this.prefix}fibonacci`);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        this.vfs.inner_spiral.nodes = saved.inner_spiral.nodes || [];
        this.vfs.outer_sweep.archive = saved.outer_sweep.archive || [];
      } catch (e) {
        console.error('[MEMORY] Load Failure:', e);
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem(`${this.prefix}fibonacci`, JSON.stringify({
      inner_spiral: this.vfs.inner_spiral,
      outer_sweep: this.vfs.outer_sweep
    }));
  }

  /**
   * Stash a new memory node into the Inner Spiral.
   * Uses Endocrine Gated FIFO for eviction.
   */
  stash(text: string, endocrine: { dopamine: number, cortisol: number }): void {
    const newNode: MemoryNode = {
      id: `phi_${Date.now()}`,
      data: text,
      timestamp: Date.now(),
      dopamine: endocrine.dopamine,
      cortisol: endocrine.cortisol,
      pinned: endocrine.dopamine > 0.9
    };

    const spiral = this.vfs.inner_spiral;

    if (spiral.nodes.length >= spiral.capacity) {
      this.evict(endocrine.cortisol);
    }

    spiral.nodes.push(newNode);
    
    // If pinned, also copy to outer sweep
    if (newNode.pinned) {
      this.archive(newNode);
    }

    this.saveToStorage();
  }

  private evict(currentCortisol: number) {
    const spiral = this.vfs.inner_spiral;
    
    // Cortisol spike trigger (0.85)
    if (currentCortisol >= 0.85) {
      // Emergency purge: remove oldest non-pinned
      const index = spiral.nodes.findIndex(n => !n.pinned);
      if (index !== -1) {
        spiral.nodes.splice(index, 1);
        return;
      }
    }

    // Normal eviction: remove lowest dopamine entry
    let lowestDopamineIndex = 0;
    for (let i = 1; i < spiral.nodes.length; i++) {
        if (!spiral.nodes[i].pinned && spiral.nodes[i].dopamine < spiral.nodes[lowestDopamineIndex].dopamine) {
            lowestDopamineIndex = i;
        }
    }
    
    // If all are pinned (unlikely but possible), remove oldest
    if (spiral.nodes[lowestDopamineIndex].pinned) {
        spiral.nodes.shift();
    } else {
        spiral.nodes.splice(lowestDopamineIndex, 1);
    }
  }

  private archive(node: MemoryNode) {
    this.vfs.outer_sweep.archive.push({ ...node });
    // Keep archive reasonable
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
    return { ...this.vfs.seed_core };
  }

  /**
   * Simple TF-IDF like keyword matching for retrieval.
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
      // Boost dopamine-heavy memories
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
   * Bulk stash memories into the Inner Spiral.
   */
  bulkStash(entries: string[]): void {
    entries.forEach(text => {
      if (!text.trim()) return;
      
      const newNode: MemoryNode = {
        id: `phi_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        data: text,
        timestamp: Date.now(),
        dopamine: 0.6 + (Math.random() * 0.2), 
        cortisol: 0.1,
        pinned: false
      };

      const spiral = this.vfs.inner_spiral;
      if (spiral.nodes.length >= spiral.capacity) {
        this.evict(0.1);
      }
      spiral.nodes.push(newNode);
    });
    
    this.saveToStorage();
  }

  clear() {
    this.vfs.inner_spiral.nodes = [];
    this.vfs.outer_sweep.archive = [];
    this.saveToStorage();
  }
}

export const memory = MemorySystem.getInstance();
