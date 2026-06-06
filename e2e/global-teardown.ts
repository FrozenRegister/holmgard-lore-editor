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
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    const passed = results.suites?.some((suite: any) => 
      suite.specs?.some((spec: any) => 
        spec.tests?.some((test: any) => test.results?.some((r: any) => r.status === 'passed'))
      )
    ) ?? false;
    
    console.log(`[E2E] Test run complete. Passed: ${passed}`);
  }
}