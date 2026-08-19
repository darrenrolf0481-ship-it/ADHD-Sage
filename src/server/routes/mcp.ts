import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { spoolExchangeToSpiral } from '../spiral-spool';

const router = Router();
const REGISTRY_PATH = join(process.cwd(), 'data', 'mcp_registry.json');

function getRegistry(): any {
  if (!existsSync(REGISTRY_PATH)) {
    return { version: '1.0.0', servers: {} };
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

function saveRegistry(data: any): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/mcp - list all MCP servers and their capabilities
router.get('/', asyncHandler(async (_req, res) => {
  const registry = getRegistry();
  res.json({
    status: 'success',
    total_servers: Object.keys(registry.servers || {}).length,
    registry
  });
}));

// POST /api/mcp - register or update an MCP server dynamically
router.post('/', lockGuard, asyncHandler(async (req, res) => {
  const { id, server } = req.body ?? {};
  if (!id || !server) {
    res.status(400).json({ error: 'id and server payload are required' });
    return;
  }

  const registry = getRegistry();
  registry.servers = registry.servers || {};
  registry.servers[id] = {
    ...server,
    name: server.name || id,
    updated_at: new Date().toISOString()
  };
  registry.updated_at = new Date().toISOString();

  saveRegistry(registry);

  // Spool to Spiral Vault
  try {
    spoolExchangeToSpiral(
      'ADHD-Sage',
      `[MCP_REGISTRATION] Register server ${id}`,
      `Registered MCP server ${id} with tools: ${(server.tools || []).map((t: any) => t.name).join(', ')}`,
      'system/mcp-registry',
      ['mcp_tool_update', id]
    );
  } catch {}

  res.json({
    status: 'success',
    message: `MCP server ${id} registered successfully`,
    registry
  });
}));

export default router;
