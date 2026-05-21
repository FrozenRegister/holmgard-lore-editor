import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules', 'src-tauri'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/routes/**', 'src/app.html', '**/__tests__/**'],
    },
    setupFiles: ['src/test-setup.ts'],
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $app: path.resolve('./src/app-mock'),
    },
  },
});
