export async function getAdminSecret(): Promise<string | null> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<string | null>('keyring_get', { account: 'admin_secret' });
  }
  return localStorage.getItem('hle:adminSecret');
}

export async function getClaudeApiKey(): Promise<string | null> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<string | null>('keyring_get', { account: 'claude_api_key' });
  }
  return localStorage.getItem('hle:claudeApiKey');
}

export async function setClaudeApiKey(key: string): Promise<void> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('keyring_set', { account: 'claude_api_key', value: key });
  } else {
    localStorage.setItem('hle:claudeApiKey', key);
  }
}

export async function clearClaudeApiKey(): Promise<void> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('keyring_delete', { account: 'claude_api_key' });
  } else {
    localStorage.removeItem('hle:claudeApiKey');
  }
}

export async function getMcpApiKey(): Promise<string | null> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<string | null>('keyring_get', { account: 'mcp_api_key' });
  }
  return localStorage.getItem('hle:mcpApiKey');
}

export async function setMcpApiKey(key: string): Promise<void> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('keyring_set', { account: 'mcp_api_key', value: key });
  } else {
    localStorage.setItem('hle:mcpApiKey', key);
  }
}

export async function clearMcpApiKey(): Promise<void> {
  if (typeof __TAURI__ !== 'undefined' && __TAURI__) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('keyring_delete', { account: 'mcp_api_key' });
  } else {
    localStorage.removeItem('hle:mcpApiKey');
  }
}
