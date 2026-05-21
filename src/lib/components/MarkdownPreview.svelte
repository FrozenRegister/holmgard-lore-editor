<script lang="ts">
  import { renderMarkdown } from '$lib/marked-config';

  export let markdown = '';

  $: html = renderMarkdown(markdown);
</script>

<div class="preview-wrapper">
  <div class="prose" contenteditable="false">
    {@html html}
  </div>
</div>

<style>
  .preview-wrapper {
    height: 100%;
    overflow-y: auto;
    padding: 1.5rem 2rem;
    background: var(--bg);
  }

  /* Prose styles inherited from app.css .prose class */
</style>
