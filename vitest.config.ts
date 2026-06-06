import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    name: 'unit',
    globals: true,
    environment: 'jsdom',
    include: ['src/lib/**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules', 'src-tauri', 'src/routes/**', 'src/lib/components/**', 'src/lib/**/*.svelte'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'html'],
      reportsDirectory: './coverage/unit',
      exclude: [
        'src/routes/**',
        'src/app.html',
        'src/app.d.ts',
        'src/test-setup.ts',
        'src/app-mock/**',
        'src/lib/components/**',
        'src/lib/**/*.svelte',
        'src/lib/claude.ts',
        'src/lib/crypto.ts',
        'src/lib/demo-data.ts',
        'src/lib/marked-config.ts',
        '.svelte-kit/**',
        'static/**',
        'scripts/**',
        '**/*.d.ts',
        '**/*.config.*',
        'vitest.config.ts',
        'playwright.config.ts',
        'svelte.config.js',
        'tailwind.config.*',
        'e2e/**',
        'coverage/**',
        'build/**',
        'dist/**',
        'node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
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
