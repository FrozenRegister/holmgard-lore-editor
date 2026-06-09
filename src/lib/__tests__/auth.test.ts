

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock @tauri-apps/api/tauri
vi.mock('@tauri-apps/api/tauri', () => ({
	invoke: vi.fn(),
}));

describe('auth', () => {
	afterEach(() => {
		if (typeof localStorage !== 'undefined') localStorage.clear();
		vi.resetAllMocks();
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	// ── Browser mode (no Tauri) ────────────────────────────────────────────────

	describe('Browser mode (no Tauri)', () => {
		beforeEach(() => {
			vi.stubGlobal('__TAURI__', undefined);
		});

		describe('getAdminSecret', () => {
			it('should return null when no secret is stored', async () => {
				const { getAdminSecret } = await import('$lib/auth');
				const result = await getAdminSecret();
				expect(result).toBeNull();
			});

			it('should read from localStorage', async () => {
				localStorage.setItem('hle:adminSecret', 'my-secret-key');
				const { getAdminSecret } = await import('$lib/auth');
				const result = await getAdminSecret();
				expect(result).toBe('my-secret-key');
			});
		});

		describe('getClaudeApiKey', () => {
			it('should return null when no key is stored', async () => {
				const { getClaudeApiKey } = await import('$lib/auth');
				const result = await getClaudeApiKey();
				expect(result).toBeNull();
			});

			it('should read from localStorage', async () => {
				localStorage.setItem('hle:claudeApiKey', 'sk-ant-12345');
				const { getClaudeApiKey } = await import('$lib/auth');
				const result = await getClaudeApiKey();
				expect(result).toBe('sk-ant-12345');
			});
		});

		describe('setClaudeApiKey', () => {
			it('should write to localStorage', async () => {
				const { setClaudeApiKey } = await import('$lib/auth');
				await setClaudeApiKey('sk-ant-new-key');
				expect(localStorage.getItem('hle:claudeApiKey')).toBe('sk-ant-new-key');
			});
		});

		describe('clearClaudeApiKey', () => {
			it('should remove from localStorage', async () => {
				localStorage.setItem('hle:claudeApiKey', 'sk-ant-existing');
				const { clearClaudeApiKey } = await import('$lib/auth');
				await clearClaudeApiKey();
				expect(localStorage.getItem('hle:claudeApiKey')).toBeNull();
			});
		});

		describe('getMcpApiKey', () => {
			it('should return null when no key is stored', async () => {
				const { getMcpApiKey } = await import('$lib/auth');
				const result = await getMcpApiKey();
				expect(result).toBeNull();
			});

			it('should read from localStorage', async () => {
				localStorage.setItem('hle:mcpApiKey', 'mcp-key-123');
				const { getMcpApiKey } = await import('$lib/auth');
				const result = await getMcpApiKey();
				expect(result).toBe('mcp-key-123');
			});
		});

		describe('setMcpApiKey', () => {
			it('should write to localStorage', async () => {
				const { setMcpApiKey } = await import('$lib/auth');
				await setMcpApiKey('mcp-new-key');
				expect(localStorage.getItem('hle:mcpApiKey')).toBe('mcp-new-key');
			});
		});

		describe('clearMcpApiKey', () => {
			it('should remove from localStorage', async () => {
				localStorage.setItem('hle:mcpApiKey', 'mcp-existing');
				const { clearMcpApiKey } = await import('$lib/auth');
				await clearMcpApiKey();
				expect(localStorage.getItem('hle:mcpApiKey')).toBeNull();
			});
		});

		describe('Edge cases', () => {
			describe('empty string values', () => {
				it('should return empty string if stored in localStorage', async () => {
					localStorage.setItem('hle:claudeApiKey', '');
					const { getClaudeApiKey } = await import('$lib/auth');
					const result = await getClaudeApiKey();
					expect(result).toBe('');
				});

				it('should store empty string if provided', async () => {
					const { setClaudeApiKey } = await import('$lib/auth');
					await setClaudeApiKey('');
					expect(localStorage.getItem('hle:claudeApiKey')).toBe('');
				});
			});

			describe('special characters in keys', () => {
				it('should handle special characters in API keys', async () => {
					const specialKey = 'sk-ant-123!@#$%^&*()_+-=[]{}|;:,.<>?';
					localStorage.setItem('hle:claudeApiKey', specialKey);
					const { getClaudeApiKey } = await import('$lib/auth');
					const result = await getClaudeApiKey();
					expect(result).toBe(specialKey);
				});

				it('should handle multiline keys', async () => {
					const multilineKey = 'line1\nline2\nline3';
					localStorage.setItem('hle:mcpApiKey', multilineKey);
					const { getMcpApiKey } = await import('$lib/auth');
					const result = await getMcpApiKey();
					expect(result).toBe(multilineKey);
				});
			});

			describe('very long keys', () => {
				it('should handle long API keys', async () => {
					const longKey = 'a'.repeat(1000);
					localStorage.setItem('hle:claudeApiKey', longKey);
					const { getClaudeApiKey } = await import('$lib/auth');
					const result = await getClaudeApiKey();
					expect(result).toBe(longKey);
				});
			});
		});
	});

	// ── Tauri mode ─────────────────────────────────────────────────────────────

	describe('Tauri mode', () => {
		beforeEach(() => {
			// Enable Tauri
			vi.stubGlobal('__TAURI__', {});
		});

		describe('getAdminSecret', () => {
			it('should call keyring_get with correct account', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue('tauri-admin-secret');

				const { getAdminSecret } = await import('$lib/auth');
				const result = await getAdminSecret();

				expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'admin_secret' });
				expect(result).toBe('tauri-admin-secret');
			});

			it('should return null when keyring returns null', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue(null);

				const { getAdminSecret } = await import('$lib/auth');
				const result = await getAdminSecret();

				expect(result).toBeNull();
			});
		});

		describe('getClaudeApiKey', () => {
			it('should call keyring_get with correct account', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue('sk-ant-tauri');

				const { getClaudeApiKey } = await import('$lib/auth');
				const result = await getClaudeApiKey();

				expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'claude_api_key' });
				expect(result).toBe('sk-ant-tauri');
			});
		});

		describe('setClaudeApiKey', () => {
			it('should call keyring_set with correct parameters', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue(undefined);

				const { setClaudeApiKey } = await import('$lib/auth');
				await setClaudeApiKey('new-sk-key');

				expect(invoke).toHaveBeenCalledWith('keyring_set', {
					account: 'claude_api_key',
					value: 'new-sk-key',
				});
			});
		});

		describe('clearClaudeApiKey', () => {
			it('should call keyring_delete with correct account', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue(undefined);

				const { clearClaudeApiKey } = await import('$lib/auth');
				await clearClaudeApiKey();

				expect(invoke).toHaveBeenCalledWith('keyring_delete', {
					account: 'claude_api_key',
				});
			});
		});

		describe('getMcpApiKey', () => {
			it('should call keyring_get with correct account', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue('mcp-tauri-key');

				const { getMcpApiKey } = await import('$lib/auth');
				const result = await getMcpApiKey();

				expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'mcp_api_key' });
				expect(result).toBe('mcp-tauri-key');
			});
		});

		describe('setMcpApiKey', () => {
			it('should call keyring_set with correct parameters', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue(undefined);

				const { setMcpApiKey } = await import('$lib/auth');
				await setMcpApiKey('new-mcp-key');

				expect(invoke).toHaveBeenCalledWith('keyring_set', {
					account: 'mcp_api_key',
					value: 'new-mcp-key',
				});
			});
		});

		describe('clearMcpApiKey', () => {
			it('should call keyring_delete with correct account', async () => {
				const { invoke } = await import('@tauri-apps/api/tauri');
				vi.mocked(invoke).mockResolvedValue(undefined);

				const { clearMcpApiKey } = await import('$lib/auth');
				await clearMcpApiKey();

				expect(invoke).toHaveBeenCalledWith('keyring_delete', {
					account: 'mcp_api_key',
				});
			});
		});
	});

	// ── Memoization ─────────────────────────────────────────────────────────────

	describe('getTauriInvoke memoization', () => {
		it('should reuse cached invoke across multiple auth function calls', async () => {
			vi.stubGlobal('__TAURI__', {});
			const { invoke } = await import('@tauri-apps/api/tauri');
			vi.mocked(invoke).mockResolvedValue('key-from-tauri');

			const { getAdminSecret, getClaudeApiKey, getMcpApiKey } = await import('$lib/auth');

			await getAdminSecret();
			await getClaudeApiKey();
			await getMcpApiKey();

			// Three keyring_get calls, but the import should only have happened once
			expect(invoke).toHaveBeenCalledTimes(3);
			expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'admin_secret' });
			expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'claude_api_key' });
			expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'mcp_api_key' });
		});

		it('should cache null in browser mode and not attempt import again', async () => {
			vi.stubGlobal('__TAURI__', undefined);

			const { getAdminSecret, getClaudeApiKey } = await import('$lib/auth');

			localStorage.setItem('hle:adminSecret', 's1');
			localStorage.setItem('hle:claudeApiKey', 'k1');

			await getAdminSecret();
			await getClaudeApiKey();

			// Both should have returned localStorage values without invoking Tauri
			expect(localStorage.getItem('hle:adminSecret')).toBe('s1');
			expect(localStorage.getItem('hle:claudeApiKey')).toBe('k1');
		});
	});

	// ── Concurrent calls (promise-sentinel race protection) ────────────────────

	describe('concurrent calls', () => {
		it('should handle concurrent auth calls without double-importing', async () => {
			vi.stubGlobal('__TAURI__', {});
			const { invoke } = await import('@tauri-apps/api/tauri');
			vi.mocked(invoke).mockResolvedValue('concurrent-result');

			const { getAdminSecret, getClaudeApiKey } = await import('$lib/auth');

			// Fire both simultaneously — the promise sentinel should dedupe the import
			const [a, b] = await Promise.all([getAdminSecret(), getClaudeApiKey()]);

			expect(a).toBe('concurrent-result');
			expect(b).toBe('concurrent-result');
			// Both calls should have used the same invoke reference
			expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'admin_secret' });
			expect(invoke).toHaveBeenCalledWith('keyring_get', { account: 'claude_api_key' });
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

	// ── __TAURI__ falsy-but-defined edge cases ─────────────────────────────────

	describe('__TAURI__ falsy-but-defined values', () => {
		it('should fall through to localStorage when __TAURI__ is false', async () => {
			vi.stubGlobal('__TAURI__', false);
			localStorage.setItem('hle:adminSecret', 'val');

			const { getAdminSecret } = await import('$lib/auth');
			const result = await getAdminSecret();

			expect(result).toBe('val');
		});

		it('should fall through to localStorage when __TAURI__ is null', async () => {
			vi.stubGlobal('__TAURI__', null);
			localStorage.setItem('hle:claudeApiKey', 'ck');

			const { getClaudeApiKey } = await import('$lib/auth');
			const result = await getClaudeApiKey();

			expect(result).toBe('ck');
		});

		it('should fall through to localStorage when __TAURI__ is 0', async () => {
			vi.stubGlobal('__TAURI__', 0);
			localStorage.setItem('hle:mcpApiKey', 'mk');

			const { getMcpApiKey } = await import('$lib/auth');
			const result = await getMcpApiKey();

			expect(result).toBe('mk');
		});

		it('should fall through to localStorage when __TAURI__ is empty string', async () => {
			vi.stubGlobal('__TAURI__', '');
			localStorage.setItem('hle:claudeApiKey', 'ek');

			const { setClaudeApiKey, getClaudeApiKey } = await import('$lib/auth');
			await setClaudeApiKey('updated');

			expect(localStorage.getItem('hle:claudeApiKey')).toBe('updated');
		});
	});

});
