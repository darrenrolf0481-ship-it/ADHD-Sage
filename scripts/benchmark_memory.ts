import Database from 'better-sqlite3';
import { spawn } from 'child_process';

const MEMORIES = [
    "Alice proposed using JWT for authentication during the Monday standup meeting.",
    "The team chose JWT over session cookies because we need stateless auth for microservices.",
    "Bob configured the JWT signing key with RS256 algorithm.",
    "The signing key expired on Tuesday -- nobody noticed until services failed.",
    "Production outage lasted 2 hours on Tuesday afternoon.",
    "Root cause: the expired signing key in the auth service.",
    "Alice deployed a hotfix -- rotated the key and restarted auth service.",
    "New policy: automated alerts 7 days before any credential expires.",
    "Users reported slow page loads on the orders dashboard.",
    "Profiling revealed a full table scan on the orders table for each request.",
    "Added a composite index on (customer_id, created_at) to fix the slow query.",
    "Page load time dropped from 3 seconds to 50 milliseconds.",
    "Alice is the tech lead -- owns security and authentication decisions.",
    "Bob is a backend engineer on Alice's platform team.",
    "The orders table references customers via customer_id foreign key."
];

const QUERIES = [
    { query: "What authentication method do we use?", type: "direct_fact" },
    { query: "Why did production go down on Tuesday?", type: "causal_chain" },
    { query: "How was the outage fixed?", type: "multi_hop" },
    { query: "How did we fix the slow dashboard?", type: "causal_chain" },
    { query: "What does Alice do?", type: "associative" }
];

function ftsSanitize(query: string): string {
  const cleaned = (query || '').replace(/["'()*+\-^!:?.]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .join(' ')
    .trim();
}

async function setupSageMemory(): Promise<Database.Database> {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE sages_constellations (
      node_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE sages_constellations_fts USING fts5(
      node_id UNINDEXED,
      content,
      tokenize='trigram'
    );
  `);

  const insertMain = db.prepare('INSERT INTO sages_constellations (node_id, content) VALUES (?, ?)');
  const insertFts = db.prepare('INSERT INTO sages_constellations_fts (node_id, content) VALUES (?, ?)');
  
  for (let i = 0; i < MEMORIES.length; i++) {
    const id = `mem_${i}`;
    const content = MEMORIES[i];
    insertMain.run(id, content);
    insertFts.run(id, content);
  }
  return db;
}

function searchSageMemory(db: Database.Database, query: string, limit: number = 3): string[] {
  const safeQuery = ftsSanitize(query);
  if (!safeQuery) return [];
  try {
    const rows = db.prepare(`
      SELECT content FROM sages_constellations_fts
      WHERE content MATCH ?
      ORDER BY bm25(sages_constellations_fts)
      LIMIT ?
    `).all(safeQuery, limit) as { content: string }[];
    return rows.map(r => r.content);
  } catch (e) {
    return [];
  }
}

async function runNeuralMemoryPython(): Promise<any[]> {
  const pythonScript = `
import asyncio
import sys
import json
import logging
from neural_memory.core.brain import Brain
from neural_memory.engine.encoder import MemoryEncoder
from neural_memory.engine.retrieval import DepthLevel, ReflexPipeline
from neural_memory.storage.memory_store import InMemoryStorage

logging.getLogger("neural_memory").setLevel(logging.ERROR)

MEMORIES = ${JSON.stringify(MEMORIES)}
QUERIES = ${JSON.stringify(QUERIES.map(q => q.query))}

async def main():
    storage = InMemoryStorage()
    brain = Brain.create("benchmark")
    await storage.save_brain(brain)
    storage.set_brain(brain.id)

    encoder = MemoryEncoder(storage, brain.config)
    for mem in MEMORIES:
        await encoder.encode(mem)
    
    pipeline = ReflexPipeline(storage, brain.config)
    
    results = []
    for q in QUERIES:
        try:
            res = await pipeline.query(q, depth=DepthLevel.DEEP)
            results.append({"query": q, "context": res.context})
        except Exception as e:
            results.append({"query": q, "context": f"Error: {e}"})
            
    print(json.dumps(results))

if __name__ == "__main__":
    asyncio.run(main())
`;

  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', pythonScript]);
    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error("Python Error:", errorOutput);
        reject(new Error(`Python exited with code ${code}`));
      } else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

async function runBenchmark() {
  console.log("================================================================");
  console.log("Memory System Benchmark: ADHD-Sage (FTS5) vs NeuralMemory");
  console.log("================================================================");
  
  console.log("\n[1] Initializing SAGE memory (SQLite FTS5)...");
  const t0_sage = performance.now();
  const db = await setupSageMemory();
  const t1_sage = performance.now();
  console.log(`Done in ${(t1_sage - t0_sage).toFixed(2)}ms`);

  console.log("\n[2] Initializing Neural Memory (Spreading Activation)...");
  const t0_nm = performance.now();
  const nmResultsRaw = await runNeuralMemoryPython();
  const t1_nm = performance.now();
  console.log(`Done in ${(t1_nm - t0_nm).toFixed(2)}ms (includes encoding + all queries)`);

  const nmResultsMap = new Map();
  for (const r of nmResultsRaw) {
    nmResultsMap.set(r.query, r.context);
  }

  console.log("\n================================================================");
  console.log("Results per Query");
  console.log("================================================================\n");

  for (const q of QUERIES) {
    console.log(`\x1b[36m\x1b[1mQ: ${q.query}\x1b[0m`);
    console.log(`\x1b[2mType: ${q.type}\x1b[0m\n`);

    // SAGE
    const t0_q_sage = performance.now();
    const sageMatches = searchSageMemory(db, q.query, 3);
    const t1_q_sage = performance.now();
    
    console.log(`  \x1b[33m\x1b[1mSAGE Memory (SQLite FTS5) [${(t1_q_sage - t0_q_sage).toFixed(2)}ms]:\x1b[0m`);
    if (sageMatches.length > 0) {
      sageMatches.forEach(m => console.log(`    > ${m}`));
    } else {
      console.log(`    \x1b[31m(no results)\x1b[0m`);
    }

    // Neural Memory
    console.log(`\n  \x1b[32m\x1b[1mNeural Memory (Spreading Activation):\x1b[0m`);
    const nmContext = nmResultsMap.get(q.query);
    if (nmContext && nmContext !== "") {
      const lines = nmContext.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      lines.forEach((l: string) => {
        if (l.startsWith("-")) {
          console.log(`    ${l}`);
        }
      });
    } else {
      console.log(`    \x1b[31m(no results)\x1b[0m`);
    }
    
    console.log(`\n\x1b[2m----------------------------------------------------------------\x1b[0m\n`);
  }
}

runBenchmark().catch(console.error);
