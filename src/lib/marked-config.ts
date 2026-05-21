/**
 * Configure marked with syntax highlighting via highlight.js.
 * Call `setupMarked()` once at app startup.
 */
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

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

  marked.setOptions({
    gfm: true,
    breaks: false,
  });
}

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}
