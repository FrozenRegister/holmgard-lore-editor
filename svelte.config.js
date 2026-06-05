import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Suppress known false-positive warnings in game UI with interactive divs and dynamic CSS
    // TODO: Refactor to use proper semantic elements (buttons) and form associations
    onwarn: (warning, handler) => {
      if (
        warning.code === 'a11y-click-events-have-key-events' ||
        warning.code === 'a11y-no-static-element-interactions' ||
        warning.code === 'a11y-label-has-associated-control' ||
        warning.code === 'css-unused-selector'
      ) {
        return;
      }
      handler(warning);
    },
  },
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
  },
};

export default config;
