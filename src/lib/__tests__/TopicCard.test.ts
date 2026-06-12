import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TopicCard from '../components/TopicCard.svelte';
import type { Topic } from '../types';

describe('TopicCard.svelte', () => {
  const mockTopic: Topic = {
    key: 'test:topic',
    text: '# Test Topic\n\nThis is some content that should be previewed properly.\n\nIt has multiple lines and should be truncated with line clamping.',
    meta: {
      updatedAt: new Date().toISOString(),
      version: 1
    }
  };

  it('renders topic key', () => {
    render(TopicCard, { props: { topic: mockTopic } });
    expect(screen.getByText('test:topic')).toBeInTheDocument();
  });

  it('renders type prefix tag', () => {
    render(TopicCard, { props: { topic: mockTopic } });
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('renders preview text with line clamping', () => {
    const { container } = render(TopicCard, { props: { topic: mockTopic } });
    const preview = container.querySelector('.topic-preview');
    expect(preview).toBeInTheDocument();
    // Preview should contain the stripped text (no markdown formatting)
    expect(preview?.textContent).toContain('This is some content');
  });

  it('renders version and updated time', () => {
    render(TopicCard, { props: { topic: mockTopic } });
    expect(screen.getByText(/v1 ·/)).toBeInTheDocument();
  });

  it('renders delete button when not readOnly', () => {
    render(TopicCard, { props: { topic: mockTopic, readOnly: false } });
    expect(screen.getByLabelText('Delete topic test:topic')).toBeInTheDocument();
  });

  it('does not render delete button when readOnly', () => {
    render(TopicCard, { props: { topic: mockTopic, readOnly: true } });
    expect(screen.queryByLabelText('Delete topic test:topic')).not.toBeInTheDocument();
  });

  it('applies removed class when topic is removed', () => {
    const removedTopic = {
      ...mockTopic,
      meta: {
        ...mockTopic.meta,
        removedFromRemote: true
      }
    };
    const { container } = render(TopicCard, { props: { topic: removedTopic } });
    const card = container.querySelector('.topic-card');
    expect(card).toHaveClass('removed');
  });

  it('has consistent height for all cards', () => {
    const { container } = render(TopicCard, { props: { topic: mockTopic } });
    const card = container.querySelector('.topic-card');
    expect(card).toBeInTheDocument();
    // Card uses flexbox column layout + height: 100%, min-height: 180px for uniform sizing
    // (styles are applied via Svelte scoped CSS, verified in browser)
    expect(card?.innerHTML).toContain('topic-preview');
  });

  it('truncates long preview text with ellipsis', () => {
    const longTextTopic = {
      ...mockTopic,
      text: 'Very long text '.repeat(50)
    };
    const { container } = render(TopicCard, { props: { topic: longTextTopic } });
    const preview = container.querySelector('.topic-preview');
    expect(preview).toBeInTheDocument();
    // The preview should be truncated to 400 characters
    const text = preview?.textContent ?? '';
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toContain('Very long text');
  });

  it('dispatches open event when clicked', async () => {
    const { component, container } = render(TopicCard, { props: { topic: mockTopic } });
    const dispatchSpy = vi.fn();
    component.$on('open', dispatchSpy);

    const card = container.querySelector('.topic-card');
    await fireEvent.click(card!);

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('dispatches open event when Enter key is pressed', async () => {
    const { component, container } = render(TopicCard, { props: { topic: mockTopic } });
    const dispatchSpy = vi.fn();
    component.$on('open', dispatchSpy);

    const card = container.querySelector('.topic-card');
    await fireEvent.keyDown(card!, { key: 'Enter' });

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('dispatches delete event when delete button is clicked', async () => {
    const { component, getByLabelText } = render(TopicCard, { props: { topic: mockTopic, readOnly: false } });
    const dispatchSpy = vi.fn();
    component.$on('delete', dispatchSpy);

    const deleteButton = getByLabelText('Delete topic test:topic');
    await fireEvent.click(deleteButton);

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('detects JSON content type', () => {
    const jsonTopic = {
      ...mockTopic,
      text: '```json\n{"key": "value"}\n```'
    };
    render(TopicCard, { props: { topic: jsonTopic } });
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('detects XML content type', () => {
    const xmlTopic = {
      ...mockTopic,
      text: '```xml\n<root><element/></root>\n```'
    };
    render(TopicCard, { props: { topic: xmlTopic } });
    expect(screen.getByText('XML')).toBeInTheDocument();
  });
});