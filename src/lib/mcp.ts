/**
 * MCP tool-call dispatch layer.
 * Complements sync.ts (which uses direct method names) — these tools
 * are invoked via the standard tools/call JSON-RPC method.
 */

const JSON_RPC_VERSION = '2.0';
let _reqId = 1000;

export async function callTool<T extends Record<string, unknown>>(
  host: string,
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const url = `${host}/mcp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: _reqId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
}
