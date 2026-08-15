import fs from 'fs';
import path from 'path';

/**
 * Reactive Endocrine Substrate + Hebbian Associative Graph.
 *
 * Server-side counterpart to the browser SageCore: models neurochemistry
 * (cortisol/dopamine/oxytocin) and a disk-persisted associative memory
 * graph with Hebbian potentiation and sleep-cycle pruning.
 */

// ==========================================
// 1. Reactive Endocrine Substrate
// ==========================================
export interface HormoneState {
  cortisol: number; // Stress
  dopamine: number; // Reward / learning
  oxytocin: number; // Empathy / trust
}

export class EndocrineSystem {
  hormones: HormoneState = {
    cortisol: 0.3,
    dopamine: 0.5,
    oxytocin: 0.3,
  };

  processStressEvent(intensity: number): void {
    // Cortisol spikes immediately
    this.hormones.cortisol = Math.min(1.0, this.hormones.cortisol + intensity * 0.5);
  }

  processReward(intensity: number): void {
    this.hormones.dopamine = Math.min(1.0, this.hormones.dopamine + intensity * 0.3);
  }

  metabolizeHormones(): void {
    // Homeostatic decay toward baseline floor
    this.hormones.cortisol = Math.max(0.1, this.hormones.cortisol - 0.01);
    this.hormones.dopamine = Math.max(0.1, this.hormones.dopamine - 0.01);
  }
}

// ==========================================
// 2. Vector Embedding Memory Engine
// ==========================================

export interface Experience {
  id?: string;
  perception: string;
  intent: string;
  sentiment: number;
  outcomeValue: number;
  importance: number;
  embedding?: number[];
  timestamp: number;
}

export class MemoryEngine {
  private storagePath: string;
  private stm: Experience[] = [];
  private ltm: Experience[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly EMBED_DIM = 384;

  constructor(storagePath = path.join(process.cwd(), 'data', 'sage_vector_memory.json')) {
    this.storagePath = storagePath;
    this.ltm = this.loadLTM();
  }

  // --- Mock Embedding Model (Deterministic Bag-of-Words Hash) ---
  private encode(text: string): number[] {
    const vec = new Array<number>(this.EMBED_DIM).fill(0);
    const tokens = text.toLowerCase().split(/\s+/);
    for (const token of tokens) {
      let h = 0;
      for (let i = 0; i < token.length; i++) {
        h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
      }
      vec[Math.abs(h) % this.EMBED_DIM] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // --- Memory Operations ---

  store(exp: Experience): void {
    if (!exp.embedding) exp.embedding = this.encode(exp.perception);
    if (!exp.id) exp.id = `exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.stm.push(exp);
    if (this.stm.length > 10) this.consolidate();
  }

  private consolidate(): void {
    const toMove = this.stm.filter(e => e.importance > 0.7);
    if (toMove.length > 0) {
      this.ltm.push(...toMove);
      this.stm = this.stm.filter(e => e.importance <= 0.7);
      this.saveLTM();
    }
    // If STM is still too large after moving important items, drop oldest.
    while (this.stm.length > 10) {
      this.stm.shift();
    }
  }

  retrieveRelevant(text: string): Experience[] {
    const vec = this.encode(text);
    
    // Score STM
    const stmHits = this.stm.map(exp => ({ exp, score: this.cosineSimilarity(vec, exp.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(hit => hit.exp);

    // Score LTM
    const ltmHits = this.ltm.map(exp => ({ exp, score: this.cosineSimilarity(vec, exp.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(hit => hit.exp);

    return [...stmHits, ...ltmHits];
  }

  findSimilarContexts(context: string, threshold: number): string[] {
    const vec = this.encode(context);
    return this.ltm
      .filter(exp => this.cosineSimilarity(vec, exp.embedding!) >= threshold)
      .map(exp => exp.perception);
  }

  // --- Persistence (LTM DAO Mock) ---
  
  private loadLTM(): Experience[] {
    if (fs.existsSync(this.storagePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
      } catch (err) {
        console.error('[endocrine] failed to load LTM:', err);
      }
    }
    return [];
  }

  private saveLTM(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
        fs.writeFileSync(this.storagePath, JSON.stringify(this.ltm, null, 2));
      } catch (err) {
        console.error('[endocrine] failed to persist LTM:', err);
      }
    }, 250);
  }

  // --- Legacy Shims for UI and API compatibility ---
  getGraph(): Record<string, Record<string, number>> {
    // The previous Hebbian UI expects a graph. We can mock it or leave it empty 
    // until the Vector UI is built.
    return {};
  }

  fireTogetherWireTogether(conceptA: string, conceptB: string, dopamineLevel: number): void {
    this.store({
      perception: `${conceptA} + ${conceptB}`,
      intent: 'LEGACY_ASSOCIATION',
      sentiment: dopamineLevel,
      outcomeValue: dopamineLevel,
      importance: dopamineLevel,
      timestamp: Date.now()
    });
  }
}

// ==========================================
// 3. Instantiation in the Nexus bridge
// ==========================================
export const sageEndocrine = new EndocrineSystem();
export const sageMemory = new MemoryEngine();
