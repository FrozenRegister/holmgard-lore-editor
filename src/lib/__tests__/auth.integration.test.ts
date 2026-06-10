import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.resetModules();
});

describe('auth integration (real localStorage, mocked Tauri)', () => {
  // ── Browser mode (no Tauri) ──────────────────────────────────────────────────

  describe('Browser mode — getAdminSecret', () => {
    it('should return null when no secret is stored', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      const { getAdminSecret } = await import('$lib/auth');
      const result = await getAdminSecret();
      expect(result).toBeNull();
    });

    it('should read from localStorage', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      localStorage.setItem('hle:adminSecret', 'my-secret-key');
      const { getAdminSecret } = await import('$lib/auth');
      const result = await getAdminSecret();
      expect(result).toBe('my-secret-key');
    });
  });

  describe('Browser mode — getClaudeApiKey / setClaudeApiKey / clearClaudeApiKey', () => {
    it('should read/write/clear roundtrip', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      const { setClaudeApiKey, getClaudeApiKey, clearClaudeApiKey } = await import('$lib/auth');

      await setClaudeApiKey('sk-ant-test');
      const val = await getClaudeApiKey();
      expect(val).toBe('sk-ant-test');
      expect(localStorage.getItem('hle:claudeApiKey')).toBe('sk-ant-test');

      await clearClaudeApiKey();
      expect(localStorage.getItem('hle:claudeApiKey')).toBeNull();
    });
  });

  describe('Browser mode — getMcpApiKey / setMcpApiKey / clearMcpApiKey', () => {
    it('should read/write/clear roundtrip', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      const { setMcpApiKey, getMcpApiKey, clearMcpApiKey } = await import('$lib/auth');

      await setMcpApiKey('mcp-key-abc');
      const val = await getMcpApiKey();
      expect(val).toBe('mcp-key-abc');

      await clearMcpApiKey();
      expect(localStorage.getItem('hle:mcpApiKey')).toBeNull();
    });
  });

  // ── Tauri mode ───────────────────────────────────────────────────────────────

  describe('Tauri mode — adminSecret', () => {
    it('should call keyring_get with correct account', async () => {
      vi.stubGlobal('__TAURI__', {});
      const { invoke } = await import('@tauri-apps/api/tauri');
      vi.mocked(invoke).mockResolvedValue('tauri-admin-secret');

      const { getAdminSecret } = await import('$lib/auth');
      const result = await getAdminSecret();
      expect(result).toBe('tauri-admin-secret');
      expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'admin_secret' });
    });
  });

  describe('Tauri mode — claudeApiKey full cycle', () => {
    it('should read/write/delete via keyring', async () => {
      vi.stubGlobal('__TAURI__', {});
      const { invoke } = await import('@tauri-apps/api/tauri');
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { setClaudeApiKey, getClaudeApiKey, clearClaudeApiKey } = await import('$lib/auth');

      await setClaudeApiKey('sk-ant-tauri');
      expect(invoke).toHaveBeenCalledWith('keyring_set', {
        account: 'claude_api_key',
        value: 'sk-ant-tauri',
      });

      vi.mocked(invoke).mockResolvedValue('sk-ant-tauri');
      const val = await getClaudeApiKey();
      expect(val).toBe('sk-ant-tauri');

      await clearClaudeApiKey();
      expect(invoke).toHaveBeenCalledWith('keyring_delete', { account: 'claude_api_key' });
    });
  });

  describe('Tauri mode — mcpApiKey full cycle', () => {
    it('should read/write/delete via keyring', async () => {
      vi.stubGlobal('__TAURI__', {});
      const { invoke } = await import('@tauri-apps/api/tauri');
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { setMcpApiKey, getMcpApiKey, clearMcpApiKey } = await import('$lib/auth');

      await setMcpApiKey('mcp-tauri');
      expect(invoke).toHaveBeenCalledWith('keyring_set', {
        account: 'mcp_api_key',
        value: 'mcp-tauri',
      });

      vi.mocked(invoke).mockResolvedValue('mcp-tauri');
      const val = await getMcpApiKey();
      expect(val).toBe('mcp-tauri');

      await clearMcpApiKey();
      expect(invoke).toHaveBeenCalledWith('keyring_delete', { account: 'mcp_api_key' });
    });
  });

  // ── Concurrent calls (promise-sentinel race protection) ──────────────────────

  describe('concurrent calls', () => {
    it('should handle concurrent auth calls without double-importing', async () => {
      vi.stubGlobal('__TAURI__', {});
      const { invoke } = await import('@tauri-apps/api/tauri');
      vi.mocked(invoke).mockResolvedValue('concurrent-result');

      const { getAdminSecret, getClaudeApiKey } = await import('$lib/auth');

      const [a, b] = await Promise.all([getAdminSecret(), getClaudeApiKey()]);
      expect(a).toBe('concurrent-result');
      expect(b).toBe('concurrent-result');
    });

    it('should handle concurrent calls in browser mode without error', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      localStorage.setItem('hle:adminSecret', 's1');
      localStorage.setItem('hle:claudeApiKey', 'k1');

      const { getAdminSecret, getClaudeApiKey } = await import('$lib/auth');

      const [a, b] = await Promise.all([getAdminSecret(), getClaudeApiKey()]);
      expect(a).toBe('s1');
      expect(b).toBe('k1');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty string values', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      localStorage.setItem('hle:claudeApiKey', '');
      const { getClaudeApiKey } = await import('$lib/auth');
      const result = await getClaudeApiKey();
      expect(result).toBe('');
    });

    it('should handle special characters in API keys', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      const specialKey = 'sk-ant-123!@#$%^&*()_+-=[]{}|;:,.<>?';
      localStorage.setItem('hle:claudeApiKey', specialKey);
      const { getClaudeApiKey } = await import('$lib/auth');
      const result = await getClaudeApiKey();
      expect(result).toBe(specialKey);
    });

    it('should handle very long keys', async () => {
      vi.stubGlobal('__TAURI__', undefined);
      const longKey = 'a'.repeat(1000);
      localStorage.setItem('hle:claudeApiKey', longKey);
      const { getClaudeApiKey } = await import('$lib/auth');
      const result = await getClaudeApiKey();
      expect(result).toBe(longKey);
    });
  });
});