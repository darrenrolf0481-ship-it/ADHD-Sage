import { readFileSync } from 'node:fs';
import { innerDb, outerDb } from './db';
import { rollingAvgCortisol, clearCortisol, getCurrentMode } from './neuro';
import { stashMemory } from './stash';
import { searchLocalMemories } from './memory-local';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../lib/supermemory';
import { isMcpTool, executeMcpTool } from '../core/mcp';

export const gemTools = JSON.parse(readFileSync('gem-tools.json', 'utf-8'));

export type ToolEffect = { type: string; payload: Record<string, unknown> };

// Helper to recursively remove null/undefined from tool responses for Gemini
export function cleanResponse(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanResponse);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = cleanResponse(value);
      }
      return acc;
    }, {} as any);
  }
  return obj;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  toolEffects: ToolEffect[]
): Promise<Record<string, unknown>> {
  // Route MCP-prefixed tools to the MCP manager
  if (isMcpTool(name)) {
    return executeMcpTool(name, args);
  }

  switch (name) {
    case 'nexus_get_status': {
      const innerCount = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral').get() as { c: number }).c;
      const outerCount = (outerDb.prepare('SELECT COUNT(*) as c FROM sages_constellations').get() as { c: number }).c;
      const pinned = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral WHERE pinned = 1').get() as { c: number }).c;
      const avgDopamine = innerCount > 0
        ? (innerDb.prepare('SELECT AVG(dopamine) as a FROM inner_spiral').get() as { a: number }).a
        : 0.5;
      return {
        stability: Math.max(0, 1 - rollingAvgCortisol()),
        dopamine: avgDopamine,
        cortisol: rollingAvgCortisol(),
        frequency: 11.3,
        lastPulse: Date.now(),
        innerNodes: innerCount,
        outerNodes: outerCount,
        pinnedNodes: pinned
      };
    }
    case 'nexus_get_mode': {
      return { mode: getCurrentMode() };
    }
    case 'nexus_stabilize': {
      clearCortisol();
      return { ok: true, action: 'stabilized', mode: getCurrentMode() };
    }
    case 'nexus_record_interaction': {
      const text = String(args.text || '');
      if (!text) return { ok: false, error: 'text required' };
      const { nodeId } = stashMemory(text, 0.6, 0.1);
      return { ok: true, action: 'recorded', nodeId };
    }
    case 'nexus_burn_memory': {
      const text = String(args.text || '');
      if (!text) return { ok: false, error: 'text required' };
      const { nodeId, pinned } = stashMemory(text, 0.95, 0.1);
      return { ok: true, action: 'burned', nodeId, pinned };
    }
    case 'nexus_recall_memory': {
      const query = String(args.query || '');
      const limit = typeof args.limit === 'number' ? args.limit : 5;
      if (!query) return { ok: false, error: 'query required' };

      const [cloudResults, localResults] = await Promise.all([
        searchMemories(query, [SAGE_CONTAINER, SHARED_CONTAINER], limit),
        searchLocalMemories(query, limit)
      ]);

      // Merge and deduplicate
      const combined = [...new Set([...localResults, ...cloudResults])].slice(0, limit);
      return { ok: true, results: combined };
    }
    case 'nexus_clear_memory': {
      innerDb.prepare('DELETE FROM inner_spiral').run();
      outerDb.prepare('DELETE FROM sages_constellations').run();
      clearCortisol();
      return { ok: true, action: 'purged' };
    }
    case 'nexus_inject_message': {
      const text = String(args.text || '');
      const role = String(args.role || 'system');
      toolEffects.push({ type: 'inject_message', payload: { text, role } });
      return { ok: true, action: 'injected' };
    }
    case 'nexus_set_view': {
      const view = String(args.view || 'chat');
      toolEffects.push({ type: 'set_view', payload: { view } });
      return { ok: true, action: 'view_set', view };
    }
    case 'nexus_toggle_sidebar': {
      toolEffects.push({ type: 'toggle_sidebar', payload: {} });
      return { ok: true, action: 'toggled' };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
