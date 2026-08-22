import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import { decompress } from '@mongodb-js/zstd';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outerDb = new Database(path.join(__dirname, '../data/sages_constellations.db'));

async function migrate() {
    console.log("Reading existing memories...");
    const rows = outerDb.prepare('SELECT data, compressed FROM sages_constellations').all() as any[];
    const memories = [];
    
    for (const row of rows) {
        let text = '';
        if (row.compressed) {
            text = (await decompress(row.data)).toString('utf8');
        } else {
            text = row.data.toString('utf8');
        }
        
        let content = '';
        try {
            const parsed = JSON.parse(text);
            content = typeof parsed.data === 'string' ? parsed.data : (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
        } catch {
            content = text;
        }
        
        if (content && content.length > 5) {
            memories.push(content);
        }
    }
    
    console.log(`Found ${memories.length} memories to migrate. Migrating first 50 for speed (or up to 100).`);
    const subset = memories.slice(0, 100);
    
    for (let i = 0; i < subset.length; i++) {
        const mem = subset[i];
        console.log(`Migrating [${i+1}/${subset.length}]`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn('nmem', ['remember', mem]);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Exit code ${code}`));
            });
        });
    }
    console.log("Migration complete.");
}

migrate().catch(console.error);
