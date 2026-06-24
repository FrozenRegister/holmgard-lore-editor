import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import MCPPanel from '../components/MCPPanel.svelte';
import * as mcpModule from '../mcp';
import { mcpOpen } from '../stores';
import * as authModule from '../auth';

vi.mock('../mcp');
vi.mock('../auth');
vi.mock('highlight.js', () => ({
  default: {
    highlight: (text: string, { language }: { language: string }) => ({
      value: `<span class="hljs-string">${text}</span>`,
    }),
  },
}));

describe('MCPPanel.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpOpen.set(true);
    // Default mocks for tests that don't override
    vi.mocked(mcpModule.listTools).mockResolvedValue([]);
    vi.mocked(mcpModule.callTool).mockResolvedValue({});
    vi.mocked(authModule.getAdminSecret).mockResolvedValue(null);
  });

  afterEach(() => {
    mcpOpen.set(false);
  });

  it('renders when mcpOpen is true', () => {
    render(MCPPanel);
    expect(screen.getByText('MCP Tool Console')).toBeInTheDocument();
  });

  it('displays method input with default value', () => {
    const { container } = render(MCPPanel);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('lore_manage');
  });

  it('displays params textarea with default empty JSON', () => {
    const { container } = render(MCPPanel);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toBe('{}');
  });

  it('displays close button', () => {
    const { container } = render(MCPPanel);
    const closeBtn = container.querySelector('.close-btn');
    expect(closeBtn).toBeDefined();
    expect(closeBtn?.textContent).toContain('✕');
  });

  it('displays run button', () => {
    render(MCPPanel);
    expect(screen.getByText('Run Tool')).toBeInTheDocument();
  });

  it('displays history section', () => {
    const { container } = render(MCPPanel);
    expect(container.querySelector('.history')).toBeInTheDocument();
  });


  it('calls callTool with default lore_manage method and empty params', async () => {
    vi.mocked(mcpModule.callTool).mockResolvedValue({ success: true });
    render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const calls = vi.mocked(mcpModule.callTool).mock.calls;
    expect(calls[0][0]).toContain('frozenregister.workers.dev');
    expect(calls[0][1]).toBe('lore_manage');
    expect(calls[0][2]).toEqual({});
  });

  it('passes empty object for params when textarea is empty', async () => {
    vi.mocked(mcpModule.callTool).mockResolvedValue({});
    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('{}');

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const calls = vi.mocked(mcpModule.callTool).mock.calls;
    expect(calls[0][1]).toBe('lore_manage');
    expect(calls[0][2]).toEqual({});
  });

  it('handles API errors gracefully and resets busy state', async () => {
    const errorMessage = 'Network error';
    vi.mocked(mcpModule.callTool).mockRejectedValue(new Error(errorMessage));

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const errorDisplay = screen.queryByText(errorMessage);
    expect(errorDisplay).toBeInTheDocument();

    // Button should not be disabled after error
    expect(runBtn.disabled).toBe(false);
  });

  it('adds entries to history on successful call', async () => {
    const mockResult = { topics: ['topic1', 'topic2'] };
    vi.spyOn(mcpModule, 'callTool').mockResolvedValue(mockResult);

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const history = container.querySelector('.history');
    expect(history?.innerHTML).toContain('lore_manage');
  });

  it('renders datalist for autocomplete', () => {
    const { container } = render(MCPPanel);
    const datalist = container.querySelector('datalist');
    expect(datalist).toBeInTheDocument();
    expect(datalist?.id).toBe('tools-list');
  });

  it('makes history entries collapsible', async () => {
    const mockResult = { data: 'test' };
    vi.spyOn(mcpModule, 'callTool').mockResolvedValue(mockResult);

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entryHeader = container.querySelector('.entry-header') as HTMLButtonElement;
    expect(entryHeader).toBeInTheDocument();

    const jsonResult = container.querySelector('.json-result');
    expect(jsonResult).not.toBeInTheDocument();

    await fireEvent.click(entryHeader);

    await waitFor(() => {
      const expandedResult = container.querySelector('.json-result');
      expect(expandedResult).toBeInTheDocument();
    });
  });

  it('toggles collapse icon on entry click', async () => {
    const mockResult = { data: 'test' };
    vi.spyOn(mcpModule, 'callTool').mockResolvedValue(mockResult);

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const collapseIcon = container.querySelector('.collapse-icon');
    expect(collapseIcon?.textContent).toBe('▶');

    const entryHeader = container.querySelector('.entry-header') as HTMLButtonElement;
    await fireEvent.click(entryHeader);

    await waitFor(() => {
      expect(collapseIcon?.textContent).toBe('▼');
    });
  });

  it('displays JSON syntax highlighted in history', async () => {
    const mockResult = { topics: ['topic1', 'topic2'] };
    vi.spyOn(mcpModule, 'callTool').mockResolvedValue(mockResult);

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const entryHeader = container.querySelector('.entry-header') as HTMLButtonElement;
    await fireEvent.click(entryHeader);

    await waitFor(() => {
      const jsonResult = container.querySelector('.json-result code');
      expect(jsonResult?.innerHTML).toContain('hljs');
    });
  });

});
