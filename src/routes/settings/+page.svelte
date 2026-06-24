<script lang="ts">
  import { onMount } from "svelte";
  import { settings, showToast } from "$lib/stores";
  import { loadSettings, saveSettings } from "$lib/storage";
  import { encryptSecret, decryptSecret } from "$lib/crypto";
  import {
    getClaudeApiKey,
    setClaudeApiKey,
    clearClaudeApiKey,
    getMcpApiKey,
    setMcpApiKey,
    clearMcpApiKey,
  } from "$lib/auth";
  import { checkAuth } from "$lib/mcp";
  import type { AppSettings } from "$lib/types";

  const IS_TAURI = typeof window !== "undefined" && "__TAURI__" in window;

  let workerHost = "";
  let autoSyncIntervalSecs = 30;
  let syncHistory = false;
  let adminSecretInput = "";
  let masterKeyInput = "";
  let showSecret = false;
  let saving = false;
  let secretLoaded = false;
  let masterKeySet = false;
  let autoSync = true;
  let claudeApiKeyInput = "";
  let claudeApiKeySet = false;
  let savingClaudeKey = false;
  let mcpApiKeyInput = "";
  let mcpApiKeySet = false;
  let savingMcpKey = false;

  onMount(async () => {
    const s = await loadSettings();
    workerHost = s.workerHost;
    autoSyncIntervalSecs = s.autoSyncIntervalSecs ?? 30;
    autoSync = s.autoSync ?? true;
    syncHistory = s.syncHistory ?? false;
    settings.set(s);

    if (IS_TAURI) {
      try {
        const { invoke } = await import("@tauri-apps/api/tauri");
        const mk: string | null = await invoke("keyring_get", {
          account: "master_key",
        });
        masterKeySet = !!mk;

        // Try to decrypt the stored secret if we have a master key and backup
        if (mk && s.encryptedSecret && s.iv) {
          try {
            adminSecretInput = await decryptSecret(s.encryptedSecret, s.iv, mk);
            secretLoaded = true;
          } catch {
            adminSecretInput = "";
          }
        }
      } catch {
        /* running in browser */
      }
    } else {
      // Browser mode: load admin secret from localStorage
      const stored = localStorage.getItem('hle:adminSecret');
      if (stored) {
        adminSecretInput = stored;
      }
    }

    const existingKey = await getClaudeApiKey();
    claudeApiKeySet = !!existingKey;

    const existingMcpKey = await getMcpApiKey();
    mcpApiKeySet = !!existingMcpKey;
  });

  async function saveAll() {
    if (!workerHost.trim()) {
      showToast("Worker host URL is required", "error");
      return;
    }

    saving = true;
    try {
      let updatedSettings: AppSettings = {
        ...$settings,
        workerHost: workerHost.trim(),
        autoSyncIntervalSecs,
        autoSync,
        syncHistory,
      };

      if (IS_TAURI) {
        const { invoke } = await import("@tauri-apps/api/tauri");

        // Save / update master key
        if (masterKeyInput.trim()) {
          await invoke("keyring_set", {
            account: "master_key",
            value: masterKeyInput.trim(),
          });
          masterKeySet = true;
        }

        const mk: string | null = await invoke("keyring_get", {
          account: "master_key",
        });

        // Encrypt + store admin secret
        if (adminSecretInput.trim() && mk) {
          const { ciphertext, iv } = await encryptSecret(
            adminSecretInput.trim(),
            mk,
          );
          updatedSettings = {
            ...updatedSettings,
            encryptedSecret: ciphertext,
            iv,
          };
          // Also store in keyring for easy access
          await invoke("keyring_set", {
            account: "admin_secret",
            value: adminSecretInput.trim(),
          });
        } else if (adminSecretInput.trim() && !mk) {
          showToast(
            "Set a master key first to encrypt your admin secret",
            "warning",
          );
        }
      } else {
        // Browser fallback — store plaintext in localStorage
        if (adminSecretInput.trim()) {
          localStorage.setItem("hle:adminSecret", adminSecretInput.trim());
        }
      }

      await saveSettings(updatedSettings);
      settings.set(updatedSettings);
      showToast("Settings saved", "success");
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`, "error");
    } finally {
      saving = false;
    }
  }

  async function clearMasterKey() {
    if (
      !confirm(
        "Clear the master key from OS keyring? The encrypted secret backup will no longer be accessible.",
      )
    )
      return;
    if (IS_TAURI) {
      try {
        const { invoke } = await import("@tauri-apps/api/tauri");
        await invoke("keyring_delete", { account: "master_key" });
        await invoke("keyring_delete", { account: "admin_secret" });
        masterKeySet = false;
        masterKeyInput = "";
        adminSecretInput = "";
        showToast("Keyring cleared", "success");
      } catch (err: any) {
        showToast(`Failed: ${err.message}`, "error");
      }
    }
  }

  async function saveClaudeKey() {
    if (!claudeApiKeyInput.trim()) {
      showToast("Paste your API key first", "error");
      return;
    }
    savingClaudeKey = true;
    try {
      await setClaudeApiKey(claudeApiKeyInput.trim());
      claudeApiKeySet = true;
      claudeApiKeyInput = "";
      showToast("Claude API key saved", "success");
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, "error");
    } finally {
      savingClaudeKey = false;
    }
  }

  async function removeClaudeKey() {
    if (!confirm("Remove the Claude API key?")) return;
    try {
      await clearClaudeApiKey();
      claudeApiKeySet = false;
      claudeApiKeyInput = "";
      showToast("Claude API key removed", "success");
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, "error");
    }
  }

  async function saveMcpKey() {
    if (!mcpApiKeyInput.trim()) {
      showToast("Paste your API key first", "error");
      return;
    }
    savingMcpKey = true;
    try {
      await setMcpApiKey(mcpApiKeyInput.trim());
      mcpApiKeySet = true;
      mcpApiKeyInput = "";
      showToast("MCP API key saved", "success");
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, "error");
    } finally {
      savingMcpKey = false;
    }
  }

  async function removeMcpKey() {
    if (!confirm("Remove the MCP API key?")) return;
    try {
      await clearMcpApiKey();
      mcpApiKeySet = false;
      mcpApiKeyInput = "";
      showToast("MCP API key removed", "success");
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, "error");
    }
  }

  async function testConnection() {
    try {
      const mcpKey = await getMcpApiKey();
      const { authenticated } = await checkAuth(
        workerHost.trim(),
        mcpKey ?? undefined,
      );
      if (authenticated) {
        showToast("Connection successful ✓ — API key valid", "success");
      } else {
        showToast(
          "Connection failed — Worker unreachable or API key invalid. Check your MCP API key in the MCP Worker section below.",
          "error",
        );
      }
    } catch (err: any) {
      showToast(`Connection error: ${err.message}`, "error");
    }
  }

  async function testAdminSecret() {
    if (!adminSecretInput.trim()) {
      showToast("Enter admin secret first", "warning");
      return;
    }
    try {
      // Test against an admin endpoint that actually checks the admin secret.
      // /admin/delete-lore on a nonexistent key will 401 if the secret is wrong,
      // or 404/200 if auth passes (key doesn't exist, which is safe).
      const res = await fetch(`${workerHost}/admin/delete-lore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "__admin_test_nonexistent_key__",
          secret: adminSecretInput.trim(),
        }),
      });
      if (res.ok || res.status === 404) {
        // Auth passed — 200 or 404 means the secret was accepted
        showToast("Admin secret valid ✓", "success");
      } else if (res.status === 401 || res.status === 403) {
        showToast("Admin secret rejected — check the value", "error");
      } else {
        const text = await res.text().catch(() => "");
        showToast(`Unexpected response (${res.status}): ${text}`, "error");
      }
    } catch (err: any) {
      showToast(`Test error: ${err.message}`, "error");
    }
  }

  async function testMcpApiKey() {
    const keyToTest = mcpApiKeyInput.trim() || (await getMcpApiKey());
    if (!keyToTest) {
      showToast("Enter MCP API key first", "warning");
      return;
    }
    try {
      const { authenticated } = await checkAuth(
        workerHost.trim(),
        keyToTest,
      );
      if (authenticated) {
        showToast("MCP API key valid ✓ — Worker confirms authentication", "success");
      } else {
        showToast(
          "API key rejected — the Worker says this key is not valid. Double-check the value.",
          "error",
        );
      }
    } catch (err: any) {
      showToast(`Test error: ${err.message}`, "error");
    }
  }
</script>

<div class="page settings-page">
  <header class="page-header">
    <h1>Settings</h1>
  </header>

  <form class="settings-form" on:submit|preventDefault={saveAll} autocomplete="off">
    <!-- Worker connection -->
    <section class="settings-section">
      <h2>Worker Connection</h2>
      <p class="section-desc">
        MCP worker that hosts your Holmgard lore topics.
      </p>

      <div class="field">
        <label for="workerHost">Worker Host URL</label>
        <div class="input-row">
          <input
            id="workerHost"
            type="url"
            bind:value={workerHost}
            placeholder="https://holmgard-lore-mcp.frozenregister.workers.dev"
            class="text-input"
            required
            autocomplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={testConnection}
          >
            Test
          </button>
        </div>
      </div>
    </section>

    <!-- Auto-sync -->
    <section class="settings-section">
      <h2>Auto-Sync</h2>
      <p class="section-desc">
        Automatically pull updates from the remote worker on a schedule.
        Conflicts are always queued for manual review — nothing is silently
        overwritten.
      </p>

      <div class="field">
        <label class="toggle-label" for="autoSync">
          Enable auto-sync
          <span class="toggle-desc">
            Automatically pull remote changes on the interval below.
            Disable to sync manually only.
          </span>
        </label>
        <label class="toggle">
          <input id="autoSync" type="checkbox" bind:checked={autoSync} />
          <span class="toggle-track">
            <span class="toggle-thumb" />
          </span>
          <span class="toggle-value">{autoSync ? "On" : "Off"}</span>
        </label>
      </div>

      <div class="field">
        <label for="autoSyncInterval">Pull interval</label>
        <select
          id="autoSyncInterval"
          bind:value={autoSyncIntervalSecs}
          class="select-input"
          disabled={!autoSync}
        >
          <option value={10}>Every 10 seconds</option>
          <option value={15}>Every 15 seconds</option>
          <option value={30}>Every 30 seconds</option>
          <option value={60}>Every minute</option>
          <option value={120}>Every 2 minutes</option>
          <option value={300}>Every 5 minutes</option>
        </select>
      </div>

      <div class="field">
        <label class="toggle-label" for="syncHistory">
          Sync version history
          <span class="toggle-desc">
            Record a local history entry each time a remote update is pulled.
            Disable to reduce Worker read traffic.
          </span>
        </label>
        <label class="toggle">
          <input id="syncHistory" type="checkbox" bind:checked={syncHistory} />
          <span class="toggle-track">
            <span class="toggle-thumb" />
          </span>
          <span class="toggle-value">{syncHistory ? "On" : "Off"}</span>
        </label>
      </div>
    </section>

    <!-- Security -->
    <section class="settings-section">
      <h2>Security</h2>
      <p class="section-desc">
        Your admin secret is encrypted with AES-GCM using a master key stored in
        the OS keyring. No secrets are stored in plain text on disk.
      </p>

      <div class="field">
        <label for="masterKey">
          Master Key
          {#if masterKeySet}
            <span class="badge badge-ok">Set ✓</span>
          {:else}
            <span class="badge badge-warn">Not set</span>
          {/if}
        </label>
        {#if showSecret}
          <input
            id="adminSecret"
            type="text"
            bind:value={adminSecretInput}
            placeholder="Enter admin secret…"
            class="text-input"
            autocomplete="new-password"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
          />
        {:else}
          <input
            id="adminSecret"
            type="password"
            bind:value={adminSecretInput}
            placeholder="Enter admin secret…"
            class="text-input"
            autocomplete="new-password"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
          />
        {/if}
        {#if masterKeySet}
          <button
            type="button"
            class="btn btn-ghost btn-sm danger"
            on:click={clearMasterKey}
          >
            Clear keyring
          </button>
        {/if}
      </div>

      <div class="field">
        <label for="adminSecret">
          Admin Secret
          {#if secretLoaded}
            <span class="badge badge-ok">Loaded from keyring ✓</span>
          {/if}
        </label>
        <div class="input-row">
          {#if showSecret}
            <input
              id="adminSecret"
              type="text"
              bind:value={adminSecretInput}
              placeholder="Enter admin secret…"
              class="text-input"
              autocomplete="new-password"
              data-lpignore="true"
              data-1p-ignore
              data-bwignore="true"
            />
          {:else}
            <input
              id="adminSecret"
              type="password"
              bind:value={adminSecretInput}
              placeholder="Enter admin secret…"
              class="text-input"
              autocomplete="new-password"
              data-lpignore="true"
              data-1p-ignore
              data-bwignore="true"
            />
          {/if}

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={() => (showSecret = !showSecret)}
          >
            {showSecret ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={testAdminSecret}
          >
            Test
          </button>
        </div>
      </div>
    </section>

    <!-- Claude API -->
    <section class="settings-section">
      <h2>Claude AI</h2>
      <p class="section-desc">
        Used for the in-app lore assistant. Get your key at
        <strong>console.anthropic.com</strong> → API Keys. Stored securely in the
        OS keyring — never written to disk.
      </p>

      <div class="field">
        <label for="claudeApiKey">
          API Key
          {#if claudeApiKeySet}
            <span class="badge badge-ok">Set ✓</span>
          {:else}
            <span class="badge badge-warn">Not set</span>
          {/if}
        </label>
        <div class="input-row">
          <input
            id="claudeApiKey"
            type="password"
            bind:value={claudeApiKeyInput}
            placeholder="sk-ant-api03-…"
            class="text-input"
            autocomplete="new-password"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={saveClaudeKey}
            disabled={savingClaudeKey}
          >
            {savingClaudeKey ? "Saving…" : "Save"}
          </button>
          {#if claudeApiKeySet}
            <button
              type="button"
              class="btn btn-ghost btn-sm danger"
              on:click={removeClaudeKey}
            >
              Remove
            </button>
          {/if}
        </div>
      </div>
    </section>

    <!-- MCP API Key -->
    <section class="settings-section">
      <h2>MCP Worker</h2>
      <p class="section-desc">
        Authentication key for read operations on the MCP Worker (separate from
        admin secret). Stored securely in the OS keyring — never written to disk.
      </p>

      <div class="field">
        <label for="mcpApiKey">
          API Key
          {#if mcpApiKeySet}
            <span class="badge badge-ok">Set ✓</span>
          {:else}
            <span class="badge badge-warn">Not set</span>
          {/if}
        </label>
        <div class="input-row">
          <input
            id="mcpApiKey"
            type="password"
            bind:value={mcpApiKeyInput}
            placeholder="Enter your MCP API key…"
            class="text-input"
            autocomplete="new-password"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={saveMcpKey}
            disabled={savingMcpKey}
          >
            {savingMcpKey ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            on:click={testMcpApiKey}
          >
            Test
          </button>
          {#if mcpApiKeySet}
            <button
              type="button"
              class="btn btn-ghost btn-sm danger"
              on:click={removeMcpKey}
            >
              Remove
            </button>
          {/if}
        </div>
      </div>
    </section>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  </form>
</div>


<style>
  .settings-page {
    padding: 2rem;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
    margin: 0;
  }

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
  }

  .settings-section h2 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent2);
    margin: 0;
  }

  .section-desc {
    font-size: 0.85rem;
    color: var(--fg-muted);
    margin: 0;
    line-height: 1.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fg);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .text-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }

  .text-input:focus {
    border-color: var(--accent);
  }

  .select-input {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 0.9rem;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .select-input:focus {
    border-color: var(--accent);
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .input-row .text-input {
    flex: 1;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
  }
  .badge-ok {
    background: rgba(76, 175, 80, 0.18);
    color: #81c784;
  }
  .badge-warn {
    background: rgba(255, 183, 77, 0.18);
    color: #ffb74d;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
  }

  .danger {
    color: #e57373;
  }
  .danger:hover {
    background: rgba(229, 115, 115, 0.12);
  }

  .toggle-label {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }
  .toggle-desc {
    font-size: 0.78rem;
    font-weight: 400;
    color: var(--fg-muted);
    line-height: 1.4;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    user-select: none;
  }
  .toggle input {
    display: none;
  }
  .toggle-track {
    width: 2.4rem;
    height: 1.3rem;
    border-radius: 999px;
    background: var(--border);
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle input:checked ~ .toggle-track {
    background: var(--accent);
  }
  .toggle-thumb {
    position: absolute;
    top: 0.15rem;
    left: 0.15rem;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
  }
  .toggle input:checked ~ .toggle-track .toggle-thumb {
    transform: translateX(1.1rem);
  }
  .toggle-value {
    font-size: 0.85rem;
    color: var(--fg-muted);
    min-width: 1.8rem;
  }
</style>
