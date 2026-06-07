import { readFileSync } from 'fs';
import { existsSync } from 'fs';

export function loadEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalsIndex).trim();
    const value = trimmed.substring(equalsIndex + 1).trim();

    if (key && !process.env.hasOwnProperty(key)) {
      process.env[key] = value;
    }
  }
}
