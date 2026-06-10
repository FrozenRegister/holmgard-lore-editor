import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface FileCoverageData {
  lines: { pct: number; covered: number; total: number };
  functions: { pct: number; covered: number; total: number };
  branches: { pct: number; covered: number; total: number };
  statements: { pct: number; covered: number; total: number };
}

interface CoverageSummary {
  total: FileCoverageData;
  [file: string]: FileCoverageData | any;
}

interface SuiteGap {
  file: string;
  type: 'unit' | 'integration';
  uncoveredLines: number[];
  uncoveredBranches: number[];
  pct: number;
  threshold: number;
}

interface SuiteSummary {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

interface GapReport {
  timestamp: string;
  summary: {
    unit: SuiteSummary;
    integration: SuiteSummary;
    e2e: { passed: number; failed: number; total: number };
  };
  gaps: SuiteGap[];
  actionItems: ActionItem[];
}

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  file: string;
  message: string;
  suggestedTest: string;
}

const SUITE_CONFIGS: { type: 'unit' | 'integration'; summaryPath: string }[] = [
  {
    type: 'unit',
    summaryPath: path.join(ROOT, 'coverage/unit/coverage-summary.json'),
  },
  {
    type: 'integration',
    summaryPath: path.join(ROOT, 'coverage/integration/coverage-summary.json'),
  },
];

const REPORT_DIR = path.join(ROOT, 'coverage-gap-report');
const THRESHOLD = 80;

/**
 * Reads a coverage-summary.json file and returns its parsed contents,
 * or null if the file does not exist.
 */
function readCoverageSummary(filePath: string): CoverageSummary | null {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Coverage summary not found at: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CoverageSummary;
}

/**
 * Build per-suite summary percentages from the coverage total.
 */
function extractSuiteSummary(total: FileCoverageData): SuiteSummary {
  return {
    lines: roundPct(total.lines.pct),
    functions: roundPct(total.functions.pct),
    branches: roundPct(total.branches.pct),
    statements: roundPct(total.statements.pct),
  };
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function determinePriority(pct: number): 'high' | 'medium' | 'low' {
  const diff = THRESHOLD - pct;
  if (diff >= 20) return 'high';
  if (diff >= 5) return 'medium';
  return 'low';
}

/**
 * Collects files below the threshold from a coverage summary.
 */
function collectGaps(
  summary: CoverageSummary,
  suiteType: 'unit' | 'integration',
): SuiteGap[] {
  const gaps: SuiteGap[] = [];

  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total') continue;

    // Vitest json-summary may store properties directly or via `lines` sub-object
    const fileData = data as FileCoverageData;
    const pct = fileData.lines?.pct ?? 0;

    if (pct < THRESHOLD) {
      gaps.push({
        file: normalizeFilePath(file, path.join(ROOT, 'src/lib')),
        type: suiteType,
        uncoveredLines: [],
        uncoveredBranches: [],
        pct: roundPct(pct),
        threshold: THRESHOLD,
      });
    }
  }

  return gaps;
}

/**
 * Normalize absolute paths from Vitest coverage output into repo-relative paths.
 */
function normalizeFilePath(filePath: string, libRoot: string): string {
  // Vitest coverage uses absolute paths on Windows; normalize to src/lib/...
  const normalized = filePath.replace(/\\/g, '/');
  const libRootNormalized = libRoot.replace(/\\/g, '/');

  if (normalized.startsWith(libRootNormalized)) {
    return 'src/lib/' + normalized.slice(libRootNormalized.length + 1);
  }

  // Already relative or in some other form — keep as-is but normalize slashes
  return normalized;
}

function generateActionItems(gaps: SuiteGap[]): ActionItem[] {
  return gaps.map((gap) => {
    const diff = (THRESHOLD - gap.pct).toFixed(2);
    const priority = determinePriority(gap.pct);
    const priorityLabel = priority === 'high' ? '🟠 HIGH' : priority === 'medium' ? '🟡 MEDIUM' : '🟢 LOW';

    let message: string;
    if (gap.pct === 0) {
      message = `File has 0% coverage, ${THRESHOLD}% below ${gap.type} threshold.`;
    } else {
      message = `File has ${gap.pct}% coverage, ${diff}% below ${gap.type} threshold.`;
    }

    return {
      priority,
      file: gap.file,
      message: `${priorityLabel}: ${gap.file}\n> ${message}`,
      suggestedTest: gap.pct === 0
        ? `Add a ${gap.type} test suite for this file.`
        : `Add tests for uncovered lines: `,
    };
  });
}

function generateMarkdownReport(report: GapReport): string {
  let md = '# Coverage Gap Analysis Report\n\n';
  md += `**Generated:** ${report.timestamp}\n\n`;

  md += '## Summary\n\n';
  md += '| Suite | Lines | Functions | Branches | Statements |\n';
  md += '|-------|-------|-----------|----------|------------|\n';
  md += `| Unit | ${report.summary.unit.lines}% | ${report.summary.unit.functions}% | ${report.summary.unit.branches}% | ${report.summary.unit.statements}% |\n`;
  md += `| Integration | ${report.summary.integration.lines}% | ${report.summary.integration.functions}% | ${report.summary.integration.branches}% | ${report.summary.integration.statements}% |\n\n`;

  md += '| E2E | Passed | Failed | Total |\n';
  md += '|-----|--------|--------|-------|\n';
  md += `| Playwright | ${report.summary.e2e.passed} | ${report.summary.e2e.failed} | ${report.summary.e2e.total} |\n\n`;

  if (report.gaps.length === 0) {
    md += '## Gaps by File\n\n✅ All files meet the coverage threshold!\n\n';
    return md;
  }

  md += '## Gaps by File\n\n';

  // Group by suite type
  const unitGaps = report.gaps.filter((g) => g.type === 'unit');
  const integrationGaps = report.gaps.filter((g) => g.type === 'integration');

  function writeGapSection(gaps: SuiteGap[], suiteLabel: string): string {
    if (gaps.length === 0) {
      return `### ${suiteLabel}\n\n✅ All ${suiteLabel.toLowerCase()} files meet the coverage threshold!\n\n`;
    }

    let section = `### ${suiteLabel}\n\n`;
    for (const gap of gaps) {
      const diff = (THRESHOLD - gap.pct).toFixed(2);
      section += `### ${gap.file} (${gap.type})\n`;
      section += `- **Coverage:** ${gap.pct}% (threshold: ${THRESHOLD}%)\n`;
      section += `- **Uncovered lines:** ${gap.uncoveredLines.length}\n`;
      section += `- **Uncovered branches:** ${gap.uncoveredBranches.length}\n\n`;
    }
    return section;
  }

  md += writeGapSection(unitGaps, 'Unit');
  md += writeGapSection(integrationGaps, 'Integration');

  // Action Items
  md += '## Action Items\n\n';
  for (const item of report.actionItems) {
    md += `### ${item.message.split(':')[0]}: ${item.file}\n`;
    md += `> ${item.message.split('\n> ')[1] || item.message}\n`;
    md += `> **Suggested:** ${item.suggestedTest}\n\n`;
  }

  return md;
}

async function analyzeCoverage(): Promise<void> {
  const allGaps: SuiteGap[] = [];
  const suiteSummaries: { unit: SuiteSummary | null; integration: SuiteSummary | null } = {
    unit: null,
    integration: null,
  };
  let anySuiteMissing = false;

  for (const config of SUITE_CONFIGS) {
    const summary = readCoverageSummary(config.summaryPath);

    if (!summary) {
      anySuiteMissing = true;
      // Create a zeroed-out placeholder so the report still shows the suite
      suiteSummaries[config.type] = {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      };
      console.warn(
        `⚠️  ${config.type} coverage summary missing — reporting 0% for this suite. ` +
          `Run the ${config.type} tests with --coverage first.`,
      );
      continue;
    }

    suiteSummaries[config.type] = extractSuiteSummary(summary.total);
    const gaps = collectGaps(summary, config.type);
    allGaps.push(...gaps);

    const pct = summary.total.lines.pct;
    console.log(
      `📊 ${config.type.toUpperCase()} total coverage: ${roundPct(pct)}% lines (${summary.total.lines.covered}/${summary.total.lines.total})`,
    );
  }

  // Ensure report directory exists
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  const report: GapReport = {
    timestamp,
    summary: {
      unit: suiteSummaries.unit || { lines: 0, functions: 0, branches: 0, statements: 0 },
      integration: suiteSummaries.integration || { lines: 0, functions: 0, branches: 0, statements: 0 },
      e2e: { passed: 0, failed: 0, total: 0 },
    },
    gaps: allGaps,
    actionItems: generateActionItems(allGaps),
  };

  // Write JSON report
  const jsonPath = path.join(REPORT_DIR, 'gap-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`💾 JSON report saved to: ${jsonPath}`);

  // Write Markdown report
  const mdPath = path.join(REPORT_DIR, 'gap-report.md');
  fs.writeFileSync(mdPath, generateMarkdownReport(report));
  console.log(`💾 Markdown report saved to: ${mdPath}`);

  console.log('\n📊 Coverage Gap Summary:');
  console.log(`   Unit:        ${report.summary.unit.lines}% lines`);
  console.log(`   Integration: ${report.summary.integration.lines}% lines`);
  console.log(`   Gaps found:  ${allGaps.length}`);

  if (allGaps.length > 0) {
    console.log('\n⚠️  Files below 80% threshold:');
    for (const gap of allGaps) {
      console.log(`   🔴 [${gap.type}] ${gap.file}: ${gap.pct}%`);
    }

    // Check per-suite failures
    const unitGaps = allGaps.filter((g) => g.type === 'unit');
    const integrationGaps = allGaps.filter((g) => g.type === 'integration');

    if (unitGaps.length > 0) {
      console.log(`\n❌ Unit suite has ${unitGaps.length} file(s) below threshold.`);
    }
    if (integrationGaps.length > 0) {
      console.log(`❌ Integration suite has ${integrationGaps.length} file(s) below threshold.`);
    }

    console.log('\nQuality Gate: FAILED');
    process.exit(1);
  }

  if (anySuiteMissing) {
    console.log('\n⚠️  Quality Gate: PASSED (with warnings — one or more suites are missing)');
  } else {
    console.log('\n✅ All files in all suites meet the coverage threshold!');
  }
  process.exit(0);
}

analyzeCoverage().catch((err) => {
  console.error(err);
  process.exit(1);
});