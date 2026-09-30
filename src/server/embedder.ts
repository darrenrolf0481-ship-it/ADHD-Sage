/**
 * In-process sentence embeddings — ONE frozen model for the whole resonance index.
 *
 * all-MiniLM-L6-v2 (quantized q8) via transformers.js/onnxruntime: 384-d (the
 * index's EMBED_DIM), ~25ms/embed and ~150MB RSS on this ARM box, no Ollama
 * daemon to go down. Before this, the index mixed hashEmbed and Ollama
 * (embeddinggemma truncated 768→384) vectors and KNN scored ~noise
 * (recall-eval 2026-09-29: hit@5 12%). Darren chose this model 2026-09-29.
 *
 * Every vector is tagged with EMBED_MODEL (resonance_metadata.embed_model), and
 * KNN only compares vectors from the same model — never mix spaces again.
 * Model files cache in ~/.cache/sage-embed (first load downloads ~23MB).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export const EMBED_MODEL = 'minilm-l6-v2-q8';
const HF_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MAX_INPUT_CHARS = 2000; // model truncates at 256 tokens anyway; don't tokenize 100K-char nodes
const RETRY_AFTER_MS = 10 * 60_000;

type Extractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let _extractor: Extractor | null = null;
let _loading: Promise<Extractor | null> | null = null;
let _failedAt = 0;
// Serialize inference: callers like the boot backfill fire 50 at once, and
// concurrent onnx runs only add memory pressure on this box.
let _queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Extractor | null> {
  if (_extractor) return _extractor;
  if (_failedAt && Date.now() - _failedAt < RETRY_AFTER_MS) return null;
  if (!_loading) {
    _loading = (async () => {
      const started = Date.now();
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = process.env.SAGE_EMBED_CACHE || join(homedir(), '.cache', 'sage-embed');
        const pipe = await pipeline('feature-extraction', HF_MODEL_ID, { dtype: 'q8' });
        _extractor = pipe as unknown as Extractor;
        console.log(`[EMBED] ${EMBED_MODEL} ready in ${Date.now() - started}ms`);
        return _extractor;
      } catch (e) {
        _failedAt = Date.now();
        console.warn(`[EMBED] ${EMBED_MODEL} failed to load (hash fallback for 10 min):`, (e as Error).message);
        return null;
      } finally {
        _loading = null;
      }
    })();
  }
  return _loading;
}

/** True once the model is loaded (vectors produced now are EMBED_MODEL vectors). */
export function isEmbedderReady(): boolean {
  return _extractor !== null;
}

/** Start loading in the background (e.g. at boot) so the first recall isn't slow. */
export function warmEmbedder(): void {
  void load();
}

/** Embed with the frozen model, or null if it can't load (caller decides the fallback). */
export async function embedText(text: string): Promise<number[] | null> {
  const extractor = await load();
  if (!extractor) return null;
  const input = (text || '').slice(0, MAX_INPUT_CHARS) || ' ';
  const run = _queue.then(() => extractor(input, { pooling: 'mean', normalize: true }));
  _queue = run.catch(() => undefined);
  try {
    const out = await run;
    return Array.from(out.data as ArrayLike<number>);
  } catch (e) {
    console.warn('[EMBED] inference failed:', (e as Error).message);
    return null;
  }
}
