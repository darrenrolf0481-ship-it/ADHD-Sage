import { readFileSync, writeFileSync } from 'fs';

const dbPath = 'src/server/db.ts';
let dbContent = readFileSync(dbPath, 'utf8');

dbContent = dbContent.replace(
  /CREATE TABLE IF NOT EXISTS context_buffer \(/g,
  `CREATE INDEX IF NOT EXISTS idx_inner_spiral_eviction ON inner_spiral(pinned, phi_index);
  CREATE INDEX IF NOT EXISTS idx_inner_spiral_dopamine ON inner_spiral(pinned, dopamine);
  CREATE TABLE IF NOT EXISTS context_buffer (`
);

writeFileSync(dbPath, dbContent);
console.log('Patched db.ts');
