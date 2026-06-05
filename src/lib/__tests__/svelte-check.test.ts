import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('svelte-check', () => {
  it('should have no type errors', () => {
    try {
      const output = execSync('pnpm exec svelte-check --tsconfig ./tsconfig.json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const errorMatch = output.match(/svelte-check found (\d+) errors?/);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

      if (errorCount > 0) {
        console.log(`⚠️  svelte-check found ${errorCount} type errors`);
      }
      expect(errorCount).toBe(0);
    } catch (error: any) {
      const output = error.stdout || error.message;
      const errorMatch = output.match(/svelte-check found (\d+) errors?/);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

      if (errorCount > 0) {
        console.log(`⚠️  svelte-check found ${errorCount} type errors`);
      }
      expect(errorCount).toBe(0);
    }
  });
});
