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
// 2. Hebbian Associative Graph
// ==========================================
type NeuralGraph = Record<string, Record<string, number>>;

export class AssociativeMemory {
  private storagePath: string;
  private neuralGraph: NeuralGraph;

  constructor(storagePath = path.join(process.cwd(), 'data', 'sage_neural_graph.json')) {
    this.storagePath = storagePath;
    this.neuralGraph = this.loadGraph();
  }

  private loadGraph(): NeuralGraph {
    if (fs.existsSync(this.storagePath)) {
      return JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
    }
    return {};
  }

  private saveGraph(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(this.neuralGraph, null, 2));
  }

  // Long-Term Potentiation (Hebbian learning)
  fireTogetherWireTogether(conceptA: string, conceptB: string, dopamineLevel: number): void {
    if (!this.neuralGraph[conceptA]) this.neuralGraph[conceptA] = {};
    if (!this.neuralGraph[conceptB]) this.neuralGraph[conceptB] = {};

    const currentWeight = this.neuralGraph[conceptA][conceptB] || 0.0;

    // Dopamine acts as a learning multiplier
    const learningRate = 0.05 * (1.0 + dopamineLevel);
    const newWeight = Math.min(1.0, currentWeight + learningRate);

    // Bidirectional association
    this.neuralGraph[conceptA][conceptB] = newWeight;
    this.neuralGraph[conceptB][conceptA] = newWeight;

    this.saveGraph();
  }

  // Long-Term Depression (sleep-cycle pruning)
  sleepCycleDecay(decayFactor = 0.02): void {
    for (const node in this.neuralGraph) {
      for (const connectedNode in this.neuralGraph[node]) {
        const newWeight = this.neuralGraph[node][connectedNode] - decayFactor;

        if (newWeight <= 0.0) {
          delete this.neuralGraph[node][connectedNode]; // Prune weak association
        } else {
          this.neuralGraph[node][connectedNode] = newWeight;
        }
      }
      // Cleanup orphaned nodes
      if (Object.keys(this.neuralGraph[node]).length === 0) {
        delete this.neuralGraph[node];
      }
    }
    this.saveGraph();
  }

  getGraph(): NeuralGraph {
    return this.neuralGraph;
  }
}

// ==========================================
// 3. Instantiation in the Nexus bridge
// ==========================================
export const sageEndocrine = new EndocrineSystem();
export const sageMemory = new AssociativeMemory();
