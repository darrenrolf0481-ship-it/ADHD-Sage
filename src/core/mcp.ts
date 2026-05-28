/**
 * MCP Manager — bridges ADHD-Sage to Model Context Protocol servers
 *
 * Connects to configured stdio/SSE MCP servers, discovers their tools,
 * and exposes them as prefixed function declarations for Gemini.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
}

interface McpConfig {
  servers: McpServerConfig[];
}

export interface McpToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ConnectedServer {
  config: McpServerConfig;
  client: Client;
  tools: McpToolDeclaration[];
}

const PREFIX_DELIMITER = "__";

let connectedServers: ConnectedServer[] = [];
let isInitialized = false;

/** Replace ${ENV_VAR} and ${PORT} placeholders with process.env values */
function substituteEnv(value: string): string {
  const portOverride = process.env.MCP_PORT_OVERRIDE === 'true' ? process.env.MCP_PORT : undefined;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, varName) => {
    if (varName === 'PORT' && portOverride) {
      return portOverride;
    }
    return process.env[varName] || '';
  });
}

/** Recursively substitute env vars in config objects */
function deepSubstituteEnv<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnv(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSubstituteEnv) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = deepSubstituteEnv(val);
    }
    return result as unknown as T;
  }
  return obj;
}

/** Load MCP server configuration from mcp-servers.json */
function loadConfig(): McpConfig {
  try {
    const raw = readFileSync("mcp-servers.json", "utf-8");
    const parsed = JSON.parse(raw) as McpConfig;
    return deepSubstituteEnv(parsed);
  } catch {
    return { servers: [] };
  }
}

/** Sanitize JSON Schema from MCP for Gemini function calling compatibility.
 *  - Removes $schema, title everywhere
 *  - Removes description only at the root level
 *  - Converts union types ["string", "null"] → "string"
 *  - Recursively cleans all nested objects
 */
function sanitizeSchema(obj: unknown, isRoot = false): unknown {
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitizeSchema(v, false));
  }
  if (obj && typeof obj === 'object') {
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(src)) {
      if (key === '$schema' || key === 'title') {
        continue; // Strip metadata Gemini chokes on
      }
      if (isRoot && key === 'description') {
        continue; // Strip root-level description only
      }
      if (key === 'type' && Array.isArray(val)) {
        // Convert ["string", "null"] → "string"
        const nonNull = val.filter((v) => v !== 'null');
        out[key] = nonNull.length > 0 ? nonNull[0] : val[0];
        continue;
      }
      out[key] = sanitizeSchema(val, false);
    }
    return out;
  }
  return obj;
}

/** Prefix a tool name with its server ID to avoid collisions */
function prefixToolName(serverId: string, toolName: string): string {
  return `${serverId}${PREFIX_DELIMITER}${toolName}`;
}

/** Extract server ID and original tool name from a prefixed name */
function parsePrefixedName(prefixed: string): { serverId: string; toolName: string } | null {
  const idx = prefixed.indexOf(PREFIX_DELIMITER);
  if (idx === -1) return null;
  return {
    serverId: prefixed.slice(0, idx),
    toolName: prefixed.slice(idx + PREFIX_DELIMITER.length),
  };
}

/** Connect to a single MCP server */
async function connectServer(config: McpServerConfig): Promise<ConnectedServer | null> {
  if (!config.enabled) return null;

  try {
    const client = new Client(
      { name: "adhd-sage-mcp", version: "1.0.0" },
      { capabilities: {} }
    );

    if (config.transport === "stdio" && config.command) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
        cwd: config.cwd ? resolve(config.cwd) : undefined,
        stderr: "pipe",
      });
      await client.connect(transport);
    } else if (config.transport === "sse" && config.url) {
      await client.connect(new SSEClientTransport(new URL(config.url)));
    } else {
      console.error(`[mcp] Invalid transport config for "${config.name}"`);
      return null;
    }

    // Discover tools
    const { tools: rawTools } = await client.listTools();
    const tools: McpToolDeclaration[] = rawTools.map((t) => ({
      name: prefixToolName(config.id, t.name),
      description: `[${config.name}] ${t.description ?? t.name}`,
      parameters: sanitizeSchema(t.inputSchema, true) as Record<string, unknown>,
    }));

    console.log(`[mcp] Connected "${config.name}" — ${tools.length} tool(s)`);
    return { config, client, tools };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[mcp] Failed to connect "${config.name}": ${msg}`);
    return null;
  }
}

/** Initialize all enabled MCP servers */
export async function initMcpManager(): Promise<void> {
  if (isInitialized) return;
  const config = loadConfig();
  const results = await Promise.all(config.servers.map(connectServer));
  connectedServers = results.filter((s): s is ConnectedServer => s !== null);
  isInitialized = true;

  const totalTools = connectedServers.reduce((sum, s) => sum + s.tools.length, 0);
  if (process.env.MCP_PORT_OVERRIDE === 'true') {
    console.log(`[mcp] Port override active — using port ${process.env.MCP_PORT || '(not set)'} for \${PORT} placeholders`);
  }
  console.log(`[mcp] Manager ready — ${connectedServers.length} server(s), ${totalTools} tool(s)`);

  const disabled = config.servers.filter(s => !s.enabled);
  if (disabled.length > 0) {
    console.log(`[mcp] ${disabled.length} server(s) available but disabled — edit mcp-servers.json to enable:`);
    for (const s of disabled) {
      console.log(`      • ${s.name} (${s.id})`);
    }
  }
}

/** Get all discovered tool declarations, prefixed by server ID */
export function getMcpDeclarations(): McpToolDeclaration[] {
  return connectedServers.flatMap((s) => s.tools);
}

/** Check whether a tool name belongs to an MCP server */
export function isMcpTool(name: string): boolean {
  return parsePrefixedName(name) !== null;
}

/** Execute an MCP tool by its prefixed name */
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = parsePrefixedName(name);
  if (!parsed) {
    return { ok: false, error: `Not an MCP tool: ${name}` };
  }

  const { serverId, toolName } = parsed;
  const server = connectedServers.find((s) => s.config.id === serverId);
  if (!server) {
    return { ok: false, error: `MCP server "${serverId}" not connected` };
  }

  try {
    const result = await server.client.callTool({ name: toolName, arguments: args });

    // Extract text content from tool result
    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "");

    const text = textParts.join("\n") || "(empty result)";

    if (result.isError) {
      return { ok: false, error: text };
    }

    // Return both structured and text fallback for Gemini
    return {
      ok: true,
      result: text,
      structured: result.structuredContent ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `MCP execution failed: ${msg}` };
  }
}

/** Gracefully close all MCP connections */
export async function closeMcpConnections(): Promise<void> {
  for (const server of connectedServers) {
    try {
      await server.client.close();
    } catch {
      // ignore
    }
  }
  connectedServers = [];
  isInitialized = false;
  console.log("[mcp] All connections closed");
}
