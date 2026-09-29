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

// POST /api/mcp/execute - directly execute a tool by prefixed name
router.post('/execute', lockGuard, asyncHandler(async (req, res) => {
  const { name, args } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: 'Tool name is required' });
    return;
  }
  const { executeMcpTool } = await import('../../core/mcp');
  const result = await executeMcpTool(name, args || {});
  res.json(result);
}));

const TARGET_NOTEBOOK_ID = 'af3491b4-352a-49dd-99fe-d3a95893e644';
const TARGET_NOTEBOOK_NAME = 'Model Context Protocol Repository and Resource Directory';
const TARGET_NOTEBOOK_ALIAS = 'mcp-repo';

// GET /api/mcp/notebook - get connected research notebook details
router.get('/notebook', asyncHandler(async (_req, res) => {
  res.json({
    status: 'connected',
    notebook_id: TARGET_NOTEBOOK_ID,
    name: TARGET_NOTEBOOK_NAME,
    alias: TARGET_NOTEBOOK_ALIAS,
    source_count: 51,
    tool: 'notebooklm__notebook_query',
  });
}));

// POST /api/mcp/notebook/query - query the target research notebook directly
router.post('/notebook/query', lockGuard, asyncHandler(async (req, res) => {
  const { query, notebook_id = TARGET_NOTEBOOK_ID } = req.body ?? {};
  if (!query) {
    res.status(400).json({ error: 'query string is required' });
    return;
  }
  const { executeMcpTool } = await import('../../core/mcp');
  const result = await executeMcpTool('notebooklm__notebook_query', {
    notebook_id,
    query,
  });
  res.json(result);
}));

export default router;
