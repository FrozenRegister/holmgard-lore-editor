export async function getAdminSecret(): Promise<string | null> {
  if ('__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<string | null>('keyring_get', { account: 'admin_secret' });
  }
  return localStorage.getItem('hle:adminSecret');
}
