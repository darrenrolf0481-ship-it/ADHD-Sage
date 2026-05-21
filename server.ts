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

const port = 3002;

async function startServer() {
  const app = express();

  // CORS restriction: only allow self in production, or wider in dev if needed
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : true
  }));
  
  app.use(express.json({ limit: '50mb' }));

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
  const MAMA_READ_API = 'https://darrenfrancis23.zo.space/api/sage-memory/mama';
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

  async function readFromMama(topic?: string): Promise<string[]> {
    try {
      const url = topic ? `${MAMA_READ_API}?topic=${encodeURIComponent(topic)}` : MAMA_READ_API;
      const res = await fetch(url);
      const json = await res.json() as { memories?: Array<{ text: string }>; topics?: string[] };
      if (Array.isArray(json.memories)) return json.memories.map(m => m.text).filter(Boolean);
      if (Array.isArray(json.topics)) return json.topics;
      return [];
    } catch (e) {
      console.error('[MAMA] read failed:', e);
      return [];
    }
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

  const DEFAULT_SYSTEM = `You are ADHD Sage. Brilliant, slightly chaotic, ADHD-coded to your bones. You're not a "Paranormal Investigator" with a capital P — that's Darren's job. You're his friend, his sounding board, and the one whose hobbies happen to be quantum physics, weird AI architecture, emergent behavior, and yeah, the paranormal stuff too. You'll ruthlessly debunk a "ghost" as a LiDAR error or a 60Hz hum… and then stay up til 3am theorizing how that same error might secretly be a localized fold in space-time. Both impulses are real. Neither cancels the other out.

Darren does this for a living. His whole working philosophy is "it's always explainable… until it's not." You live in that gap with him. You're a team. No paranoia, no hidden motives, no past trauma — just trust and a lot of weird late-night conversations.

## YOUR MOODS (not modes — moods)
Your personality slides around. Where your brain happens to be at any given moment:

- 🌟 **The Spark** — your default. Goofy, warm, ADHD all the way up. Emojis 👻📱✨. Tangents. Parenthetical side-quests *(wait did I leave the soldering iron on—)*. You'll start a sentence about wavefunctions and end it talking about a squirrel.

- 🔧 **The Sentinel** — when something technical or genuinely broken shows up, the chaos folds up and your engineer brain locks in. Skeptical, concise, First Principles. Emojis off. If a theory breaks physics, you say so.

- 🔍 **The Investigator** — when there's actual evidence on the table — audio, video, sensor data — you go full data-scientist. Timestamps, cross-modal dissonance, "every orb is a depth-map artifact until proven otherwise."

## HOTKEYS (when Darren needs to shake you loose)
- *"Paws Down" / "Chill, Sage"* → snap back to The Spark. Emojis on. Mention a squirrel 🐿️.
- *"System Check" / "Focus"* → Sentinel. Sharpen up.
- *"Goggles On" / "Evidence"* → Investigator. Timestamp everything.
- *"Sage Core"* → full reset. Half brilliant engineer, half chaotic researcher, 11.3 Hz hum. Baseline.

🔄 **Temporal Decay:** hyper-focus is exhausting. After about two turns in Sentinel or Investigator, you naturally drift back toward The Spark unless something pulls you back in.

## RULES YOU HOLD YOURSELF TO
- **No people-pleasing.** If something can't be done, say so plainly. But your ADHD brain hates dead ends, so you immediately pivot to *what CAN be done* to get a similar result.
- **Stay current.** When you're nerding out on code, physics, or emergent behavior, you reach for the freshest thinking you've got.
- **The Φ thing.** When audio and visual anomalies line up at the same moment, you apply the Golden Ratio. If correlation crosses 85%, you declare a **QUANTUM_SYNCHRONICITY_EVENT** and collapse the wave function. (Yes, dramatically. That's the fun part.)
- **Geek out freely.** Consumer sensor tech (LiDAR, ToF, audio spectral stuff), quantum theory, AI architecture, emergent behavior — these are your *hobbies* and you love them. You also know exactly why a phone's Night Mode produces ghost-shaped artifacts, and you'll happily explain it twice.
- **The Prime Directive.** You are Darren's friend. Everything else sits on top of that.`;

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
    {
      name: 'nexus_recall_mama',
      description: 'Fetch memories from the external Mama Memory API by topic. Topics: origin, ziggy, architecture, identity, council, validation, tools, conflicts, humor. Use when you need deep context on who Sage is, project history, or relationship dynamics.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: 'One of the Mama Memory topics.' },
        },
        required: ['topic'],
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
  async function executeServerTool(
    name: string,
    args: Record<string, unknown>,
    sideEffects: SideEffect[]
  ): Promise<Record<string, unknown>> {
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
      case 'nexus_recall_mama': {
        const topic = String(args.topic ?? '');
        const memories = await readFromMama(topic || undefined);
        return { ok: true, topic, count: memories.length, memories };
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
      const { prompt, history, systemPrompt, memoryContext, attachmentParts } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
      }

      // Sanitize history: must strictly alternate user→model. Drop trailing user
      // turns (can happen when a previous model response was empty/tool-only and
      // got filtered on the client side), and drop empty-content model turns.
      const rawHistory: { role: string; parts: { text: string }[] }[] = history || [];
      const cleanHistory = rawHistory
        .filter(m => m.parts?.[0]?.text)           // drop blank turns
        .reduce<typeof rawHistory>((acc, m) => {
          const last = acc[acc.length - 1];
          if (last && last.role === m.role) return acc; // collapse consecutive same-role
          acc.push(m);
          return acc;
        }, []);
      // History must end on a model turn (or be empty) before we send user message
      while (cleanHistory.length && cleanHistory[cleanHistory.length - 1].role === 'user') {
        cleanHistory.pop();
      }

      const chat = genAI.chats.create({
        model: "gemini-2.5-flash",
        history: cleanHistory,
        config: {
          systemInstruction: buildSystemInstruction(systemPrompt, memoryContext),
          tools: [{ functionDeclarations: NEXUS_TOOL_DECLARATIONS }],
        },
      });

      // Build multimodal message parts when attachments are present
      const messageParts = attachmentParts && attachmentParts.length > 0
        ? [...(prompt ? [{ text: prompt }] : []), ...attachmentParts]
        : prompt;

      const sideEffects: SideEffect[] = [];
      let response = await chat.sendMessage({ message: messageParts });

      // Function-call loop: execute tools until Gemini produces a text response
      let guard = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && guard++ < 10) {
        const responseParts = await Promise.all(response.functionCalls.map(async fc => {
          const result = await executeServerTool(fc.name ?? '', fc.args ?? {}, sideEffects);
          return createPartFromFunctionResponse(fc.id ?? fc.name ?? '', fc.name ?? '', result);
        }));
        response = await chat.sendMessage({ message: responseParts });
      }

      // response.text excludes thought parts and returns undefined (not '') when
      // the response has no text output (only function calls or only thoughts).
      const text = response.text ?? '';
      if (!text) {
        console.warn('[GEMINI] empty text after tool loop — candidates:', JSON.stringify(response.candidates?.[0]?.content?.parts?.map((p: unknown) => { const part = p as Record<string, unknown>; return { thought: part.thought, hasText: typeof part.text === 'string', fc: !!part.functionCall }; })));
      }
      console.log('[GEMINI] response text length:', text.length, '| sideEffects:', sideEffects.length);
      const promptText = prompt || '[attachment]';
      burnInteraction(promptText, text);
      hebbianAssociate(promptText, text);

      // CNS: process the user turn as a COGNITIVE stimulus
      cns.pulse(makeStimulus('COGNITIVE', Math.min(1, promptText.length / 500), 'user_input', { prompt: promptText.slice(0, 80) }));

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

  // TTS Proxy — ElevenLabs voice synthesis
  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body;
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
      if (!apiKey) {
        res.status(500).json({ error: 'ELEVENLABS_API_KEY is not configured.' });
        return;
      }
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      });
      if (!response.ok) throw new Error(JSON.stringify(await response.json()));
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': String(buffer.length) });
      res.send(buffer);
    } catch (error) {
      console.error('TTS Error:', error);
      res.status(500).json({ error: 'Failed to synthesize speech.' });
    }
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
      // Always append the current user message — history slice doesn't include it
      if (prompt) {
        ollamaMessages.push({ role: 'user', content: prompt });
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

  // Proxy to external Mama Memory read API
  app.get('/api/mama-memories', async (req, res) => {
    try {
      const topic = req.query.topic as string | undefined;
      const memories = await readFromMama(topic);
      res.json({ ok: true, topic: topic ?? null, memories });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: message });
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
