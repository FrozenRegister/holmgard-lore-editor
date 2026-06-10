import { describe, it, expect, afterEach, vi } from 'vitest';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.resetAllMocks();
  vi.resetModules();
});

describe('mcp integration', () => {
  function mockFetch(jsonResult: unknown, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 401 ? 'Unauthorized' : 'OK',
      json: async () => jsonResult,
      text: async () => JSON.stringify(jsonResult),
    });
  }

  describe('callTool (JSON-RPC tools/call)', () => {
    it('should call a named tool and return result', async () => {
      mockFetch({
        jsonrpc: '2.0', id: 1000,
        result: { keys: ['character:test', 'location:fernveil'] },
      });

      const { callTool } = await import('$lib/mcp');
      const result = await callTool('https://example.workers.dev', 'list_topics', {}, 'sk-test');
      expect(result.keys).toEqual(['character:test', 'location:fernveil']);
    });

    it('should throw on HTTP 401', async () => {
      mockFetch({}, 401);

      const { callTool } = await import('$lib/mcp');
      await expect(
        callTool('https://example.workers.dev', 'get_lore', { key: 'test' }, 'wrong-key'),
      ).rejects.toThrow('HTTP 401');
    });

    it('should throw on JSON-RPC error', async () => {
      mockFetch({
        jsonrpc: '2.0', id: 1000,
        error: { code: -32601, message: 'Method not found' },
      });

      const { callTool } = await import('$lib/mcp');
      await expect(
        callTool('https://example.workers.dev', 'invalid_method', {}, 'sk-test'),
      ).rejects.toThrow('Method not found');
    });

    it('should send correct JSON-RPC body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ jsonrpc: '2.0', id: 1000, result: { success: true } }),
        text: async () => '{}',
      });

      const { callTool } = await import('$lib/mcp');
      await callTool('https://example.workers.dev', 'set_lore', { key: 'test', text: 'hello' }, 'sk-test');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.workers.dev/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'sk-test' },
          body: expect.stringContaining('"method":"tools/call"'),
        }),
      );
    });
  });

  describe('checkAuth', () => {
    it('should return authenticated: true when metadata says so', async () => {
      mockFetch({
        jsonrpc: '2.0', id: 1000,
        result: { metadata: { authenticated: true } },
      });

      const { checkAuth } = await import('$lib/mcp');
      const result = await checkAuth('https://example.workers.dev', 'sk-test');
      expect(result.authenticated).toBe(true);
    });

    it('should return authenticated: false on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { checkAuth } = await import('$lib/mcp');
      const result = await checkAuth('https://example.workers.dev', 'sk-test');
      expect(result.authenticated).toBe(false);
    });
  });

  describe('listTools', () => {
    it('should return tool list', async () => {
      mockFetch({
        jsonrpc: '2.0', id: 1000,
        result: {
          tools: [
            { name: 'get_lore', description: 'Get lore entry' },
            { name: 'set_lore', description: 'Set lore entry' },
          ],
        },
      });

      const { listTools } = await import('$lib/mcp');
      const tools = await listTools('https://example.workers.dev', 'sk-test');
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('get_lore');
      expect(tools[1].name).toBe('set_lore');
    });

    it('should return empty array on error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { listTools } = await import('$lib/mcp');
      const tools = await listTools('https://example.workers.dev', 'sk-test');
      expect(tools).toEqual([]);
    });

    it('should return empty array when response has no tools', async () => {
      mockFetch({ jsonrpc: '2.0', id: 1000, result: {} });

      const { listTools } = await import('$lib/mcp');
      const tools = await listTools('https://example.workers.dev', 'sk-test');
      expect(tools).toEqual([]);
    });
  });
});