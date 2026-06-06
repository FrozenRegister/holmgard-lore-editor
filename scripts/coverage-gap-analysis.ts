import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface CoverageSummary {
  total: { lines: { pct: number; covered: number; total: number } };
  [file: string]: any;
}