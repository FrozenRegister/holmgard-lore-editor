type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

// ── Memoized Tauri invoke accessor ────────────────────────────────────────────
// Avoids 7 separate dynamic imports and 7 copies of the Tauri-detection guard.
// Uses a promise-sentinel so concurrent callers reuse the first in-flight import
// instead of each starting their own.

let _tauriInvoke: InvokeFn | null | undefined;
let _tauriInvokePromise: Promise<InvokeFn | null> | undefined;

async function getTauriInvoke(): Promise<InvokeFn | null> {
	if (_tauriInvoke !== undefined) return _tauriInvoke;
	if (_tauriInvokePromise) return _tauriInvokePromise;

	if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
		_tauriInvokePromise = import('@tauri-apps/api/tauri').then(({ invoke }) => {
			_tauriInvoke = invoke as InvokeFn;
			return _tauriInvoke;
		});
		return _tauriInvokePromise;
	}
	_tauriInvoke = null;
	return null;
}

// ── Admin secret ──────────────────────────────────────────────────────────────

function lsGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		console.warn('[auth] localStorage.getItem failed (private browsing or storage denied):', key);
		return null;
	}
}

function lsSet(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		console.warn('[auth] localStorage.setItem failed (private browsing or storage denied):', key);
	}
}

function lsRemove(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		console.warn('[auth] localStorage.removeItem failed (private browsing or storage denied):', key);
	}
}

export async function getAdminSecret(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke('keyring_get', { account: 'admin_secret' }) as string | null;
	return lsGet('hle:adminSecret');
}

// ── Claude API key ─────────────────────────────────────────────────────────────

export async function getClaudeApiKey(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke('keyring_get', { account: 'claude_api_key' }) as string | null;
	return lsGet('hle:claudeApiKey');
}

export async function setClaudeApiKey(key: string): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_set', { account: 'claude_api_key', value: key });
	} else {
		lsSet('hle:claudeApiKey', key);
	}
}

export async function clearClaudeApiKey(): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_delete', { account: 'claude_api_key' });
	} else {
		lsRemove('hle:claudeApiKey');
	}
}

// ── MCP API key ────────────────────────────────────────────────────────────────

export async function getMcpApiKey(): Promise<string | null> {
	const invoke = await getTauriInvoke();
	if (invoke) return await invoke('keyring_get', { account: 'mcp_api_key' }) as string | null;
	return lsGet('hle:mcpApiKey');
}

export async function setMcpApiKey(key: string): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_set', { account: 'mcp_api_key', value: key });
	} else {
		lsSet('hle:mcpApiKey', key);
	}
}

export async function clearMcpApiKey(): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		await invoke('keyring_delete', { account: 'mcp_api_key' });
	} else {
		lsRemove('hle:mcpApiKey');
	}
}