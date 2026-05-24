<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatOpen, chatMessages, showToast } from '$lib/stores';
  import { streamChat } from '$lib/claude';
  import { getClaudeApiKey } from '$lib/auth';
  import type { ChatMessage, ConversationMessage } from '$lib/stores';

  // Re-export type so it resolves (ConversationMessage comes from claude.ts)
  import type { ConversationMessage as ApiMsg } from '$lib/claude';

  let messagesEl: HTMLElement;
  let inputEl: HTMLTextAreaElement;
  let inputText = '';
  let busy = false;
  let hasApiKey: boolean | null = null; // null = not checked yet

  // Simple string-based history for the API (no tool call blocks in user-facing history)
  let apiHistory: ApiMsg[] = [];

  // Check key whenever panel opens
  $: if ($chatOpen) checkApiKey();

  async function checkApiKey() {
    const key = await getClaudeApiKey();
    hasApiKey = !!key;
  }

  function newId() {
    return Math.random().toString(36).slice(2);
  }

  async function scrollToBottom() {
    await tick();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function send() {
    const text = inputText.trim();
    if (!text || busy) return;

    inputText = '';
    busy = true;

    // Add user message to display + API history
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    chatMessages.update((ms) => [...ms, userMsg]);
    apiHistory = [...apiHistory, { role: 'user', content: text }];
    await scrollToBottom();

    // Placeholder assistant message (streaming)
    const assistantId = newId();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', isStreaming: true };
    chatMessages.update((ms) => [...ms, assistantMsg]);
    await scrollToBottom();

    try {
      let fullText = '';

      const finalText = await streamChat(
        apiHistory,
        // onDelta — append each chunk to the streaming message
        (delta) => {
          fullText += delta;
          chatMessages.update((ms) =>
            ms.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m)),
          );
          scrollToBottom();
        },
        // onToolCall — inject a tool indicator into the message list
        (name, phase, result) => {
          if (phase === 'start') {
            const toolMsg: ChatMessage = {
              id: newId(),
              role: 'tool',
              content: '',
              toolName: name,
            };
            chatMessages.update((ms) => {
              // Insert tool message just before the streaming assistant message
              const idx = ms.findIndex((m) => m.id === assistantId);
              const copy = [...ms];
              copy.splice(idx, 0, toolMsg);
              return copy;
            });
            scrollToBottom();
          } else if (phase === 'done') {
            // Mark write operations with a toast
            if ((name === 'update_topic' || name === 'create_topic') && result && !result.startsWith('Error')) {
              showToast(result, 'success');
            }
          }
        },
      );

      // Finalise assistant message and record in API history
      chatMessages.update((ms) =>
        ms.map((m) => (m.id === assistantId ? { ...m, content: finalText, isStreaming: false } : m)),
      );
      apiHistory = [...apiHistory, { role: 'assistant', content: finalText }];
    } catch (err: any) {
      const errText = err.message === 'NO_API_KEY'
        ? 'No API key set — add one in Settings.'
        : `Error: ${err.message}`;
      chatMessages.update((ms) =>
        ms.map((m) =>
          m.id === assistantId ? { ...m, content: errText, isStreaming: false, role: 'tool' } : m,
        ),
      );
      if (err.message === 'NO_API_KEY') hasApiKey = false;
    } finally {
      busy = false;
      await scrollToBottom();
      inputEl?.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearHistory() {
    chatMessages.set([]);
    apiHistory = [];
  }
</script>

{#if $chatOpen}
  <!-- Backdrop (click to close) -->
  <div class="chat-backdrop" on:click={() => chatOpen.set(false)} aria-hidden="true" />

  <aside class="chat-panel" role="complementary" aria-label="Claude chat">
    <!-- Header -->
    <div class="chat-header">
      <div class="chat-header-left">
        <span class="chat-icon">✦</span>
        <span class="chat-title">Claude</span>
      </div>
      <div class="chat-header-actions">
        {#if $chatMessages.length > 0}
          <button class="icon-btn" title="Clear history" on:click={clearHistory}>↺</button>
        {/if}
        <button class="icon-btn" title="Close" on:click={() => chatOpen.set(false)}>✕</button>
      </div>
    </div>

    <!-- Messages -->
    <div class="chat-messages" bind:this={messagesEl}>
      {#if $chatMessages.length === 0}
        <div class="chat-empty">
          <p>Ask anything about your lore — or ask Claude to write, edit, or create topics.</p>
          <p class="chat-empty-hint">Shift+Enter for a new line · Enter to send</p>
        </div>
      {:else}
        {#each $chatMessages as msg (msg.id)}
          {#if msg.role === 'user'}
            <div class="msg msg-user">
              <div class="msg-bubble">{msg.content}</div>
            </div>
          {:else if msg.role === 'tool'}
            <div class="msg msg-tool">
              <span class="tool-pill">
                {#if msg.toolName === 'list_topics'}⊞ listing topics
                {:else if msg.toolName === 'get_topic'}⊟ reading {msg.toolName}
                {:else if msg.toolName === 'update_topic'}✎ updating topic
                {:else if msg.toolName === 'create_topic'}＋ creating topic
                {:else if msg.content}⚠ {msg.content}
                {:else}⊙ {msg.toolName ?? 'tool'}
                {/if}
              </span>
            </div>
          {:else}
            <div class="msg msg-assistant">
              <div class="msg-bubble">
                {msg.content}{#if msg.isStreaming}<span class="cursor" aria-hidden="true" />
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Input area -->
    <div class="chat-input-area">
      {#if hasApiKey === false}
        <div class="no-key-notice">
          No API key set.
          <button class="link-btn" on:click={() => { chatOpen.set(false); goto('/settings'); }}>
            Open Settings →
          </button>
        </div>
      {:else}
        <div class="input-row">
          <textarea
            bind:this={inputEl}
            bind:value={inputText}
            on:keydown={onKeydown}
            placeholder="Ask about lore, request edits…"
            rows="3"
            disabled={busy}
            class="chat-textarea"
          ></textarea>
          <button
            class="send-btn"
            on:click={send}
            disabled={busy || !inputText.trim()}
            title="Send (Enter)"
          >
            {busy ? '…' : '↑'}
          </button>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .chat-backdrop {
    position: fixed;
    inset: 0;
    z-index: 490;
  }

  .chat-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    z-index: 500;
    background: var(--bg2);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
    animation: slideIn 0.18s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  /* ── Header ── */
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chat-icon {
    color: var(--accent);
    font-size: 1rem;
  }

  .chat-title {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--accent);
  }

  .chat-header-actions {
    display: flex;
    gap: 0.25rem;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0.3rem 0.45rem;
    border-radius: 5px;
    line-height: 1;
    transition: background 0.12s, color 0.12s;
  }

  .icon-btn:hover {
    background: var(--surface2);
    color: var(--fg);
  }

  /* ── Messages ── */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .chat-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--fg-muted);
    font-size: 0.85rem;
    line-height: 1.6;
  }

  .chat-empty-hint {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .msg {
    display: flex;
    flex-direction: column;
  }

  .msg-user {
    align-items: flex-end;
  }

  .msg-assistant {
    align-items: flex-start;
  }

  .msg-bubble {
    max-width: 92%;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-user .msg-bubble {
    background: rgba(201, 168, 76, 0.15);
    border: 1px solid rgba(201, 168, 76, 0.3);
    color: var(--fg);
  }

  .msg-assistant .msg-bubble {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
  }

  .msg-tool {
    align-items: flex-start;
  }

  .tool-pill {
    display: inline-block;
    font-size: 0.72rem;
    color: var(--fg-muted);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-family: var(--font-mono);
  }

  /* Blinking cursor during streaming */
  .cursor {
    display: inline-block;
    width: 2px;
    height: 0.9em;
    background: var(--accent);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: blink 0.8s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* ── Input area ── */
  .chat-input-area {
    flex-shrink: 0;
    padding: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .no-key-notice {
    font-size: 0.82rem;
    color: var(--fg-muted);
    text-align: center;
    padding: 0.5rem 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0;
    text-decoration: underline;
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .chat-textarea {
    flex: 1;
    resize: none;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-size: 0.875rem;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    transition: border-color 0.15s;
    color-scheme: dark;
  }

  .chat-textarea:focus {
    border-color: var(--accent);
  }

  .chat-textarea:disabled {
    opacity: 0.5;
  }

  .send-btn {
    flex-shrink: 0;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: var(--bg);
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: filter 0.12s, opacity 0.12s;
    line-height: 1;
    padding: 0;
  }

  .send-btn:hover:not(:disabled) {
    filter: brightness(1.15);
  }

  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    background: var(--surface2);
    color: var(--fg-muted);
  }
</style>
