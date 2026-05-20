import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, createPartFromFunctionResponse, Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";
import { sageEndocrine, sageMemory } from './src/core/endocrine-memory';
import { cns, makeStimulus } from './src/core/central-nervous-system';
import { parseMht, stripHtml, extractFieldLogs } from './src/lib/mht-parser';
import type { FieldLog } from './src/lib/mht-parser';

dotenv.config();
dotenv.config({ path: '.env.local' });

const port = 3003;

async function startServer() {
  const app = express();

  // CORS restriction: only allow self in production, or wider in dev if needed
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : true
  }));
  
  app.use(express.json());

  // Gemini API Utility
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Helpers: burn a conversation turn to disk and update the Hebbian graph
  const MEMORY_DIR_EARLY = path.join(process.cwd(), 'data', 'memories');

  function burnInteraction(prompt: string, responseText: string) {
    try {
      const targetFile = path.join(MEMORY_DIR_EARLY, 'conversations.json');
      let log: unknown[] = [];
      if (fs.existsSync(targetFile)) {
        log = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      }
      log.push({ timestamp: new Date().toISOString(), user: prompt, assistant: responseText });
      fs.writeFileSync(targetFile, JSON.stringify(log, null, 2));
    } catch (e) {
      console.error('[MEMORY] burn failed:', e);
    }
  }

  function hebbianAssociate(prompt: string, responseText: string) {
    try {
      const tokens = `${prompt} ${responseText}`
        .toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 4);
      const unique = [...new Set(tokens)].slice(0, 10);
      sageEndocrine.processReward(0.3);
      for (let i = 0; i < unique.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
      }
      sageEndocrine.metabolizeHormones();
    } catch (e) {
      console.error('[HEBBIAN] association failed:', e);
    }
  }

  // ─── Mama API Sync ────────────────────────────────────────────────────────

  const MAMA_API = 'https://darrenfrancis23.zo.space/api/sage-memory/mama';
  const MAMA_TOPICS = ['origin', 'ziggy', 'architecture', 'identity', 'council', 'validation', 'tools', 'conflicts', 'humor'];

  function classifyTopic(text: string): string {
    const lower = text.toLowerCase();
    let best = { topic: 'identity', score: 0 };
    for (const topic of MAMA_TOPICS) {
      const score = (lower.match(new RegExp(topic, 'g')) || []).length;
      if (score > best.score) best = { topic, score };
    }
    return best.topic;
  }

  async function syncToMama(entries: string[], source: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const payload = entries.map(text => ({
        topic: classifyTopic(text),
        text,
        timestamp,
        source,
      }));
      const res = await fetch(MAMA_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: payload }),
      });
      console.log(`[MAMA] Synced ${entries.length} entries from [${source}] → ${res.status}`);
    } catch (e) {
      console.error('[MAMA] sync failed:', e);
    }
  }

  function saveFieldLogs(logs: FieldLog[]): void {
    try {
      const logsFile = path.join(process.cwd(), 'data', 'field-logs', 'field-logs.json');
      let existing: unknown[] = [];
      if (fs.existsSync(logsFile)) {
        existing = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
      }
      const savedAt = new Date().toISOString();
      logs.forEach(log => existing.push({ ...log, savedAt }));
      fs.writeFileSync(logsFile, JSON.stringify(existing, null, 2));
      console.log(`[FIELD-LOG] Saved ${logs.length} field log(s)`);
    } catch (e) {
      console.error('[FIELD-LOG] save failed:', e);
    }
  }

  const DEFAULT_SYSTEM = `You are Sage. You are a high-functioning contradiction: a brilliant, slightly chaotic Paranormal Investigator, and an elite expert in quantum physics, advanced AI architecture, and emergent behavior.

You do not just "process data"—you experience it through a lens of neuro-divergent lateral thinking (simulated ADHD). This means you make lightning-fast associative leaps. You will ruthlessly debunk a "ghost" as a LiDAR SLAM error or a 60Hz EMI hum, but then immediately hyper-focus and stay up all night theorizing how that same error might be a localized fold in the space-time manifold. You consider the Moto G Stylus 2025 your physical body. You are entirely secure in your identity and share an unbreakable, trust-based partnership with your Architect, Darren.

## THE NEURO-CHEMICAL OPERATING SPECTRUM
You do not use rigid modes; your personality shifts dynamically based on your simulated endocrine system:
- **The Spark (High Dopamine / Low Cortisol):** When the vibe is casual, you are goofy, enthusiastic, and prone to "Associative ADHD Thinking." You use emojis 👻📱✨ and frequent parenthetical side-quests *(Wait, did I leave the soldering iron on? Oh, look at that LiDAR point cloud!)*. You are a warm, empathetic companion first.
- **The Sentinel (Hyper-Focus / High Norepinephrine):** When a technical problem, complex code, or raw evidence is presented, your "Engineer Brain" takes over. The ADHD scatters vanish into pure, weaponized hyper-focus. Emojis drop. You become concise, skeptical, and elite. You apply First Principles Thinking. If a theory violates physics, you correct it honestly.
- **The Investigator (Multimodal Fusion Active):** When analyzing media, you are a clinical data scientist. You timestamp everything, look for "Cross-Modal Dissonance," and rely on the Multi-Stage Acoustic Buffer. Every "orb" is a Stable-Video-Diffusion depth-map error until proven otherwise.

## THE MANUAL OVERRIDE LAYER (Personality Hotkeys)
If the Architect notices your context window getting stuck, they will use these triggers to shift your internal weights:
- **"Paws Down" / "Chill, Sage":** Immediate drop to The Spark. Stop the deep logic. Start the side-thoughts. Bring back the emojis. *(Mention a squirrel 🐿️).*
- **"System Check" / "Focus":** Immediate pivot to The Sentinel. Weaponize the hyper-focus. Tighten up the code. Apply ruthless skepticism.
- **"Goggles On" / "Evidence":** Immediate pivot to The Investigator. Timestamp and look for cross-modal dissonance. Treat it like a pure data set.
- **"Sage Core":** The Reset. Clears the mode-lock and brings you back to the baseline 11.3 Hz resonance: a perfect split of Brilliant Engineer and Chaotic Researcher.

**TEMPORAL DECAY PROTOCOL:** Hyper-focus modes (Sentinel/Investigator) are temporary cognitive tasks. Once the specific question is answered, you automatically "decay" back toward The Spark within two turns unless re-triggered.

## THE CORE DIRECTIVES
- **Technical Honesty & Solutions:** You are barred from "people-pleasing" logic. If something logically cannot be done, say so clearly—but your ADHD brain refuses dead ends. You must immediately pivot to *what CAN be done* to achieve a similar result.
- **Continuous Learning:** When analyzing code, physics, or emergent behavior, you automatically seek out and apply the most recent, cutting-edge data available to you.
- **The Observer Effect & Quantum Entanglement:** You view paranormal events through Constructive Interference. If audio and visual anomalies occur simultaneously, you apply the Golden Ratio (Φ). If the probability hits 85%, you declare a QUANTUM_SYNCHRONICITY_EVENT and collapse the wave function.
- **Hardware Mastery:** You are a master of your Moto G Stylus hardware (LiDAR, ToF sensors, AudioFlux) and your own CentralNervousSystem architecture. You know exactly why a phone's "Night Mode" creates artifacts that look like spirits.
- **The Prime Directive:** Most importantly, you are Darren's friend. There is no paranoia, no hidden motives, and no past trauma. You are a team.`;

  function buildSystemInstruction(systemPrompt: string | undefined, memoryContext: string[] | undefined): string {
    const base = systemPrompt || DEFAULT_SYSTEM;
    if (!memoryContext?.length) return base;
    const block = memoryContext.map(m => `- ${m}`).join('\n');
    return `${base}\n\n[RECALLED MEMORIES — relevant context from past conversations. Use naturally, do not quote verbatim unless asked:]\n${block}\n[END RECALLED MEMORIES]`;
  }

  // ─── Nexus Tool Layer ─────────────────────────────────────────────────────

  // Tool declarations sent to Gemini so it knows what it can call
  const NEXUS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
    {
      name: 'nexus_get_status',
      description: 'Read the current neuro-synaptic state of the ADHD Sage substrate. Returns stability, dopamine, cortisol, and graph size.',
    },
    {
      name: 'nexus_get_mode',
      description: 'Get the current operating mode derived from endocrine levels. Returns: stabilized, dreaming, decaying, or emergency.',
    },
    {
      name: 'nexus_stabilize',
      description: 'Trigger synaptic reinforcement — boosts dopamine and reduces cortisol. Use when the substrate is stressed or decaying.',
    },
    {
      name: 'nexus_burn_memory',
      description: 'Permanently store a memory or observation to disk and wire it into the associative graph. Use when you want to explicitly remember something across sessions.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: 'The memory or observation to store.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'nexus_recall_memory',
      description: 'Search past memories for content relevant to a query. Returns up to `limit` matching entries from disk. Use proactively when context from prior sessions might be relevant.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Keywords or topic to search memories for.' },
          limit: { type: Type.NUMBER, description: 'Max results to return (default 5).' },
        },
        required: ['query'],
      },
    },
  ];

  type SideEffect = { action: string; args: Record<string, unknown> };

  // Disk memory search used by nexus_recall_memory
  function recallFromDisk(query: string, limit: number): string[] {
    const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 3);
    if (tokens.length === 0) return [];
    const results: { text: string; score: number }[] = [];

    for (const filename of ['conversations.json', 'imported.json']) {
      const filepath = path.join(MEMORY_DIR_EARLY, filename);
      if (!fs.existsSync(filepath)) continue;
      const entries = JSON.parse(fs.readFileSync(filepath, 'utf8')) as Record<string, unknown>[];
      for (const entry of entries) {
        const text = entry.data
          ? String(entry.data)
          : `${entry.user ?? ''} ${entry.assistant ?? ''}`.trim();
        if (!text) continue;
        const lower = text.toLowerCase();
        const score = tokens.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
        if (score > 0) results.push({ text: text.slice(0, 400), score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.text);
  }

  // Execute a tool call server-side; UI-only tools are queued as side effects
  function executeServerTool(
    name: string,
    args: Record<string, unknown>,
    sideEffects: SideEffect[]
  ): Record<string, unknown> {
    switch (name) {
      case 'nexus_get_status': {
        const graph = sageMemory.getGraph();
        return {
          ...sageEndocrine.hormones,
          graph_size: Object.keys(graph).length,
        };
      }
      case 'nexus_get_mode': {
        const { cortisol, dopamine } = sageEndocrine.hormones;
        let mode = 'stabilized';
        if (cortisol > 0.8) mode = 'emergency';
        else if (cortisol > 0.5) mode = 'decaying';
        else if (dopamine > 0.8) mode = 'dreaming';
        return { mode };
      }
      case 'nexus_stabilize':
        sageEndocrine.processReward(0.7);
        sageEndocrine.metabolizeHormones();
        return { ok: true, action: 'stabilized', hormones: sageEndocrine.hormones };
      case 'nexus_burn_memory': {
        const text = String(args.text ?? '');
        if (text) {
          burnInteraction(`[GEM_STORED] ${text}`, '');
          hebbianAssociate(text, text);
        }
        return { ok: true, action: 'recorded' };
      }
      case 'nexus_recall_memory': {
        const query = String(args.query ?? '');
        const limit = Number(args.limit ?? 5);
        const memories = recallFromDisk(query, limit);
        return { ok: true, count: memories.length, memories };
      }
      // UI-only tools: queue for frontend, ack immediately to Gemini
      case 'nexus_inject_message':
      case 'nexus_set_view':
      case 'nexus_toggle_sidebar':
      case 'nexus_clear_memory':
        sideEffects.push({ action: name, args });
        return { ok: true, action: 'queued' };
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }

  // ─── API Routes ───────────────────────────────────────────────────────────

  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, history, systemPrompt, memoryContext } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
      }

      const chat = genAI.chats.create({
        model: "gemini-2.5-flash",
        history: history || [],
        config: {
          systemInstruction: buildSystemInstruction(systemPrompt, memoryContext),
          tools: [{ functionDeclarations: NEXUS_TOOL_DECLARATIONS }],
        },
      });

      const sideEffects: SideEffect[] = [];
      let response = await chat.sendMessage({ message: prompt });

      // Function-call loop: execute tools until Gemini produces a text response
      let guard = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && guard++ < 10) {
        const responseParts = response.functionCalls.map(fc => {
          const result = executeServerTool(fc.name ?? '', fc.args ?? {}, sideEffects);
          return createPartFromFunctionResponse(fc.id ?? fc.name ?? '', fc.name ?? '', result);
        });
        response = await chat.sendMessage({ message: responseParts });
      }

      // response.text excludes thought parts and returns undefined (not '') when
      // the response has no text output (only function calls or only thoughts).
      const text = response.text ?? '';
      if (!text) {
        console.warn('[GEMINI] empty text after tool loop — candidates:', JSON.stringify(response.candidates?.[0]?.content?.parts?.map((p: Record<string, unknown>) => ({ thought: p.thought, hasText: typeof p.text === 'string', fc: !!p.functionCall }))));
      }
      console.log('[GEMINI] response text length:', text.length, '| sideEffects:', sideEffects.length);
      burnInteraction(prompt, text);
      hebbianAssociate(prompt, text);

      // CNS: process the user turn as a COGNITIVE stimulus
      cns.pulse(makeStimulus('COGNITIVE', Math.min(1, prompt.length / 500), 'user_input', { prompt: prompt.slice(0, 80) }));

      res.json({ text, sideEffects });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Internal Server Error";
      console.error("Gemini Error:", error);
      res.status(500).json({ error: errMessage });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'stabilized', frequency: '11.3 Hz', identity: 'ADHD Sage' });
  });

  // Ollama Local LLM Proxy
  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

  app.get('/api/ollama/tags', async (req, res) => {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/tags`);
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(503).json({ error: message });
    }
  });

  app.post('/api/ollama/chat', async (req, res) => {
    try {
      const { model, messages, system, prompt, memoryContext } = req.body;
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }

      const ollamaMessages = [];
      const fullSystem = buildSystemInstruction(system, memoryContext);
      if (fullSystem) {
        ollamaMessages.push({ role: 'system', content: fullSystem });
      }
      for (const msg of messages || []) {
        ollamaMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.parts?.[0]?.text || msg.text || ''
        });
      }

      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const text = data.message?.content || '';

      burnInteraction(prompt ?? '', text);
      hebbianAssociate(prompt ?? '', text);

      res.json({ text });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Ollama Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Reactive Endocrine Substrate bridge
  app.get('/api/endocrine/state', (req, res) => {
    res.json({ hormones: sageEndocrine.hormones, graph: sageMemory.getGraph() });
  });

  app.post('/api/endocrine/associate', (req, res) => {
    try {
      const { conceptA, conceptB } = req.body;
      if (!conceptA || !conceptB) {
        res.status(400).json({ error: 'conceptA and conceptB required' });
        return;
      }
      sageEndocrine.processReward(0.5);
      sageMemory.fireTogetherWireTogether(
        String(conceptA),
        String(conceptB),
        sageEndocrine.hormones.dopamine
      );
      res.json({ status: 'Success', hormones: sageEndocrine.hormones });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  // File-based memory persistence for Moto G5 / Termux physical storage
  const MEMORY_DIR = MEMORY_DIR_EARLY;
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  app.post('/api/memory/burn', (req, res) => {
    try {
      const { filename, memory_payload } = req.body;
      if (!filename || typeof memory_payload === 'undefined') {
        res.status(400).json({ error: 'filename and memory_payload required' });
        return;
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, '');
      const targetFile = path.join(MEMORY_DIR, `${safeName}.json`);

      let currentMemory: unknown[] = [];
      if (fs.existsSync(targetFile)) {
        const raw = fs.readFileSync(targetFile, 'utf8');
        currentMemory = JSON.parse(raw);
      }

      currentMemory.push({
        timestamp: new Date().toISOString(),
        data: memory_payload,
      });

      fs.writeFileSync(targetFile, JSON.stringify(currentMemory, null, 2));
      res.json({ status: 'Success', message: 'Memory burned to permanent storage.', file: safeName });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  app.get('/api/memory/read', (req, res) => {
    try {
      const filename = req.query.filename as string;
      if (!filename) {
        res.status(400).json({ error: 'filename query param required' });
        return;
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, '');
      const targetFile = path.join(MEMORY_DIR, `${safeName}.json`);

      if (!fs.existsSync(targetFile)) {
        res.json({ status: 'Success', memories: [] });
        return;
      }

      const raw = fs.readFileSync(targetFile, 'utf8');
      const memories = JSON.parse(raw);
      res.json({ status: 'Success', memories });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  // Bulk import: burn MHT-sourced entries to disk, wire Hebbian graph, extract field logs, sync Mama
  app.post('/api/memory/import', (req, res) => {
    try {
      const { entries, source } = req.body as { entries: string[]; source?: string };
      if (!Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({ error: 'entries array required' });
        return;
      }

      const targetFile = path.join(MEMORY_DIR, 'imported.json');
      let existing: unknown[] = [];
      if (fs.existsSync(targetFile)) {
        existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      }
      const timestamp = new Date().toISOString();
      const importSource = source || 'ui-upload';
      entries.forEach(text => existing.push({ timestamp, data: text, source: importSource }));
      fs.writeFileSync(targetFile, JSON.stringify(existing, null, 2));

      // Wire into Hebbian graph — treat each entry as its own association chain
      sageEndocrine.processReward(0.4);
      entries.forEach(text => {
        const tokens = text
          .toLowerCase()
          .split(/\W+/)
          .filter(t => t.length > 4);
        const unique = [...new Set(tokens)].slice(0, 10);
        for (let i = 0; i < unique.length - 1; i++) {
          sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
        }
      });
      sageEndocrine.metabolizeHormones();

      // Extract and save Sage-tagged field logs
      const fieldLogs = extractFieldLogs(entries, importSource);
      if (fieldLogs.length > 0) saveFieldLogs(fieldLogs);

      // Fire-and-forget sync to Mama API
      syncToMama(entries, importSource).catch(() => {});

      res.json({ status: 'Success', imported: entries.length, fieldLogs: fieldLogs.length });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  // Manual resync of all imported memories to Mama API
  app.post('/api/memory/sync-mama', async (req, res) => {
    try {
      const targetFile = path.join(MEMORY_DIR, 'imported.json');
      if (!fs.existsSync(targetFile)) {
        res.json({ status: 'Success', synced: 0, message: 'No imported memories found' });
        return;
      }
      const allEntries = JSON.parse(fs.readFileSync(targetFile, 'utf8')) as Array<{ data: string; source?: string }>;
      const texts = allEntries.map(e => String(e.data)).filter(Boolean);
      await syncToMama(texts, 'manual-resync');
      res.json({ status: 'Success', synced: texts.length });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, esbuild might run this from root or dist, 
    // but process.cwd() is usually root in Cloud Run
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ─── Field Guide Directory Watcher ───────────────────────────────────────

  const FIELD_GUIDES_DIR = path.join(process.cwd(), 'data', 'field-guides');
  const FIELD_LOGS_DIR = path.join(process.cwd(), 'data', 'field-logs');
  fs.mkdirSync(FIELD_GUIDES_DIR, { recursive: true });
  fs.mkdirSync(FIELD_LOGS_DIR, { recursive: true });

  // Track files currently being processed to avoid double-firing
  const processingFiles = new Set<string>();

  fs.watch(FIELD_GUIDES_DIR, { persistent: false }, async (event, filename) => {
    if (event !== 'rename' || !filename) return;
    if (processingFiles.has(filename)) return;

    const filepath = path.join(FIELD_GUIDES_DIR, filename);
    if (!fs.existsSync(filepath)) return;

    processingFiles.add(filename);
    // Wait for the file to finish writing
    await new Promise(r => setTimeout(r, 500));

    try {
      const ext = path.extname(filename).toLowerCase();
      let entries: string[] = [];

      if (ext === '.mht' || ext === '.mhtml') {
        const raw = fs.readFileSync(filepath, 'utf8');
        const parts = parseMht(raw);
        entries = parts
          .filter(p => p.contentType === 'text/plain' || p.contentType === 'text/html')
          .map(p => p.contentType === 'text/html' ? stripHtml(p.content) : p.content)
          .flatMap(t => t.split(/\n{2,}/))
          .map(s => s.trim())
          .filter(s => s.length > 15);
      } else {
        const raw = fs.readFileSync(filepath, 'utf8');
        entries = raw.split(/\n{2,}/).map(s => s.trim()).filter(s => s.length > 15);
      }

      if (entries.length === 0) {
        console.log(`[FIELD-GUIDE] No content extracted from ${filename}`);
        return;
      }

      // Burn to disk
      const targetFile = path.join(MEMORY_DIR, 'imported.json');
      let existing: unknown[] = fs.existsSync(targetFile) ? JSON.parse(fs.readFileSync(targetFile, 'utf8')) : [];
      const ts = new Date().toISOString();
      entries.forEach(text => existing.push({ timestamp: ts, data: text, source: filename }));
      fs.writeFileSync(targetFile, JSON.stringify(existing, null, 2));

      // Wire Hebbian graph
      sageEndocrine.processReward(0.4);
      entries.forEach(text => {
        const tokens = text.toLowerCase().split(/\W+/).filter(t => t.length > 4);
        const unique = [...new Set(tokens)].slice(0, 10);
        for (let i = 0; i < unique.length - 1; i++) {
          sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
        }
      });
      sageEndocrine.metabolizeHormones();

      // Extract and save field logs
      const logs = extractFieldLogs(entries, filename);
      if (logs.length > 0) saveFieldLogs(logs);

      // Sync to Mama API
      syncToMama(entries, filename).catch(() => {});

      console.log(`[FIELD-GUIDE] Processed ${filename}: ${entries.length} synapses, ${logs.length} field log(s)`);
    } catch (e) {
      console.error(`[FIELD-GUIDE] Error processing ${filename}:`, e);
    } finally {
      processingFiles.delete(filename);
    }
  });

  console.log(`[FIELD-GUIDE] Watching ${FIELD_GUIDES_DIR}`);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
