<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import loader from '@monaco-editor/loader';
  import type * as Monaco from 'monaco-editor';

  export let value = '';
  export let language = 'markdown';
  export let readOnly = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  let container: HTMLDivElement;
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let monaco: typeof Monaco | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(async () => {
    const m = await loader.init();
    monaco = m;

    // Define the Holmgard dark theme
    m.editor.defineTheme('holmgard-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword',          foreground: 'c9a84c', fontStyle: 'bold' },
        { token: 'string',           foreground: '9ccc65' },
        { token: 'comment',          foreground: '6d8086', fontStyle: 'italic' },
        { token: 'delimiter.curly',  foreground: '4fc3f7' },
        { token: 'delimiter.square', foreground: '4fc3f7' },
        { token: 'number',           foreground: 'ffb74d' },
        { token: 'tag',              foreground: 'c9a84c' },
        { token: 'attribute.name',   foreground: '7a6bb0' },
        { token: 'attribute.value',  foreground: '9ccc65' },
      ],
      colors: {
        'editor.background':           '#12111a',
        'editor.foreground':           '#e8dcc8',
        'editor.lineHighlightBackground': '#1e1c2a',
        'editorLineNumber.foreground': '#4a4560',
        'editorGutter.background':     '#12111a',
        'editor.selectionBackground':  '#3d3260',
        'editorCursor.foreground':     '#c9a84c',
        'scrollbarSlider.background':  '#2a2740',
        'scrollbarSlider.hoverBackground': '#3d3a60',
      },
    });

    const e = m.editor.create(container, {
      value,
      language,
      theme: 'holmgard-dark',
      readOnly,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
      fontLigatures: true,
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      padding: { top: 12, bottom: 12 },
      automaticLayout: false, // we handle with ResizeObserver
      suggest: { showWords: false },
      quickSuggestions: false,
      tabSize: 2,
      insertSpaces: true,
    });
    editor = e;

    e.onDidChangeModelContent(() => {
      const newValue = e.getValue();
      if (newValue !== value) {
        value = newValue;
        dispatch('change', newValue);
      }
    });

    // Auto layout on container resize
    resizeObserver = new ResizeObserver(() => editor?.layout());
    resizeObserver.observe(container);
  });

  // Sync external value changes back into editor (e.g. history restore)
  $: if (editor && editor.getValue() !== value) {
    const model = editor.getModel();
    if (model) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: value }],
        () => null
      );
    }
  }

  onDestroy(() => {
    resizeObserver?.disconnect();
    editor?.dispose();
  });
</script>

<div class="monaco-container" bind:this={container}></div>

<style>
  .monaco-container {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
