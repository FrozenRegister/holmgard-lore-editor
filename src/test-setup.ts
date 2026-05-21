/**
 * Vitest global setup — runs before every test file.
 */
import '@testing-library/jest-dom';

// Polyfill crypto.subtle in jsdom (Node 18 has it natively on globalThis.crypto)
// jsdom may not expose it — patch if missing.
if (!globalThis.crypto?.subtle) {
  const nodeCrypto = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto.webcrypto,
    writable: false,
    configurable: true,
  });
}

// Silence noisy console.warn from Svelte SSR during tests
const _warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('was created with unknown prop')) return;
  _warn(...args);
};
