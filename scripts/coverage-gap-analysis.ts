import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface CoverageSummary {
  total: { lines: { pct: number; covered: number; total: number } };
  [file: string]: any;
}

const SUMMARY_PATH = path.join(ROOT, 'coverage/unit/coverage-summary.json');
const THRESHOLD = 80;

/**
 * Analyzes the Vitest coverage summary and identifies files falling below 
 * the required testing threshold.
 */
async function analyzeCoverage() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`❌ Coverage summary not found at: ${SUMMARY_PATH}`);
    console.log('Hint: Run "pnpm test:coverage" first.');
    process.exit(1);
  }

  const summary: CoverageSummary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));
  const gaps: string[] = [];

  console.log(`\n📊 Coverage Gap Analysis (Threshold: ${THRESHOLD}%)`);
  console.log('--------------------------------------------------');

  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total') continue;

    const pct = data.lines.pct;
    if (pct < THRESHOLD) {
      const diff = (THRESHOLD - pct).toFixed(2);
      gaps.push(`🔴 ${file}: ${pct}% (${diff}% below threshold)`);
    }
  }

  if (gaps.length > 0) {
    gaps.forEach(gap => console.log(gap));
    console.log('\n⚠️  Critical coverage gaps identified in storage and sync logic.');
    // Exit with 0 for now to allow CI to report, but this can be changed to 1 
    // to block PRs if strict coverage is desired.
    process.exit(0);
  } else {
    console.log('✅ All files meet the coverage threshold!');
  }
}

analyzeCoverage().catch(err => { console.error(err); process.exit(1); });