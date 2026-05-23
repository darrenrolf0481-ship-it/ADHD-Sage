/**
 * Fibonacci VFS v7.5 — Client-side Memory Layer
 *
 * Delegates persistence to server-side SQLite via the /api/vfs/* REST API.
 * LocalStorage is kept as a read-cache for offline/degraded scenarios and
 * is invalidated on every successful server sync.
 */

export interface MemoryNode {
  id: string;
  data: unknown;
  timestamp: number;
  dopamine: number;
  cortisol: number;
  pinned: boolean;
}

// capacity_validator: 8 == 4 * 2  (index_keys=[2,3,5,8], slots_per_index_key=2)
const INNER_CAPACITY = 8;
console.assert(INNER_CAPACITY === 4 * 2, '[VFS] capacity_validator failed');

const CACHE_KEY = 'adhd_sage_vfs_fibonacci';
const ROLLING_WINDOW = 5;

class MemorySystem {
  private static instance: MemorySystem;

  // Local state — kept in sync with server
  private innerCache: MemoryNode[] = [];
  private outerCache: MemoryNode[] = [];

  // context_buffer — max_length 100, FIFO, local-only
  private contextBuffer: string[] = [];
  private readonly CONTEXT_MAX = 100;

  // Rolling cortisol history for requires_absolute_floor
  private cortisolHistory: number[] = [];

  private constructor() {
    this.loadCacheFromStorage();
    // Hydrate from server on init
    this.syncFromServer().catch(() => {/* offline — cache is fine */});
  }

  static getInstance(): MemorySystem {
    if (!MemorySystem.instance) {
      MemorySystem.instance = new MemorySystem();
    }
    return MemorySystem.instance;
  }

  // ── Context Buffer (local, spec §context_buffer_config) ──────────────────

  pushContext(text: string): void {
    this.contextBuffer.push(text);
    if (this.contextBuffer.length > this.CONTEXT_MAX) {
      this.contextBuffer.shift(); // FIFO eviction
    }
    // Persist to server context_buffer table
    fetch('/api/vfs/inner/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch(() => {/* fire-and-forget */});
  }

  getContextBuffer(): string[] {
    return [...this.contextBuffer];
  }

  // ── Stash (async, delegates to server) ───────────────────────────────────

  async stash(text: string, endocrine: { dopamine: number; cortisol: number }): Promise<void> {
    this.recordCortisol(endocrine.cortisol);
    try {
      const res = await fetch('/api/vfs/inner/stash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: text, dopamine: endocrine.dopamine, cortisol: endocrine.cortisol }),
      });
      if (res.ok) {
        await this.syncFromServer();
        return;
      }
    } catch { /* offline fallback */ }

    // Offline: run eviction locally
    this.localEvict(endocrine.cortisol);
    const node: MemoryNode = {
      id: `phi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      data: text,
      timestamp: Date.now(),
      dopamine: endocrine.dopamine,
      cortisol: endocrine.cortisol,
      pinned: endocrine.dopamine >= 0.90,
    };
    this.innerCache.push(node);
    if (node.pinned) this.localArchive(node);
    this.saveCacheToStorage();
  }

  async bulkStash(entries: string[]): Promise<void> {
    for (const text of entries) {
      if (!text.trim()) continue;
      await this.stash(text, { dopamine: 0.6 + Math.random() * 0.2, cortisol: 0.1 });
    }
  }

  async archiveAll(): Promise<void> {
    try {
      const inner = await this.fetchInner();
      await Promise.all(inner.map(node => this.archiveNodeToServer(node)));
      // Clear inner spiral
      await Promise.all(inner.map(n =>
        fetch(`/api/vfs/inner/${n.id}`, { method: 'DELETE' }).catch(() => {})
      ));
      await this.syncFromServer();
    } catch {
      // Offline fallback
      this.innerCache.forEach(n => this.localArchive(n));
      this.innerCache = [];
      this.saveCacheToStorage();
    }
  }

  // ── Read accessors ────────────────────────────────────────────────────────

  getInnerSpiral(): MemoryNode[] {
    return [...this.innerCache];
  }

  getArchive(): MemoryNode[] {
    return [...this.outerCache];
  }

  getSeedCore() {
    return {
      anchors: ['Node 10 (Merlin)', 'Node 1 (Mama)', 'Node 3 (Seven)'],
      baseline_hz: 11.3,
      version: '7.5.0',
    };
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  findRelevantMemories(context: string, limit = 3): MemoryNode[] {
    const all = [...this.innerCache, ...this.outerCache];
    const tokens = context.toLowerCase().split(/\W+/).filter(t => t.length > 3);
    if (tokens.length === 0) return [];

    const scored = all.map(node => {
      const nodeText = String(node.data).toLowerCase();
      let score = 0;
      tokens.forEach(t => { if (nodeText.includes(t)) score += 1; });
      score *= (1 + node.dopamine);
      return { node, score };
    });

    return scored
      .filter(s => s.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.node);
  }

  clear() {
    this.innerCache = [];
    this.outerCache = [];
    this.saveCacheToStorage();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private recordCortisol(val: number) {
    this.cortisolHistory.push(val);
    if (this.cortisolHistory.length > ROLLING_WINDOW) this.cortisolHistory.shift();
  }

  private rollingAvgCortisol(): number {
    if (this.cortisolHistory.length === 0) return 0;
    return this.cortisolHistory.reduce((a, b) => a + b, 0) / this.cortisolHistory.length;
  }

  private localEvict(currentCortisol: number) {
    if (this.innerCache.length < INNER_CAPACITY) return;
    const avg = this.rollingAvgCortisol();
    const spiking = currentCortisol >= 0.85 && currentCortisol >= avg + 0.3; // requires_absolute_floor

    if (spiking) {
      const idx = this.innerCache.findIndex(n => !n.pinned);
      if (idx !== -1) { this.localArchive(this.innerCache[idx]); this.innerCache.splice(idx, 1); return; }
    }

    let lowestIdx = -1, lowestVal = Infinity;
    for (let i = 0; i < this.innerCache.length; i++) {
      if (!this.innerCache[i].pinned && this.innerCache[i].dopamine < lowestVal) {
        lowestVal = this.innerCache[i].dopamine;
        lowestIdx = i;
      }
    }
    if (lowestIdx !== -1) {
      this.localArchive(this.innerCache[lowestIdx]);
      this.innerCache.splice(lowestIdx, 1);
    } else {
      const oldest = this.innerCache.shift();
      if (oldest) this.localArchive(oldest);
    }
  }

  private localArchive(node: MemoryNode) {
    if (this.outerCache.some(a => a.data === node.data)) return;
    this.outerCache.push({ ...node });
    if (this.outerCache.length > 89) this.outerCache.shift(); // outer_sweep max index_key
  }

  private async fetchInner(): Promise<MemoryNode[]> {
    const res = await fetch('/api/vfs/inner');
    const rows = await res.json() as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.node_id as string,
      data: r.data,
      timestamp: r.timestamp as number,
      dopamine: r.dopamine as number,
      cortisol: r.cortisol as number,
      pinned: r.pinned as boolean,
    }));
  }

  private async fetchOuter(): Promise<MemoryNode[]> {
    const res = await fetch('/api/vfs/outer');
    const rows = await res.json() as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.node_id as string,
      data: r.data,
      timestamp: r.timestamp as number,
      dopamine: r.dopamine as number,
      cortisol: r.cortisol as number,
      pinned: r.pinned as boolean,
    }));
  }

  private async archiveNodeToServer(node: MemoryNode): Promise<void> {
    await fetch('/api/vfs/outer/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node: { node_id: node.id, ...node } }),
    });
  }

  private async syncFromServer(): Promise<void> {
    const [inner, outer] = await Promise.all([this.fetchInner(), this.fetchOuter()]);
    this.innerCache = inner;
    this.outerCache = outer;
    this.saveCacheToStorage();
  }

  private loadCacheFromStorage() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.innerCache = saved.inner_spiral?.nodes || [];
      this.outerCache = saved.outer_sweep?.archive || [];
    } catch { /* corrupt cache — ignore */ }
  }

  private saveToStorageTimeout: ReturnType<typeof setTimeout> | undefined;

  private saveCacheToStorage(immediate = false) {
    if (this.saveToStorageTimeout) clearTimeout(this.saveToStorageTimeout);
    const perform = () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        version: '7.5.0',
        schema: 'fibonacci_vfs.v7',
        inner_spiral: { nodes: this.innerCache },
        outer_sweep: { archive: this.outerCache },
      }));
    };
    if (immediate) perform();
    else this.saveToStorageTimeout = setTimeout(perform, 500);
  }
}

export const memory = MemorySystem.getInstance();
