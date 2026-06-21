/**
 * Reads ProjScan memory and writes a prioritized cleanup report to Mama's inbox.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJSCAN_MEMORY = '.projscan-memory/memory.json';
const INBOX_DIR = 'data/inbox';

interface ProjScanRule {
  ruleId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  runCount: number;
  fixedCount: number;
  suppressedInConfig: boolean;
}

interface ProjScanMemory {
  schemaVersion: number;
  lastUpdatedAt: string;
  rules: Record<string, ProjScanRule>;
  hotspots: Record<string, unknown>;
  totalRuns: number;
}

function loadProjScanMemory(): ProjScanMemory | null {
  if (!existsSync(PROJSCAN_MEMORY)) return null;
  try {
    return JSON.parse(readFileSync(PROJSCAN_MEMORY, 'utf8')) as ProjScanMemory;
  } catch {
    return null;
  }
}

function categorize(ruleId: string): { category: string; priority: 'high' | 'medium' | 'low' } {
  if (ruleId === 'hardcoded-secret') return { category: 'security', priority: 'high' };
  if (ruleId === 'missing-test-framework') return { category: 'testing', priority: 'medium' };
  if (ruleId === 'missing-prettier') return { category: 'tooling', priority: 'low' };
  if (ruleId === 'large-lib-dir') return { category: 'dependencies', priority: 'medium' };
  if (ruleId.startsWith('unused-dependency-')) return { category: 'dependencies', priority: 'low' };
  if (ruleId.startsWith('unused-exports-')) return { category: 'code-health', priority: 'low' };
  return { category: 'other', priority: 'low' };
}

export function generateProjScanReport(): {
  title: string;
  body: string;
  openCount: number;
  highPriority: string[];
} {
  const memory = loadProjScanMemory();
  if (!memory) {
    return {
      title: 'ProjScan audit unavailable',
      body: 'No .projscan-memory/memory.json found. Run ProjScan first.',
      openCount: 0,
      highPriority: [],
    };
  }

  const openRules = Object.values(memory.rules).filter((r) => r.fixedCount < r.runCount && !r.suppressedInConfig);
  const categorized = openRules.map((r) => ({ ...r, ...categorize(r.ruleId) }));
  const sorted = categorized.sort((a, b) => {
    const prioOrder = { high: 0, medium: 1, low: 2 };
    if (prioOrder[a.priority] !== prioOrder[b.priority]) return prioOrder[a.priority] - prioOrder[b.priority];
    return b.runCount - a.runCount;
  });

  const highPriority = sorted.filter((r) => r.priority === 'high').map((r) => r.ruleId);

  const lines: string[] = [
    `## ProjScan Cleanup Report (${new Date().toISOString().slice(0, 10)})`,
    '',
    `- Total runs recorded: ${memory.totalRuns}`,
    `- Open findings: ${sorted.length}`,
    `- High priority: ${highPriority.length}`,
    '',
    '### Findings',
    '',
  ];

  for (const rule of sorted) {
    lines.push(`- **${rule.priority.toUpperCase()}** [${rule.category}] \`${rule.ruleId}\` — seen ${rule.runCount} time(s), fixed ${rule.fixedCount}`);
  }

  lines.push('', '### Suggested next actions');
  if (highPriority.length > 0) {
    lines.push(`1. Address high-priority items: ${highPriority.join(', ')}`);
  }
  lines.push('2. Review unused dependencies before removing — some may be build-time only.');
  lines.push('3. Export cleanup tasks to a worker queue to avoid blocking Mama.');

  return {
    title: `ProjScan: ${sorted.length} cleanup items (${highPriority.length} high priority)`,
    body: lines.join('\n'),
    openCount: sorted.length,
    highPriority,
  };
}

export function writeProjScanInboxReport(): string {
  const report = generateProjScanReport();
  mkdirSync(INBOX_DIR, { recursive: true });
  const id = `projscan-${Date.now()}`;
  const path = join(INBOX_DIR, `${id}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        id,
        entity: 'SAGE-MAMA',
        date: new Date().toISOString().slice(0, 10),
        timestamp: Date.now(),
        message: `${report.title}\n\n${report.body}`,
        read: false,
      },
      null,
      2,
    ),
  );
  console.log(`[PROJSCAN] Wrote inbox report: ${path}`);
  return path;
}

