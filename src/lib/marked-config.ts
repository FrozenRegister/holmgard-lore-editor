import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { resolveWikiLink } from './wiki-links';

let _topicKeys: string[] = [];

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setupMarked(): void {
  marked.use(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code: string, lang: string) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    })
  );

  marked.use({
    extensions: [{
      name: 'wikiLink',
      level: 'inline' as const,
      start(src: string): number | undefined {
        const idx = src.indexOf('[[');
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string): { type: string; raw: string; label: string } | undefined {
        const m = /^\[\[([^\]]+)\]\]/.exec(src);
        if (!m) return undefined;
        return { type: 'wikiLink', raw: m[0], label: m[1].trim() };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer(token: any): string {
        const key = resolveWikiLink(token.label as string, _topicKeys);
        const safe = escHtml(token.label as string);
        if (key) {
          return `<a href="/editor/${encodeURIComponent(key)}" class="wiki-link">${safe}</a>`;
        }
        return `<span class="wiki-link--unresolved" title="No topic: ${safe}">${safe}</span>`;
      },
    }],
  });

  marked.setOptions({
    gfm: true,
    breaks: false,
  });
}

export function renderMarkdown(text: string, topicKeys: string[] = []): string {
  _topicKeys = topicKeys;
  return marked.parse(text) as string;
}
