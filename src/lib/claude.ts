import { get } from 'svelte/store';
import { topics, activeTopicKey } from './stores';
import { saveTopic } from './storage';
import { getClaudeApiKey } from './auth';
import type { Topic } from './types';

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_topics',
    description: 'List all available lore topic keys, grouped by type prefix (character, location, etc.).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_topic',
    description: 'Get the full markdown content of a specific lore topic by its key.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The topic key (e.g. "character:anya-velosa-archivist")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'update_topic',
    description: 'Replace the full markdown content of an existing lore topic.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The topic key to update' },
        text: { type: 'string', description: 'The complete new markdown content' },
      },
      required: ['key', 'text'],
    },
  },
  {
    name: 'create_topic',
    description: 'Create a brand-new lore topic. Fails if the key already exists.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'New topic key, e.g. "character:new-name" or "location:iron-market"' },
        text: { type: 'string', description: 'Initial markdown content' },
      },
      required: ['key', 'text'],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  const currentTopics = get(topics);

  if (name === 'list_topics') {
    const grouped: Record<string, string[]> = {};
    for (const t of currentTopics) {
      const prefix = t.key.includes(':') ? t.key.slice(0, t.key.indexOf(':')) : 'other';
      (grouped[prefix] ??= []).push(t.key);
    }
    return JSON.stringify(grouped, null, 2);
  }

  if (name === 'get_topic') {
    const topic = currentTopics.find((t) => t.key === input.key);
    if (!topic) return `Error: topic "${input.key}" not found.`;
    return topic.text;
  }

  if (name === 'update_topic') {
    const existing = currentTopics.find((t) => t.key === input.key);
    if (!existing) return `Error: topic "${input.key}" not found. Use create_topic to create it.`;
    const now = new Date().toISOString();
    const updated: Topic = {
      ...existing,
      text: input.text,
      meta: { ...existing.meta, updatedAt: now, version: (existing.meta.version ?? 0) + 1 },
    };
    await saveTopic(updated);
    topics.update((ts) => ts.map((t) => (t.key === input.key ? updated : t)));
    return `Updated "${input.key}" successfully (v${updated.meta.version}).`;
  }

  if (name === 'create_topic') {
    if (currentTopics.find((t) => t.key === input.key)) {
      return `Error: topic "${input.key}" already exists. Use update_topic to modify it.`;
    }
    const now = new Date().toISOString();
    const newTopic: Topic = {
      key: input.key,
      text: input.text,
      meta: { updatedAt: now, version: 1 },
    };
    await saveTopic(newTopic);
    topics.update((ts) => [...ts, newTopic].sort((a, b) => a.key.localeCompare(b.key)));
    return `Created "${input.key}" successfully.`;
  }

  return `Unknown tool: ${name}`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const currentTopics = get(topics);
  const activeKey = get(activeTopicKey);
  const topicList = currentTopics.map((t) => t.key).join('\n');

  return `You are a lore assistant for the Holmgard world — a dark fantasy setting. You help the user write, edit, research, and brainstorm lore.

You have ${currentTopics.length} lore topics available. Use your tools to read any topic's full content or to create/update topics when asked.

Available topic keys:
${topicList}
${activeKey ? `\nThe user is currently editing: ${activeKey}` : ''}

When writing or editing lore, match the tone and style of existing topics. Keep markdown clean and consistent with what's already in the world.`;
}

// ── Public types ──────────────────────────────────────────────────────────────

export type OnDelta = (text: string) => void;
export type OnToolCall = (name: string, phase: 'start' | 'done', result?: string) => void;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Main streaming function ───────────────────────────────────────────────────

export async function streamChat(
  history: ConversationMessage[],
  onDelta: OnDelta,
  onToolCall: OnToolCall,
): Promise<string> {
  const apiKey = await getClaudeApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  // Build Anthropic message array — tool results are injected inside the loop
  let messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));
  let fullResponse = '';

  // Agentic loop: keep going until no more tool calls
  while (true) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(),
        tools: TOOLS,
        stream: true,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = (errBody as any)?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }

    // ── Parse SSE stream ────────────────────────────────────────────────────
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let stopReason: string | null = null;
    let currentText = '';
    // Map index → { id, name, inputJson }
    const toolCalls: Array<{ id: string; name: string; inputJson: string }> = [];

    let buf = '';
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;

        let ev: any;
        try { ev = JSON.parse(raw); } catch { continue; }

        if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          toolCalls[ev.index] = { id: ev.content_block.id, name: ev.content_block.name, inputJson: '' };
          onToolCall(ev.content_block.name, 'start');
        }

        if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') {
            currentText += ev.delta.text;
            fullResponse += ev.delta.text;
            onDelta(ev.delta.text);
          } else if (ev.delta.type === 'input_json_delta' && toolCalls[ev.index]) {
            toolCalls[ev.index].inputJson += ev.delta.partial_json;
          }
        }

        if (ev.type === 'message_delta') {
          stopReason = ev.delta.stop_reason ?? stopReason;
        }

        if (ev.type === 'message_stop') break outer;
      }
    }

    // ── No tool calls → done ────────────────────────────────────────────────
    const activeCalls = toolCalls.filter(Boolean);
    if (stopReason !== 'tool_use' || activeCalls.length === 0) break;

    // ── Build assistant message with content blocks ─────────────────────────
    const assistantContent: any[] = [];
    if (currentText) assistantContent.push({ type: 'text', text: currentText });
    for (const tc of activeCalls) {
      let input: any = {};
      try { input = JSON.parse(tc.inputJson || '{}'); } catch {}
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
    }
    messages.push({ role: 'assistant', content: assistantContent });

    // ── Execute tools and collect results ───────────────────────────────────
    const toolResults: any[] = [];
    for (const tc of activeCalls) {
      let input: any = {};
      try { input = JSON.parse(tc.inputJson || '{}'); } catch {}
      const result = await executeTool(tc.name, input);
      onToolCall(tc.name, 'done', result);
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return fullResponse;
}
