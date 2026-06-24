/**
 * MCP tool-call dispatch layer.
 * Complements sync.ts (which uses direct method names) — these tools
 * are invoked via the standard tools/call JSON-RPC method.
 */

const JSON_RPC_VERSION = '2.0';
let _reqId = 1000;

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  examples?: { arguments: Record<string, unknown> }[];
}

export async function callTool<T extends Record<string, unknown>>(
  host: string,
  name: string,
  args: Record<string, unknown> = {},
  apiKey?: string
): Promise<T> {
  const url = `${host}/mcp`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  } else {
    console.warn('[mcp] callTool() called without an API key — requests may be rejected by the Worker. Set your MCP API key in Settings.');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: _reqId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) {
    const errMsg = res.status === 401
      ? `HTTP 401: Unauthorized — check your MCP API key in Settings`
      : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errMsg);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
}

export async function checkAuth(
  host: string,
  apiKey?: string
): Promise<{ authenticated: boolean }> {
  try {
    const url = `${host}/mcp`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: _reqId++,
        method: 'tools/call',
        params: { name: 'lore_manage', arguments: { action: 'auth_check' } },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    const metadata = (json.result as { metadata?: { authenticated?: boolean } })?.metadata;
    return { authenticated: metadata?.authenticated ?? false };
  } catch {
    return { authenticated: false };
  }
}

export async function listTools(
  host: string,
  apiKey?: string
): Promise<Tool[]> {
  try {
    const url = `${host}/mcp`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    } else {
      console.warn('[mcp] listTools() called without an API key — requests may be rejected by the Worker. Set your MCP API key in Settings.');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: _reqId++,
        method: 'tools/list',
        params: {},
      }),
    });
    if (!res.ok) {
      const errMsg = res.status === 401
        ? `HTTP 401: Unauthorized — check your MCP API key in Settings`
        : `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(errMsg);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    const result = json.result as { tools?: Tool[] };
    return result.tools ?? [];
  } catch (e) {
    console.error('Failed to list tools:', e);
    return [];
  }
}

