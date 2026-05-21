import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],

  // Tauri dev server
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },

  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  optimizeDeps: {
    exclude: ['@monaco-editor/loader'],
  },
});
