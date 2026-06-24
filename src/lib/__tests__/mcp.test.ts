import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callTool } from '../mcp';

describe('mcp.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch with correct JSON-RPC structure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1000, result: { topics: [] } }),
    });
    global.fetch = mockFetch;

    await callTool('http://localhost', 'list_topics', {});

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('http://localhost/mcp');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('list_topics');
    expect(body.params.arguments).toEqual({});
  });

  it('includes API key header when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1000, result: {} }),
    });
    global.fetch = mockFetch;

    await callTool('http://localhost', 'test_method', {}, 'secret-key');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('secret-key');
  });

  it('passes arguments correctly to the API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1000, result: { success: true } }),
    });
    global.fetch = mockFetch;

    const args = { query: 'test', limit: 10 };
    await callTool('http://localhost', 'search_topics', args);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.arguments).toEqual(args);
  });

  it('returns result from successful response', async () => {
    const expectedResult = { topics: ['topic1', 'topic2'] };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1000, result: expectedResult }),
    });
    global.fetch = mockFetch;

    const result = await callTool('http://localhost', 'list_topics', {});

    expect(result).toEqual(expectedResult);
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = mockFetch;

    await expect(callTool('http://localhost', 'test', {})).rejects.toThrow(
      'HTTP 500: Internal Server Error'
    );
  });

  it('throws a 401-specific hint when the Worker rejects with 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    global.fetch = mockFetch;

    await expect(callTool('http://localhost', 'test', {})).rejects.toThrow(
      'check your MCP API key in Settings'
    );
  });

  it('emits console.warn when called without an API key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1000, result: {} }),
    });
    global.fetch = mockFetch;

    await callTool('http://localhost', 'test_method', {});

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without an API key'));
    warnSpy.mockRestore();
  });

  it('throws on JSON-RPC error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        error: { code: -32600, message: 'Invalid Request' },
      }),
    });
    global.fetch = mockFetch;

    await expect(callTool('http://localhost', 'test', {})).rejects.toThrow(
      'Invalid Request'
    );
  });

  it('increments request ID for each call', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: {} }),
    });
    global.fetch = mockFetch;

    await callTool('http://localhost', 'test1', {});
    const firstId = JSON.parse(mockFetch.mock.calls[0][1].body).id;

    await callTool('http://localhost', 'test2', {});
    const secondId = JSON.parse(mockFetch.mock.calls[1][1].body).id;

    expect(secondId).toBeGreaterThan(firstId);
  });
});

describe('checkAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { authenticated: true } when Worker confirms auth', async () => {
    const { checkAuth } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: { content: [{ type: 'text', text: 'Authenticated' }], metadata: { authenticated: true } },
      }),
    });
    global.fetch = mockFetch;

    const result = await checkAuth('http://localhost', 'my-key');
    expect(result.authenticated).toBe(true);
    expect(mockFetch.mock.calls[0][1].headers['X-Api-Key']).toBe('my-key');
  });

  it('returns { authenticated: false } when Worker rejects auth', async () => {
    const { checkAuth } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: { content: [{ type: 'text', text: 'Not authenticated' }], metadata: { authenticated: false } },
      }),
    });
    global.fetch = mockFetch;

    const result = await checkAuth('http://localhost', 'bad-key');
    expect(result.authenticated).toBe(false);
  });

  it('returns { authenticated: false } on network error', async () => {
    const { checkAuth } = await import('../mcp');
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    const result = await checkAuth('http://localhost', 'key');
    expect(result.authenticated).toBe(false);
  });

  it('does not include X-Api-Key header when key is undefined', async () => {
    const { checkAuth } = await import('../mcp');
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await checkAuth('http://localhost');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBeUndefined();
  });
});

describe('listTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls tools/list method', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: { tools: [] },
      }),
    });
    global.fetch = mockFetch;

    await listTools('http://localhost');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe('tools/list');
  });

  it('returns list of tools from tools array', async () => {
    const { listTools } = await import('../mcp');
    const mockTools = [
      { name: 'list_topics', description: 'List all topics' },
      { name: 'get_topic', description: 'Get a topic' },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: { tools: mockTools },
      }),
    });
    global.fetch = mockFetch;

    const tools = await listTools('http://localhost');

    expect(tools).toEqual(mockTools);
  });

  it('returns empty array when no tools field', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: {},
      }),
    });
    global.fetch = mockFetch;

    const tools = await listTools('http://localhost');

    expect(tools).toEqual([]);
  });

  it('includes API key header when provided', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        result: { resources: [] },
      }),
    });
    global.fetch = mockFetch;

    await listTools('http://localhost', 'secret-key');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('secret-key');
  });

  it('returns empty array on HTTP error', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = mockFetch;

    const tools = await listTools('http://localhost');

    expect(tools).toEqual([]);
  });

  it('returns empty array on 401 Unauthorized', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    global.fetch = mockFetch;

    const tools = await listTools('http://localhost', 'bad-key');

    expect(tools).toEqual([]);
  });

  it('returns empty array on JSON-RPC error', async () => {
    const { listTools } = await import('../mcp');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1000,
        error: { code: -32600, message: 'Invalid Request' },
      }),
    });
    global.fetch = mockFetch;

    const tools = await listTools('http://localhost');

    expect(tools).toEqual([]);
  });
});
