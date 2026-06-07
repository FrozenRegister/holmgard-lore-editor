import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export default async function globalTeardown(config: FullConfig) {
  // This runs after all tests complete
  // Playwright doesn't natively collect code coverage, but we can combine
  // with @playwright/test-coverage if needed
  
  const reportDir = path.resolve('./playwright-report');
  const resultsPath = path.join(reportDir, 'results.json');
  
  if (fs.existsSync(resultsPath)) {
    try {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      let totalTests = 0;
      let passedTests = 0;
      let failedTests = 0;

      /**
       * Result Walker: Recursively traverses the Playwright JSON report 
       * tree to tally final pass/fail counts for CLI output.
       */
      const walk = (item: any) => {
        if (item.specs) {
          item.specs.forEach((spec: any) => {
            spec.tests.forEach((test: any) => {
              totalTests++;
              // A test is successful only if all retries/results are passed
              const isPassed = test.results.every((r: any) => r.status === 'passed' || r.status === 'expected');
              if (isPassed) passedTests++;
              else failedTests++;
            });
          });
        }
        if (item.suites) item.suites.forEach(walk);
      };

      walk(results);
      
      const status = failedTests === 0 ? 'SUCCESS' : 'FAILURE';
      console.log(`[E2E] ${status}: ${passedTests}/${totalTests} tests passed (${failedTests} failed).`);
    } catch (err) {
      console.error('[E2E] Could not parse results.json for summary.');
    }
  }
}