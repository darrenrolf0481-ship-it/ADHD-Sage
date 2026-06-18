import { readFileSync, writeFileSync } from 'fs';

const vfsPath = 'src/server/routes/vfs.ts';
let vfsContent = readFileSync(vfsPath, 'utf8');

// The Python logic provided says:
// 1. "Respect pinned nodes in ALL states, not just cortisol spike"
// 2. "Update existing node instead of duplicating queue entries"
// 3. "Clear inner spiral on task switch to prevent cross-task contamination"
// 4. "Batch archive instead of N individual calls"
// Let's implement these fixes in the TypeScript logic.

// Fix 1: Make eviction logic respect pinned nodes globally
// Current logic: Emergency evicts oldest non-pinned. Normal evicts lowest dopamine non-pinned.
// Actually, looking at src/server/routes/vfs.ts, it already respects pinned nodes for both:
//   const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1').get()
//   const victim = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1').get()
// However, the python snippet notes "Dopamine high = everything pins. Evict nothing."
// Let's add that to vfs.ts.

vfsContent = vfsContent.replace(
  /if \(count >= INNER_CAPACITY\) \{/g,
  `if (count >= INNER_CAPACITY) {
    // Endocrine State: DOPAMINE_SURGE -> Pin all memories, do not evict
    if (dopamine >= 0.90) {
      console.log('[ENDOCRINE] Dopamine surge — memory retention maximized');
      // If we are at capacity, we just don't insert to avoid evicting
      // Or we can just return early
      return res.status(200).json({ status: 'surge_retained', node_id: 'surged_capacity' });
    }
`
);

// We need to implement batch archiving in archive.ts later, but for vfs.ts, let's fix the "Clear inner spiral on task switch"
vfsContent = vfsContent.replace(
  /router\.post\('\/context\/push', lockGuard, \(req, res\) => \{/g,
  `router.post('/context/task', lockGuard, (req, res) => {
  // Clear inner spiral on task switch to prevent cross-task contamination
  const snapshot = innerDb.prepare('SELECT * FROM inner_spiral').all() as Array<Record<string, unknown>>;
  snapshot.forEach(archiveNodeSync);
  innerDb.prepare('DELETE FROM inner_spiral').run();
  innerDb.prepare('DELETE FROM context_buffer').run();
  res.json({ status: 'task_switched_and_cleared' });
});

router.post('/context/push', lockGuard, (req, res) => {`
);

writeFileSync(vfsPath, vfsContent);
console.log('Patched vfs.ts');
