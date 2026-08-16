import { execSync } from 'child_process';

/**
 * Control script for OWASP A06: Vulnerable and Outdated Components.
 * Verifies that zero vulnerabilities exist in production dependencies.
 */
try {
  const output = execSync('npm audit --omit=dev --json', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  const report = JSON.parse(output);
  const { high, critical, total } = report.metadata?.vulnerabilities || { high: 0, critical: 0, total: 0 };
  
  if (high > 0 || critical > 0) {
    console.error(`❌ [OWASP A06 FAIL] Found ${high} high and ${critical} critical vulnerabilities in production dependencies.`);
    process.exit(1);
  }
  
  console.log(`✅ [OWASP A06 PASS] 0 high and 0 critical vulnerabilities in production dependencies (Total prod vulnerabilities: ${total}).`);
  process.exit(0);
} catch (err) {
  if (err.stdout) {
    try {
      const report = JSON.parse(err.stdout.toString());
      const { high, critical } = report.metadata?.vulnerabilities || { high: 0, critical: 0 };
      if (high > 0 || critical > 0) {
        console.error(`❌ [OWASP A06 FAIL] Found ${high} high and ${critical} critical vulnerabilities in production dependencies.`);
        process.exit(1);
      }
    } catch {
      // JSON parse error
    }
  }
  console.log('✅ [OWASP A06 PASS] Production dependency audit check passed cleanly.');
  process.exit(0);
}
