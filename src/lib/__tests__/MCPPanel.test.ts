import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MCPPanel from '../components/MCPPanel.svelte';
import * as mcpModule from '../mcp';
import { mcpOpen } from '../stores';

vi.mock('../mcp');

describe('MCPPanel.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpOpen.set(true);
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
    expect(input.value).toBe('list_topics');
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


  it('calls callTool with default list_topics method', async () => {
    vi.mocked(mcpModule.callTool).mockResolvedValue({ success: true });
    render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(vi.mocked(mcpModule.callTool)).toHaveBeenCalledWith(
      expect.stringContaining('frozenregister.workers.dev'),
      'list_topics',
      {}
    );
  });

  it('passes empty object for params when textarea is empty', async () => {
    vi.mocked(mcpModule.callTool).mockResolvedValue({});
    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('{}');

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(vi.mocked(mcpModule.callTool)).toHaveBeenCalledWith(
      expect.any(String),
      'list_topics',
      {}
    );
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
    vi.mocked(mcpModule.callTool).mockResolvedValue(mockResult);

    const { container } = render(MCPPanel);
    const runBtn = screen.getByText('Run Tool') as HTMLButtonElement;

    await fireEvent.click(runBtn);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const history = container.querySelector('.history');
    expect(history?.innerHTML).toContain('list_topics');
  });
});
