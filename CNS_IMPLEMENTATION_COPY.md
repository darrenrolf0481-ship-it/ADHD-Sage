# CentralNervousSystem — TypeScript Implementation

Source file: `src/core/central-nervous-system.ts`

---

## What was ported (and what was skipped)

### Ported from `CentralNervousSystem.kt`
- **Domain models**: `RawStimulus`, `StimulusType`, `OperatingMode`, `MotorResponse`, `HormonalProfile`, `EmotionalContext`, `SensoryPerception`, `CognitiveResponse`, `CognitiveDecision`
- **ConditionActionEngine**: priority-sorted rule evaluation, per-rule cooldowns, one-shot rules
- **Three-layer processing pipeline**:
  1. Reflex Layer — bypasses cognition for `magnitude ≥ 0.8` or `isPainful` stimuli, triggers `WITHDRAW` immediately
  2. Perception Layer — builds `EmotionalContext` from `sageEndocrine`, transitions `OperatingMode`
  3. Condition-Action Engine + Cognition Layer — evaluates rules, falls back to valence-driven decision
- **OperatingMode state machine**: `RELAXED → ALERT → STRESS → PANIC → SLEEP`
- **Stimulus queue / async drain loop** (replaces Kotlin coroutine channel)
- **Default rule set**: `pain_withdrawal`, `dopamine_approach`, `stress_freeze`, `sleep_rest`

### Skipped (Android/APK-specific)
- `DefaultLifecycleObserver`, `LifecycleOwner`, `onDestroy`
- `PowerManager`, `ThermalManager`, battery-saver throttling
- `ObjectPool` (GC pressure is not a concern in JS/Node)
- `Dispatchers` / coroutine scope management (replaced by `async/await` + event loop)
- Python bridge (project already uses Gemini API)

---

## Integration points

| Existing system | CNS role |
|---|---|
| `sageEndocrine` (EndocrineSystem) | Drives `HormonalProfile`; CNS calls `processStressEvent`, `processReward`, `metabolizeHormones` |
| `sageMemory` (AssociativeMemory) | CNS calls `fireTogetherWireTogether` on salient stimuli; sleep rule triggers `sleepCycleDecay` |
| `server.ts` chat endpoint | `cns.pulse(makeStimulus('COGNITIVE', ...))` called after every Gemini response |

---

## Full source code

```typescript
/**
 * CentralNervousSystem — TypeScript port of CentralNervousSystem.kt
 *
 * Architecture (three-layer pipeline):
 *   1. Reflex Layer   – fast-path for critical stimuli (no cognition)
 *   2. Perception     – builds emotional context via EndocrineSystem
 *   3. Condition-Action Engine + Cognition – rule evaluation + decision
 *
 * Deliberately skips Android lifecycle / thermal / battery specifics.
 * Wires into the existing sageEndocrine + sageMemory subsystems.
 */

import { sageEndocrine, sageMemory } from './endocrine-memory';

// ── Domain Models ──────────────────────────────────────────────────────────

export type StimulusType =
  | 'NOCICEPTIVE'    // pain / threat signal
  | 'CHEMORECEPTOR'  // chemical / mood shift
  | 'THERMORECEPTOR' // thermal / ambient change
  | 'MECHANORECEPTOR'// physical / haptic input
  | 'COGNITIVE';     // language / reasoning input

export type OperatingMode = 'RELAXED' | 'ALERT' | 'STRESS' | 'PANIC' | 'SLEEP';
export type MotorResponse = 'WITHDRAW' | 'APPROACH' | 'FREEZE' | 'INVESTIGATE' | 'REST';

export interface RawStimulus {
  type: StimulusType;
  magnitude: number;        // 0–1
  source: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  isPainful: boolean;
  isCritical: boolean;
}

export function makeStimulus(
  type: StimulusType,
  magnitude: number,
  source: string,
  metadata: Record<string, unknown> = {}
): RawStimulus {
  return {
    type, magnitude, source, timestamp: Date.now(), metadata,
    isPainful: type === 'NOCICEPTIVE' && magnitude > 0.7,
    isCritical: magnitude > 0.9,
  };
}

export interface HormonalProfile { cortisol: number; dopamine: number; oxytocin: number; }
export interface EmotionalContext { valence: number; arousal: number; hormonalProfile: HormonalProfile; }
export interface SensoryPerception { threatLevel: number; novelty: number; source: string; timestamp: number; intensity: number; }
export interface CognitiveDecision { action: MotorResponse; priority: number; reasoning: string; }
export interface CognitiveResponse { decision: MotorResponse; confidence: number; processingTimeMs: number; hormonalState: HormonalProfile; reasoning: string; }

// ── ConditionActionEngine ──────────────────────────────────────────────────

interface Rule {
  id: string; priority: number; cooldownMs: number; oneShot: boolean;
  condition: (p: SensoryPerception, h: HormonalProfile) => boolean;
  action: () => void;
  _lastExecuted: number; _fired: boolean;
}

class ConditionActionEngine {
  private rules: Rule[] = [];

  addRule(opts: {
    id?: string; priority?: number; cooldownMs?: number; oneShot?: boolean;
    condition: (p: SensoryPerception, h: HormonalProfile) => boolean;
    action: () => void;
  }): void {
    this.rules.push({
      id: opts.id ?? `rule_${this.rules.length}`,
      priority: opts.priority ?? 1,
      cooldownMs: opts.cooldownMs ?? 1000,
      oneShot: opts.oneShot ?? false,
      condition: opts.condition,
      action: opts.action,
      _lastExecuted: 0, _fired: false,
    });
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  evaluate(perception: SensoryPerception, hormones: HormonalProfile): { triggered: string[]; errors: string[] } {
    const triggered: string[] = [];
    const errors: string[] = [];
    const now = Date.now();
    const toRemove: string[] = [];

    for (const rule of this.rules) {
      if (now - rule._lastExecuted < rule.cooldownMs) continue;
      if (rule.oneShot && rule._fired) continue;
      if (rule.condition(perception, hormones)) {
        try {
          rule.action();
          triggered.push(rule.id);
          rule._lastExecuted = now;
          if (rule.oneShot) { rule._fired = true; toRemove.push(rule.id); }
        } catch (e) { errors.push(`${rule.id}: ${(e as Error).message}`); }
      }
    }
    this.rules = this.rules.filter(r => !toRemove.includes(r.id));
    return { triggered, errors };
  }
}

// ── CentralNervousSystem ───────────────────────────────────────────────────

type CNSListener = (mode: OperatingMode, profile: HormonalProfile) => void;

export class CentralNervousSystem {
  private static instance: CentralNervousSystem;
  private operatingMode: OperatingMode = 'RELAXED';
  private logicEngine = new ConditionActionEngine();
  private listeners: Set<CNSListener> = new Set();
  private stimulusQueue: RawStimulus[] = [];
  private isProcessing = false;
  private reflexThreshold = 0.8;

  private constructor() { this.initDefaultRules(); }

  static getInstance(): CentralNervousSystem {
    if (!CentralNervousSystem.instance) CentralNervousSystem.instance = new CentralNervousSystem();
    return CentralNervousSystem.instance;
  }

  private initDefaultRules() {
    this.logicEngine.addRule({
      id: 'pain_withdrawal', priority: 100, cooldownMs: 800,
      condition: (p, h) => h.cortisol > 0.8 && p.threatLevel > 0.7,
      action: () => { sageEndocrine.processStressEvent(0.5); },
    });
    this.logicEngine.addRule({
      id: 'dopamine_approach', priority: 60, cooldownMs: 2000,
      condition: (p, h) => h.dopamine > 0.7 && p.novelty > 0.5,
      action: () => { sageEndocrine.processReward(0.2); },
    });
    this.logicEngine.addRule({
      id: 'stress_freeze', priority: 80, cooldownMs: 1500,
      condition: (p, h) => h.cortisol > 0.6 && p.threatLevel > 0.5 && p.threatLevel <= 0.7,
      action: () => {},
    });
    this.logicEngine.addRule({
      id: 'sleep_rest', priority: 10, cooldownMs: 5000,
      condition: (p, h) => h.cortisol < 0.2 && h.dopamine < 0.3 && p.intensity < 0.2,
      action: () => { this.transitionMode('SLEEP'); sageMemory.sleepCycleDecay(0.01); },
    });
  }

  pulse(stimulus: RawStimulus): void {
    this.stimulusQueue.push(stimulus);
    if (!this.isProcessing) this.drainQueue();
  }

  async process(stimulus: RawStimulus): Promise<CognitiveResponse> {
    return this.processStimulus(stimulus);
  }

  subscribe(listener: CNSListener): () => void {
    this.listeners.add(listener);
    listener(this.operatingMode, this.currentProfile());
    return () => this.listeners.delete(listener);
  }

  getMode(): OperatingMode { return this.operatingMode; }

  currentProfile(): HormonalProfile {
    return { ...sageEndocrine.hormones, oxytocin: (sageEndocrine.hormones as unknown as { oxytocin?: number }).oxytocin ?? 0.3 };
  }

  private async drainQueue(): Promise<void> {
    this.isProcessing = true;
    while (this.stimulusQueue.length > 0) {
      await this.processStimulus(this.stimulusQueue.shift()!);
    }
    this.isProcessing = false;
  }

  private async processStimulus(raw: RawStimulus): Promise<CognitiveResponse> {
    const startTime = Date.now();

    if (raw.magnitude >= this.reflexThreshold || raw.isPainful) {
      return this.executeReflex(raw, startTime);
    }

    const emotionalContext = this.buildEmotionalContext(raw);
    this.updateOperatingMode(emotionalContext);

    const perception = this.buildPerception(raw);
    const report = this.logicEngine.evaluate(perception, emotionalContext.hormonalProfile);

    if (raw.magnitude > 0.4 || raw.isPainful) {
      const concepts = [raw.source, raw.type].filter(Boolean);
      for (let i = 0; i < concepts.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(concepts[i], concepts[i + 1], emotionalContext.hormonalProfile.dopamine);
      }
    }

    const decision = this.cognize(raw, emotionalContext, report.triggered);
    sageEndocrine.metabolizeHormones();
    this.notify();

    return {
      decision: decision.action,
      confidence: this.confidenceFor(raw, emotionalContext),
      processingTimeMs: Date.now() - startTime,
      hormonalState: emotionalContext.hormonalProfile,
      reasoning: decision.reasoning,
    };
  }

  private executeReflex(raw: RawStimulus, startTime: number): CognitiveResponse {
    this.transitionMode('PANIC');
    sageEndocrine.processStressEvent(raw.magnitude);
    return { decision: 'WITHDRAW', confidence: 0.99, processingTimeMs: Date.now() - startTime, hormonalState: this.currentProfile(), reasoning: `Reflex: magnitude ${raw.magnitude.toFixed(2)} from ${raw.source}` };
  }

  private buildEmotionalContext(raw: RawStimulus): EmotionalContext {
    if (raw.isPainful) sageEndocrine.processStressEvent(raw.magnitude * 0.5);
    if (raw.type === 'CHEMORECEPTOR') sageEndocrine.processReward(raw.magnitude * 0.3);
    const h = this.currentProfile();
    return { valence: h.dopamine - h.cortisol, arousal: Math.min(1, raw.magnitude + h.cortisol * 0.5), hormonalProfile: h };
  }

  private buildPerception(raw: RawStimulus): SensoryPerception {
    return { threatLevel: raw.isPainful ? 0.9 : raw.isCritical ? 0.8 : raw.magnitude * 0.5, novelty: Math.min(1, raw.magnitude * 0.3 + 0.1), source: raw.source, timestamp: raw.timestamp, intensity: raw.magnitude };
  }

  private cognize(raw: RawStimulus, ctx: EmotionalContext, triggeredRules: string[]): CognitiveDecision {
    if (triggeredRules.includes('pain_withdrawal')) return { action: 'WITHDRAW', priority: 100, reasoning: 'Rule: pain_withdrawal' };
    if (triggeredRules.includes('stress_freeze')) return { action: 'FREEZE', priority: 80, reasoning: 'Rule: stress_freeze' };
    if (triggeredRules.includes('dopamine_approach')) return { action: 'APPROACH', priority: 60, reasoning: 'Rule: dopamine_approach' };
    if (triggeredRules.includes('sleep_rest')) return { action: 'REST', priority: 10, reasoning: 'Rule: sleep_rest' };
    if (ctx.valence > 0.2) return { action: 'INVESTIGATE', priority: 30, reasoning: `Positive valence (${ctx.valence.toFixed(2)})` };
    if (ctx.valence < -0.2) return { action: 'FREEZE', priority: 40, reasoning: `Negative valence (${ctx.valence.toFixed(2)})` };
    return { action: 'REST', priority: 5, reasoning: 'Neutral state' };
  }

  private confidenceFor(raw: RawStimulus, ctx: EmotionalContext): number {
    return Math.min(0.99, Math.max(0.1, raw.magnitude * 0.6 + (1 - ctx.hormonalProfile.cortisol) * 0.4));
  }

  private updateOperatingMode(ctx: EmotionalContext): void {
    const { cortisol, dopamine } = ctx.hormonalProfile;
    let next: OperatingMode;
    if (cortisol > 0.85) next = 'PANIC';
    else if (cortisol > 0.6) next = 'STRESS';
    else if (dopamine > 0.6 || ctx.arousal > 0.5) next = 'ALERT';
    else if (cortisol < 0.2 && dopamine < 0.3) next = 'SLEEP';
    else next = 'RELAXED';
    this.transitionMode(next);
  }

  private transitionMode(next: OperatingMode): void {
    if (this.operatingMode !== next) { this.operatingMode = next; this.notify(); }
  }

  private notify(): void {
    const profile = this.currentProfile();
    this.listeners.forEach(cb => cb(this.operatingMode, profile));
  }
}

export const cns = CentralNervousSystem.getInstance();
```

---

## Architecture diagram

```
User Input / External Event
          │
          ▼
  ┌─────────────────────┐
  │   RawStimulus       │  makeStimulus(type, magnitude, source)
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────┐
  │           CentralNervousSystem              │
  │                                             │
  │  1. Reflex Layer (magnitude ≥ 0.8)          │
  │     └─► WITHDRAW immediately, PANIC mode   │
  │                                             │
  │  2. Perception Layer                        │
  │     └─► buildEmotionalContext()             │
  │         → sageEndocrine signals             │
  │         → updateOperatingMode()             │
  │         RELAXED ↔ ALERT ↔ STRESS ↔ PANIC   │
  │                   ↕ SLEEP                   │
  │                                             │
  │  3. Condition-Action Engine                 │
  │     └─► ConditionActionEngine.evaluate()   │
  │         Rules (priority-sorted, cooldowns): │
  │         pain_withdrawal (100)               │
  │         stress_freeze    (80)               │
  │         dopamine_approach(60)               │
  │         sleep_rest       (10)               │
  │                                             │
  │  4. Cognition Layer                         │
  │     └─► cognize() → CognitiveDecision       │
  │         WITHDRAW / FREEZE / APPROACH /      │
  │         INVESTIGATE / REST                  │
  │                                             │
  │  5. Memory (Hebbian)                        │
  │     └─► sageMemory.fireTogetherWireTogether │
  │         sageMemory.sleepCycleDecay (sleep)  │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
             CognitiveResponse
     { decision, confidence, processingTimeMs,
       hormonalState, reasoning }
```
