#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Automated Policy Remediation Runner
 * Phase 6: Continuous Compliance Automation
 *
 * Provides automated remediation for common policy drift scenarios.
 *
 * Features:
 * - Bundle rebuild for all tenants
 * - OPAL sync verification
 * - Health check for OPA instances
 * - Rollback to previous baseline
 * - Data synchronization
 *
 * Usage:
 *   npx ts-node --esm scripts/policy/remediation-runner.ts rebuild
 *   npx ts-node --esm scripts/policy/remediation-runner.ts sync
 *   npx ts-node --esm scripts/policy/remediation-runner.ts health
 *   npx ts-node --esm scripts/policy/remediation-runner.ts rollback
 *   npx ts-node --esm scripts/policy/remediation-runner.ts auto
 *
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OPA_BIN = path.join(PROJECT_ROOT, 'bin/opa');
const POLICIES_DIR = path.join(PROJECT_ROOT, 'policies');
const BUNDLES_DIR = path.join(PROJECT_ROOT, 'dist/bundles');
const BASELINES_DIR = path.join(POLICIES_DIR, 'baselines');

// Types
interface RemediationResult {
  action: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number;
}

interface HealthCheck {
  component: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;
  details?: Record<string, unknown>;
}

interface OPAHealth {
  status: string;
  policies_loaded?: number;
  uptime?: string;
}

const TENANTS = ['USA', 'FRA', 'GBR', 'DEU'];

// OPAL endpoints (configurable via environment)
const OPAL_SERVER_URL = process.env.OPAL_SERVER_URL || 'http://localhost:7002';
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * Execute shell command with timeout
 */
function execCommand(
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = child_process.execSync(command, {
      encoding: 'utf-8',
      cwd: options.cwd || PROJECT_ROOT,
      timeout: options.timeout || 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || String(error),
      code: execError.status || 1,
    };
  }
}

/**
 * Check if a service is reachable
 */
async function isServiceReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Rebuild all tenant bundles
 */
async function rebuildBundles(): Promise<RemediationResult> {
  const startTime = Date.now();
  console.log('\n🔨 Rebuilding all tenant bundles...\n');

  const result = execCommand(
    'npx ts-node --esm scripts/policy/build-tenant-bundle.ts build --all',
    { timeout: 120000 }
  );

  const duration = Date.now() - startTime;

  if (result.code === 0) {
    // Verify bundles were created
    const bundlesCreated = TENANTS.filter(t =>
      fs.existsSync(path.join(BUNDLES_DIR, t.toLowerCase(), 'bundle.tar.gz'))
    );

    console.log(result.stdout);

    return {
      action: 'rebuild_bundles',
      success: true,
      message: `Successfully rebuilt ${bundlesCreated.length}/${TENANTS.length} bundles`,
      details: {
        tenants: bundlesCreated,
        output_dir: BUNDLES_DIR,
      },
      duration,
    };
  }

  console.error(result.stderr);

  return {
    action: 'rebuild_bundles',
    success: false,
    message: 'Bundle rebuild failed',
    details: {
      error: result.stderr,
      exit_code: result.code,
    },
    duration,
  };
}

/**
 * Run policy tests
 */
async function runTests(): Promise<RemediationResult> {
  const startTime = Date.now();
  console.log('\n🧪 Running policy tests...\n');

  const result = execCommand(`${OPA_BIN} test ${POLICIES_DIR} -v`, { timeout: 120000 });
  const duration = Date.now() - startTime;

  // Parse test results
  const passMatch = result.stdout.match(/PASS:\s*(\d+)\/(\d+)/);
  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const total = passMatch ? parseInt(passMatch[2]) : 0;

  if (result.code === 0) {
    return {
      action: 'run_tests',
      success: true,
      message: `All ${total} policy tests passed`,
      details: {
        passed,
        total,
        coverage: 'N/A',
      },
      duration,
    };
  }

  return {
    action: 'run_tests',
    success: false,
    message: `Policy tests failed: ${passed}/${total} passed`,
    details: {
      passed,
      total,
      error: result.stderr,
    },
    duration,
  };
}

/**
 * Trigger OPAL sync
 */
async function triggerOPALSync(): Promise<RemediationResult> {
  const startTime = Date.now();
  console.log('\n🔄 Triggering OPAL synchronization...\n');

  // Check if OPAL is reachable
  const opalReachable = await isServiceReachable(`${OPAL_SERVER_URL}/healthz`);

  if (!opalReachable) {
    return {
      action: 'opal_sync',
      success: false,
      message: 'OPAL server is not reachable',
      details: {
        url: OPAL_SERVER_URL,
        suggestion: 'Check OPAL server status or verify OPAL_SERVER_URL environment variable',
      },
      duration: Date.now() - startTime,
    };
  }

  try {
    // Trigger data update via OPAL
    const response = await fetch(`${OPAL_SERVER_URL}/data/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          {
            url: 'file:///policies/data/data.json',
            dst_path: '/',
          },
        ],
      }),
    });

    if (response.ok) {
      return {
        action: 'opal_sync',
        success: true,
        message: 'OPAL synchronization triggered successfully',
        details: {
          opal_url: OPAL_SERVER_URL,
          status: response.status,
        },
        duration: Date.now() - startTime,
      };
    }

    return {
      action: 'opal_sync',
      success: false,
      message: `OPAL sync failed: ${response.statusText}`,
      details: {
        status: response.status,
        statusText: response.statusText,
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      action: 'opal_sync',
      success: false,
      message: 'OPAL sync failed with exception',
      details: {
        error: String(error),
      },
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Check health of all components
 */
async function checkHealth(): Promise<HealthCheck[]> {
  console.log('\n🏥 Checking component health...\n');
  const checks: HealthCheck[] = [];

  // Check OPA binary
  const opaResult = execCommand(`${OPA_BIN} version`);
  checks.push({
    component: 'OPA Binary',
    status: opaResult.code === 0 ? 'healthy' : 'unhealthy',
    message: opaResult.code === 0 ? opaResult.stdout.trim().split('\n')[0] : 'OPA binary not found',
  });

  // Check policies directory
  const policyCount = fs.readdirSync(POLICIES_DIR).filter(f => f.endsWith('.rego')).length;
  checks.push({
    component: 'Policies Directory',
    status: policyCount > 0 ? 'healthy' : 'unhealthy',
    message: `Found ${policyCount} policy files in root`,
    details: { path: POLICIES_DIR },
  });

  // Check bundles
  for (const tenant of TENANTS) {
    const bundlePath = path.join(BUNDLES_DIR, tenant.toLowerCase(), 'bundle.tar.gz');
    const manifestPath = path.join(BUNDLES_DIR, tenant.toLowerCase(), 'manifest.json');

    if (fs.existsSync(bundlePath) && fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      checks.push({
        component: `Bundle: ${tenant}`,
        status: 'healthy',
        message: `Revision: ${manifest.revision}`,
        details: {
          created: manifest.createdAt,
          checksum: manifest.checksum.substring(0, 12),
        },
      });
    } else {
      checks.push({
        component: `Bundle: ${tenant}`,
        status: 'unhealthy',
        message: 'Bundle or manifest not found',
      });
    }
  }

  // Check OPA server (if running)
  try {
    const opaHealthResponse = await fetch(`${OPA_URL}/health`, {
      signal: AbortSignal.timeout(3000)
    });

    if (opaHealthResponse.ok) {
      checks.push({
        component: 'OPA Server',
        status: 'healthy',
        message: `Running at ${OPA_URL}`,
      });
    } else {
      checks.push({
        component: 'OPA Server',
        status: 'unhealthy',
        message: `Unhealthy: ${opaHealthResponse.status}`,
      });
    }
  } catch {
    checks.push({
      component: 'OPA Server',
      status: 'unknown',
      message: 'Not reachable (may not be running)',
      details: { url: OPA_URL },
    });
  }

  // Check OPAL server (if running)
  try {
    const opalHealthResponse = await fetch(`${OPAL_SERVER_URL}/healthz`, {
      signal: AbortSignal.timeout(3000)
    });

    checks.push({
      component: 'OPAL Server',
      status: opalHealthResponse.ok ? 'healthy' : 'unhealthy',
      message: opalHealthResponse.ok ? `Running at ${OPAL_SERVER_URL}` : `Unhealthy: ${opalHealthResponse.status}`,
    });
  } catch {
    checks.push({
      component: 'OPAL Server',
      status: 'unknown',
      message: 'Not reachable (may not be running)',
      details: { url: OPAL_SERVER_URL },
    });
  }

  // Check baseline
  const baselinePath = path.join(BASELINES_DIR, 'policy-baseline.json');
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    checks.push({
      component: 'Policy Baseline',
      status: 'healthy',
      message: `Last updated: ${baseline.timestamp}`,
      details: {
        hash: baseline.source?.hash?.substring(0, 12),
        policy_count: baseline.source?.policy_count,
      },
    });
  } else {
    checks.push({
      component: 'Policy Baseline',
      status: 'unhealthy',
      message: 'No baseline found',
    });
  }

  return checks;
}

/**
 * Rollback to previous baseline (if available)
 */
async function rollbackToBaseline(): Promise<RemediationResult> {
  const startTime = Date.now();
  console.log('\n⏪ Rolling back to previous baseline...\n');

  const baselinePath = path.join(BASELINES_DIR, 'policy-baseline.json');
  const backupPath = path.join(BASELINES_DIR, 'policy-baseline.backup.json');

  // Check if backup exists
  if (!fs.existsSync(backupPath)) {
    return {
      action: 'rollback',
      success: false,
      message: 'No backup baseline available for rollback',
      details: {
        baseline_path: baselinePath,
        backup_path: backupPath,
      },
      duration: Date.now() - startTime,
    };
  }

  try {
    // Copy current to .previous if it exists
    if (fs.existsSync(baselinePath)) {
      fs.copyFileSync(baselinePath, path.join(BASELINES_DIR, 'policy-baseline.previous.json'));
    }

    // Restore from backup
    fs.copyFileSync(backupPath, baselinePath);

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

    return {
      action: 'rollback',
      success: true,
      message: 'Successfully rolled back to previous baseline',
      details: {
        baseline_timestamp: baseline.timestamp,
        baseline_hash: baseline.source?.hash?.substring(0, 12),
      },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      action: 'rollback',
      success: false,
      message: 'Rollback failed',
      details: {
        error: String(error),
      },
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Update the drift detector baseline
 */
async function updateBaseline(): Promise<RemediationResult> {
  const startTime = Date.now();
  console.log('\n📝 Updating policy baseline...\n');

  // Backup current baseline
  const baselinePath = path.join(BASELINES_DIR, 'policy-baseline.json');
  const backupPath = path.join(BASELINES_DIR, 'policy-baseline.backup.json');

  if (fs.existsSync(baselinePath)) {
    fs.copyFileSync(baselinePath, backupPath);
    console.log('   📦 Backed up current baseline');
  }

  // Run drift detector in update mode
  const result = execCommand(
    'npx ts-node --esm scripts/policy/drift-detector.ts baseline --update',
    { timeout: 60000 }
  );

  const duration = Date.now() - startTime;

  if (result.code === 0) {
    return {
      action: 'update_baseline',
      success: true,
      message: 'Successfully updated policy baseline',
      duration,
    };
  }

  return {
    action: 'update_baseline',
    success: false,
    message: 'Baseline update failed',
    details: {
      error: result.stderr,
    },
    duration,
  };
}

/**
 * Automated remediation based on drift detection
 */
async function autoRemediate(): Promise<RemediationResult[]> {
  console.log('\n🤖 Starting automated remediation...\n');
  console.log('='.repeat(50));

  const results: RemediationResult[] = [];

  // Step 1: Health check
  console.log('\n📍 Step 1: Health Check');
  const healthChecks = await checkHealth();
  const unhealthyComponents = healthChecks.filter(h => h.status === 'unhealthy');

  results.push({
    action: 'health_check',
    success: unhealthyComponents.length === 0,
    message: `${healthChecks.length - unhealthyComponents.length}/${healthChecks.length} components healthy`,
    details: {
      healthy: healthChecks.filter(h => h.status === 'healthy').map(h => h.component),
      unhealthy: unhealthyComponents.map(h => h.component),
    },
    duration: 0,
  });

  // Step 2: Run tests
  console.log('\n📍 Step 2: Policy Tests');
  const testResult = await runTests();
  results.push(testResult);

  if (!testResult.success) {
    console.log('\n⚠️ Tests failed - stopping auto-remediation');
    console.log('   Please fix failing tests before continuing');
    return results;
  }

  // Step 3: Rebuild bundles if needed
  console.log('\n📍 Step 3: Bundle Check & Rebuild');
  const bundleMissing = unhealthyComponents.some(h => h.component.startsWith('Bundle:'));

  if (bundleMissing) {
    const rebuildResult = await rebuildBundles();
    results.push(rebuildResult);

    if (!rebuildResult.success) {
      console.log('\n⚠️ Bundle rebuild failed - stopping auto-remediation');
      return results;
    }
  } else {
    console.log('   ✓ All bundles exist');
  }

  // Step 4: Update baseline
  console.log('\n📍 Step 4: Update Baseline');
  const baselineResult = await updateBaseline();
  results.push(baselineResult);

  // Step 5: OPAL sync (if available)
  console.log('\n📍 Step 5: OPAL Sync');
  const opalHealthy = healthChecks.find(h => h.component === 'OPAL Server')?.status === 'healthy';

  if (opalHealthy) {
    const syncResult = await triggerOPALSync();
    results.push(syncResult);
  } else {
    console.log('   ⏭️ OPAL not available - skipping sync');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('🤖 Automated Remediation Summary');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Total Duration: ${results.reduce((a, r) => a + r.duration, 0)}ms`);

  return results;
}

/**
 * Display health check results
 */
function displayHealthResults(checks: HealthCheck[]): void {
  console.log('\n📊 Health Check Results');
  console.log('='.repeat(50));

  for (const check of checks) {
    const icon = check.status === 'healthy' ? '✅'
               : check.status === 'unhealthy' ? '❌'
               : '⚠️';
    console.log(`${icon} ${check.component}`);
    console.log(`   ${check.message}`);
    if (check.details) {
      for (const [key, value] of Object.entries(check.details)) {
        console.log(`   ${key}: ${value}`);
      }
    }
  }

  const healthy = checks.filter(c => c.status === 'healthy').length;
  const total = checks.length;
  console.log('\n' + '='.repeat(50));
  console.log(`Summary: ${healthy}/${total} components healthy`);
}

/**
 * Display remediation result
 */
function displayResult(result: RemediationResult): void {
  console.log('\n' + '='.repeat(50));
  console.log(`📋 Remediation Result: ${result.action}`);
  console.log('='.repeat(50));

  const icon = result.success ? '✅' : '❌';
  console.log(`${icon} ${result.message}`);
  console.log(`⏱️  Duration: ${result.duration}ms`);

  if (result.details) {
    console.log('\nDetails:');
    for (const [key, value] of Object.entries(result.details)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('DIVE V3 Policy Remediation Runner');
    console.log('==================================');
    console.log('\nUsage:');
    console.log('  rebuild               Rebuild all tenant bundles');
    console.log('  test                  Run policy tests');
    console.log('  sync                  Trigger OPAL synchronization');
    console.log('  health                Check health of all components');
    console.log('  baseline              Update policy baseline');
    console.log('  rollback              Rollback to previous baseline');
    console.log('  auto                  Automated remediation workflow');
    console.log('\nExamples:');
    console.log('  npx ts-node --esm scripts/policy/remediation-runner.ts health');
    console.log('  npx ts-node --esm scripts/policy/remediation-runner.ts auto');
    process.exit(0);
  }

  switch (command) {
    case 'rebuild': {
      const result = await rebuildBundles();
      displayResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'test': {
      const result = await runTests();
      displayResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'sync': {
      const result = await triggerOPALSync();
      displayResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'health': {
      const checks = await checkHealth();
      displayHealthResults(checks);
      const unhealthy = checks.filter(c => c.status === 'unhealthy').length;
      process.exit(unhealthy > 0 ? 1 : 0);
      break;
    }

    case 'baseline': {
      const result = await updateBaseline();
      displayResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'rollback': {
      const result = await rollbackToBaseline();
      displayResult(result);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'auto': {
      const results = await autoRemediate();
      const failed = results.filter(r => !r.success).length;
      process.exit(failed > 0 ? 1 : 0);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});

