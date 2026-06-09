import type { invoke as TauriInvoke } from '@tauri-apps/api/tauri';

// ── Memoized Tauri invoke accessor ────────────────────────────────────────────
// Avoids 7 separate dynamic imports and 7 copies of the Tauri-detection guard.

let _tauriInvoke: typeof TauriInvoke | null | undefined;

async function getTauriInvoke(): Promise<typeof TauriInvoke | null> {
	if (_tauriInvoke !== undefined) return _tauriInvoke;
	if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
		const { invoke } = await import('@tauri-apps/api/tauri');
		_tauriInvoke = invoke;
		return invoke;
	}
	_tauriInvoke = null;
	return null;
}

// ── Admin secret ──────────────────────────────────────────────────────────────

export async function getAdminSecret(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke<string | null>('keyring_get', { account: 'admin_secret' });
	return localStorage.getItem('hle:adminSecret');
}

// ── Claude API key ─────────────────────────────────────────────────────────────

export async function getClaudeApiKey(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke<string | null>('keyring_get', { account: 'claude_api_key' });
	return localStorage.getItem('hle:claudeApiKey');
}

export async function setClaudeApiKey(key: string): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_set', { account: 'claude_api_key', value: key });
	} else {
		localStorage.setItem('hle:claudeApiKey', key);
	}
}

export async function clearClaudeApiKey(): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_delete', { account: 'claude_api_key' });
	} else {
		localStorage.removeItem('hle:claudeApiKey');
	}
}

// ── MCP API key ────────────────────────────────────────────────────────────────

export async function getMcpApiKey(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke<string | null>('keyring_get', { account: 'mcp_api_key' });
	return localStorage.getItem('hle:mcpApiKey');
}

export async function setMcpApiKey(key: string): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_set', { account: 'mcp_api_key', value: key });
	} else {
		localStorage.setItem('hle:mcpApiKey', key);
	}
}

export async function clearMcpApiKey(): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_delete', { account: 'mcp_api_key' });
	} else {
		localStorage.removeItem('hle:mcpApiKey');
	}
}