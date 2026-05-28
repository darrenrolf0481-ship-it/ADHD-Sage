import { writeJournalEntry, type JournalConfig } from '../lib/journal-agent';
import { runSelfImprovement, type SelfImproveConfig } from '../lib/self-improvement-agent';
import { PORT } from './config';

// ─── Daily Journal Scheduler ─────────────────────────────────────────────────
// Fires once a day at JOURNAL_HOUR (default 06:00 local time).
// Each configured entity in JOURNAL_ENTITIES env var gets a turn.
//
// Format: JOURNAL_ENTITIES=sage:gemini:,entity2:ollama:llama3,entity3:openrouter:google/gemma-4-31b-it:free
// (entity:provider:model — model is optional for gemini)

function parseJournalEntities(): JournalConfig[] {
  const raw = process.env.JOURNAL_ENTITIES || 'sage:gemini:';
  return raw.split(',').map(entry => {
    const [entity, provider, ...modelParts] = entry.trim().split(':');
    return {
      entity: entity || 'sage',
      provider: (provider || 'gemini') as JournalConfig['provider'],
      model: modelParts.join(':') || '',
      apiBase: `http://localhost:${PORT}`,
    };
  }).filter(c => c.entity && c.provider);
}

export function scheduleDailyJournal() {
  const JOURNAL_HOUR = parseInt(process.env.JOURNAL_HOUR || '6');
  let lastFiredDate = '';

  const tick = async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() === JOURNAL_HOUR && lastFiredDate !== today) {
      lastFiredDate = today;
      console.log(`[JOURNAL] Daily wakeup — ${today}`);
      const entities = parseJournalEntities();
      for (const cfg of entities) {
        try {
          await writeJournalEntry(cfg);
          // Stagger entries so they don't all hammer the LLM simultaneously
          await new Promise(r => setTimeout(r, 15_000));
        } catch (err) {
          console.error(`[JOURNAL] Failed for ${cfg.entity}:`, err);
        }
      }
    }
  };

  // Check every minute
  setInterval(tick, 60_000);
  console.log(`[JOURNAL] Scheduler armed — fires daily at ${JOURNAL_HOUR}:00`);
}

// ─── Weekly Self-Improvement Scheduler ───────────────────────────────────────
// Fires every Sunday at SELF_IMPROVE_HOUR (default 10am).
// Uses the same entity list as the journal scheduler.
// SELF_IMPROVE_DAY: 0=Sun, 1=Mon, ... 6=Sat

export function scheduleWeeklySelfImprovement() {
  const HOUR = parseInt(process.env.SELF_IMPROVE_HOUR || '10');
  const DAY  = parseInt(process.env.SELF_IMPROVE_DAY  || '0');
  let lastFiredWeek = '';

  const tick = async () => {
    const now  = new Date();
    const week = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}-${now.getDay()}`;
    if (now.getDay() === DAY && now.getHours() === HOUR && lastFiredWeek !== week) {
      lastFiredWeek = week;
      console.log(`[SELF-IMPROVE] Weekly run — ${now.toISOString().slice(0, 10)}`);
      // Reuse the same entity list as the journal
      const raw = process.env.JOURNAL_ENTITIES || 'sage:gemini:';
      const entities = raw.split(',').map(e => {
        const [entity, provider, ...modelParts] = e.trim().split(':');
        return { entity, provider, model: modelParts.join(':') || '' } as SelfImproveConfig;
      }).filter(c => c.entity && c.provider);

      for (const cfg of entities) {
        try {
          await runSelfImprovement({ ...cfg, apiBase: `http://localhost:${PORT}` });
          await new Promise(r => setTimeout(r, 30_000)); // stagger — reflections take time
        } catch (err) {
          console.error(`[SELF-IMPROVE] Failed for ${cfg.entity}:`, err);
        }
      }
    }
  };

  setInterval(tick, 60_000);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  console.log(`[SELF-IMPROVE] Scheduler armed — fires ${dayNames[DAY]}s at ${HOUR}:00`);
}
