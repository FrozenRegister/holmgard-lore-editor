<script lang="ts">
  import { renderMarkdown } from '$lib/marked-config';
  import { topics } from '$lib/stores';

  export let markdown = '';

  $: html = renderMarkdown(markdown, $topics.map(t => t.key));
</script>

<div class="preview-wrapper">
  <article class="prose" contenteditable="false">
    {@html html}
  </article>
</div>

<style>
  .preview-wrapper {
    height: 100%;
    overflow-y: auto;
    padding: 1.5rem 2rem;
    background: var(--bg);
    box-sizing: border-box;
  }

  .prose {
    max-width: 70ch;
    margin: 0 auto;
  }

  /* Ensure content injected via @html is responsive */
  .prose :global(img) {
    max-width: 100%;
    height: auto;
  }

  .prose :global(pre) {
    max-width: 100%;
    overflow-x: auto;
    background: rgba(0, 0, 0, 0.05);
    padding: 1rem;
    border-radius: 4px;
  }

  .prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }

  /* Wiki-link styles */
  .prose :global(a.wiki-link) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .prose :global(.wiki-link--unresolved) {
    color: var(--fg-muted);
    border-bottom: 1px dashed currentColor;
    cursor: help;
  }
</style>
