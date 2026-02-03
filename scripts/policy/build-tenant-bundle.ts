#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Tenant Policy Bundle Builder
 * Phase 4: Multi-Tenant Policy Isolation
 *
 * Generates per-tenant OPA policy bundles with:
 * - Tenant-specific configuration
 * - Tenant-specific data files
 * - Base/org/entrypoint policies
 * - Classification mappings
 * - OPAL scope isolation
 *
 * Usage:
 *   npx ts-node scripts/policy/build-tenant-bundle.ts build --all
 *   npx ts-node scripts/policy/build-tenant-bundle.ts build --tenant USA
 *   npx ts-node scripts/policy/build-tenant-bundle.ts verify --tenant USA
 *   npx ts-node scripts/policy/build-tenant-bundle.ts list
 *
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as child_process from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(__dirname, 'tenant-bundle-config.json');
const OPA_BIN = path.join(PROJECT_ROOT, 'bin/opa');
const POLICIES_DIR = path.join(PROJECT_ROOT, 'policies');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'dist/bundles');

interface TenantConfig {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  locale: string;
  classificationSystem: string;
  opalScope: string;
  bundleId: string;
}

interface BundleConfig {
  version: string;
  tenants: TenantConfig[];
  bundleOptions: {
    outputDir: string;
    includeBase: boolean;
    includeOrg: boolean;
    includeEntrypoints: boolean;
    includeData: boolean;
    compression: string;
    signingEnabled: boolean;
    signingKeyPath: string | null;
    manifestVersion: string;
    revisionFormat: string;
  };
  basePolicies: string[];
  orgPolicies: string[];
  sharedEntrypoints: string[];
  dataSourceDir: string;
  isolation: {
    namespacePrefix: string;
    scopeFiltering: boolean;
    dataPathPrefix: string;
    crossTenantDeny: boolean;
  };
  verification: {
    runTestsAfterBuild: boolean;
    validateManifest: boolean;
    maxBuildTimeSeconds: number;
  };
}

interface BundleManifest {
  revision: string;
  tenant: string;
  bundleId: string;
  createdAt: string;
  files: string[];
  checksum: string;
  opaVersion: string;
  classification_system: string;
  opal_scope: string;
}

interface BuildResult {
  tenant: string;
  success: boolean;
  bundlePath?: string;
  manifest?: BundleManifest;
  error?: string;
  durationMs: number;
}

/**
 * Load bundle configuration
 */
function loadConfig(): BundleConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ Configuration file not found: ${CONFIG_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

/**
 * Ensure output directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Calculate file checksum
 */
function calculateChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get OPA version
 */
function getOPAVersion(): string {
  try {
    const result = child_process.execSync(`${OPA_BIN} version`, { encoding: 'utf-8' });
    const match = result.match(/Version: ([\d.]+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Generate revision string
 */
function generateRevision(format: string): string {
  const now = new Date();
  switch (format) {
    case 'timestamp':
      return now.toISOString().replace(/[:.]/g, '-');
    case 'epoch':
      return String(Math.floor(now.getTime() / 1000));
    case 'date':
      return now.toISOString().split('T')[0];
    default:
      return now.toISOString().replace(/[:.]/g, '-');
  }
}

/**
 * Copy policy files to bundle staging directory
 */
function stagePolicies(
  config: BundleConfig,
  tenant: TenantConfig,
  stagingDir: string
): string[] {
  const files: string[] = [];

  // Copy base policies
  if (config.bundleOptions.includeBase) {
    for (const policyPath of config.basePolicies) {
      const srcPath = path.join(PROJECT_ROOT, policyPath);
      if (fs.existsSync(srcPath)) {
        const relativePath = policyPath.replace('policies/', '');
        const destPath = path.join(stagingDir, relativePath);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        files.push(relativePath);
      }
    }
  }

  // Copy org policies
  if (config.bundleOptions.includeOrg) {
    for (const policyPath of config.orgPolicies) {
      const srcPath = path.join(PROJECT_ROOT, policyPath);
      if (fs.existsSync(srcPath)) {
        const relativePath = policyPath.replace('policies/', '');
        const destPath = path.join(stagingDir, relativePath);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        files.push(relativePath);
      }
    }
  }

  // Copy shared entrypoints
  if (config.bundleOptions.includeEntrypoints) {
    for (const policyPath of config.sharedEntrypoints) {
      const srcPath = path.join(PROJECT_ROOT, policyPath);
      if (fs.existsSync(srcPath)) {
        const relativePath = policyPath.replace('policies/', '');
        const destPath = path.join(stagingDir, relativePath);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        files.push(relativePath);
      }
    }
  }

  // Copy tenant base policies
  const tenantBaseDir = path.join(POLICIES_DIR, 'tenant');
  const tenantBasePolicies = ['base.rego'];
  for (const file of tenantBasePolicies) {
    const srcPath = path.join(tenantBaseDir, file);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(stagingDir, 'tenant', file);
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      files.push(`tenant/${file}`);
    }
  }

  // Copy tenant-specific policies
  const tenantDir = path.join(POLICIES_DIR, 'tenant', tenant.id.toLowerCase());
  if (fs.existsSync(tenantDir)) {
    const tenantFiles = fs.readdirSync(tenantDir);
    for (const file of tenantFiles) {
      // Skip test files
      if (file.endsWith('_test.rego')) continue;

      const srcPath = path.join(tenantDir, file);
      if (fs.statSync(srcPath).isFile()) {
        const destPath = path.join(stagingDir, 'tenant', tenant.id.toLowerCase(), file);
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        files.push(`tenant/${tenant.id.toLowerCase()}/${file}`);
      }
    }
  }

  return files;
}

/**
 * Stage data files for tenant
 */
function stageData(
  config: BundleConfig,
  tenant: TenantConfig,
  stagingDir: string
): string[] {
  const files: string[] = [];

  if (!config.bundleOptions.includeData) {
    return files;
  }

  // Copy tenant-specific data.json
  const tenantDataPath = path.join(
    POLICIES_DIR,
    'tenant',
    tenant.id.toLowerCase(),
    'data.json'
  );

  if (fs.existsSync(tenantDataPath)) {
    const destPath = path.join(stagingDir, 'data.json');

    // Load and merge with shared data if needed
    const tenantData = JSON.parse(fs.readFileSync(tenantDataPath, 'utf-8'));

    // Add isolation metadata
    tenantData._isolation = {
      tenant_id: tenant.id,
      opal_scope: tenant.opalScope,
      namespace_prefix: config.isolation.namespacePrefix,
      cross_tenant_deny: config.isolation.crossTenantDeny,
    };

    fs.writeFileSync(destPath, JSON.stringify(tenantData, null, 2));
    files.push('data.json');
  }

  return files;
}

/**
 * Build OPA bundle for a tenant
 */
function buildBundle(
  config: BundleConfig,
  tenant: TenantConfig,
  outputDir: string
): BuildResult {
  const startTime = Date.now();
  const tenantOutputDir = path.join(outputDir, tenant.id.toLowerCase());
  const stagingDir = path.join(tenantOutputDir, 'staging');
  const bundlePath = path.join(tenantOutputDir, 'bundle.tar.gz');
  const manifestPath = path.join(tenantOutputDir, 'manifest.json');

  try {
    console.log(`\n📦 Building bundle for ${tenant.name} (${tenant.id})...`);

    // Clean and create directories
    if (fs.existsSync(tenantOutputDir)) {
      fs.rmSync(tenantOutputDir, { recursive: true });
    }
    ensureDir(stagingDir);

    // Stage policies
    console.log('  📄 Staging policies...');
    const policyFiles = stagePolicies(config, tenant, stagingDir);
    console.log(`     Staged ${policyFiles.length} policy files`);

    // Stage data
    console.log('  📊 Staging data...');
    const dataFiles = stageData(config, tenant, stagingDir);
    console.log(`     Staged ${dataFiles.length} data files`);

    // Generate revision
    const revision = generateRevision(config.bundleOptions.revisionFormat);

    // Build bundle with OPA
    console.log('  🔨 Building OPA bundle...');
    const buildCmd = [
      OPA_BIN,
      'build',
      '-b', stagingDir,
      '-o', bundlePath,
      '--revision', revision,
      '--bundle',
    ];

    child_process.execSync(buildCmd.join(' '), {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Calculate checksum
    const checksum = calculateChecksum(bundlePath);

    // Create manifest
    const manifest: BundleManifest = {
      revision,
      tenant: tenant.id,
      bundleId: tenant.bundleId,
      createdAt: new Date().toISOString(),
      files: [...policyFiles, ...dataFiles],
      checksum,
      opaVersion: getOPAVersion(),
      classification_system: tenant.classificationSystem,
      opal_scope: tenant.opalScope,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Get bundle size
    const bundleStats = fs.statSync(bundlePath);
    const bundleSizeKB = (bundleStats.size / 1024).toFixed(2);

    // Clean staging directory
    fs.rmSync(stagingDir, { recursive: true });

    const durationMs = Date.now() - startTime;
    console.log(`  ✅ Bundle built successfully!`);
    console.log(`     Size: ${bundleSizeKB} KB`);
    console.log(`     Revision: ${revision}`);
    console.log(`     Duration: ${durationMs}ms`);

    return {
      tenant: tenant.id,
      success: true,
      bundlePath,
      manifest,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`  ❌ Build failed: ${error}`);
    return {
      tenant: tenant.id,
      success: false,
      error: String(error),
      durationMs,
    };
  }
}

/**
 * Verify a tenant bundle
 */
function verifyBundle(
  config: BundleConfig,
  tenant: TenantConfig,
  outputDir: string
): boolean {
  const tenantOutputDir = path.join(outputDir, tenant.id.toLowerCase());
  const bundlePath = path.join(tenantOutputDir, 'bundle.tar.gz');
  const manifestPath = path.join(tenantOutputDir, 'manifest.json');

  console.log(`\n🔍 Verifying bundle for ${tenant.name} (${tenant.id})...`);

  // Check bundle exists
  if (!fs.existsSync(bundlePath)) {
    console.error(`  ❌ Bundle not found: ${bundlePath}`);
    return false;
  }
  console.log('  ✓ Bundle file exists');

  // Check manifest exists
  if (!fs.existsSync(manifestPath)) {
    console.error(`  ❌ Manifest not found: ${manifestPath}`);
    return false;
  }
  console.log('  ✓ Manifest file exists');

  // Verify checksum
  const manifest: BundleManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const actualChecksum = calculateChecksum(bundlePath);
  if (manifest.checksum !== actualChecksum) {
    console.error(`  ❌ Checksum mismatch!`);
    console.error(`     Expected: ${manifest.checksum}`);
    console.error(`     Actual: ${actualChecksum}`);
    return false;
  }
  console.log('  ✓ Checksum verified');

  // Verify bundle can be inspected by OPA
  try {
    const inspectCmd = `${OPA_BIN} inspect ${bundlePath}`;
    const inspectResult = child_process.execSync(inspectCmd, { encoding: 'utf-8' });
    console.log('  ✓ OPA can inspect bundle');

    // Check for expected namespaces
    if (inspectResult.includes('dive.tenant')) {
      console.log('  ✓ Contains tenant policies');
    }
    if (inspectResult.includes('dive.base')) {
      console.log('  ✓ Contains base policies');
    }
  } catch (error) {
    console.error(`  ❌ OPA inspect failed: ${error}`);
    return false;
  }

  // Run tests if enabled
  if (config.verification.runTestsAfterBuild) {
    console.log('  🧪 Running policy tests...');
    try {
      const testCmd = `${OPA_BIN} test ${POLICIES_DIR} -v`;
      child_process.execSync(testCmd, { encoding: 'utf-8', stdio: 'pipe' });
      console.log('  ✓ All policy tests pass');
    } catch (error) {
      console.error(`  ❌ Policy tests failed`);
      return false;
    }
  }

  console.log(`\n  ✅ Bundle verification passed!`);
  return true;
}

/**
 * List available tenants
 */
function listTenants(config: BundleConfig): void {
  console.log('\n📋 Available Tenants:\n');
  console.log('ID    | Name                | Classification  | OPAL Scope');
  console.log('------+---------------------+-----------------+------------------');

  for (const tenant of config.tenants) {
    const status = tenant.enabled ? '✓' : '✗';
    console.log(
      `${status} ${tenant.id.padEnd(3)} | ` +
      `${tenant.name.padEnd(19)} | ` +
      `${tenant.classificationSystem.padEnd(15)} | ` +
      `${tenant.opalScope}`
    );
  }

  console.log(`\nTotal: ${config.tenants.length} tenants (${config.tenants.filter(t => t.enabled).length} enabled)`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('DIVE V3 Tenant Policy Bundle Builder');
    console.log('=====================================');
    console.log('\nUsage:');
    console.log('  build --all              Build bundles for all enabled tenants');
    console.log('  build --tenant <ID>      Build bundle for specific tenant');
    console.log('  verify --tenant <ID>     Verify a tenant bundle');
    console.log('  list                     List available tenants');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/policy/build-tenant-bundle.ts build --all');
    console.log('  npx ts-node scripts/policy/build-tenant-bundle.ts build --tenant USA');
    process.exit(0);
  }

  const config = loadConfig();
  const outputDir = path.join(PROJECT_ROOT, config.bundleOptions.outputDir);

  switch (command) {
    case 'build': {
      const buildAll = args.includes('--all');
      const tenantIndex = args.indexOf('--tenant');
      const tenantId = tenantIndex >= 0 ? args[tenantIndex + 1] : null;

      if (!buildAll && !tenantId) {
        console.error('❌ Please specify --all or --tenant <ID>');
        process.exit(1);
      }

      const tenantsToB = buildAll
        ? config.tenants.filter(t => t.enabled)
        : config.tenants.filter(t => t.id === tenantId?.toUpperCase());

      if (tenantsToB.length === 0) {
        console.error(`❌ No tenants found${tenantId ? ` matching '${tenantId}'` : ''}`);
        process.exit(1);
      }

      console.log(`\n🚀 Building ${tenantsToB.length} tenant bundle(s)...`);
      const startTime = Date.now();
      const results: BuildResult[] = [];

      for (const tenant of tenantsToB) {
        const result = buildBundle(config, tenant, outputDir);
        results.push(result);
      }

      const totalDuration = Date.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log('\n' + '='.repeat(60));
      console.log('Build Summary');
      console.log('='.repeat(60));
      console.log(`  Total: ${results.length} bundles`);
      console.log(`  ✅ Successful: ${successful}`);
      console.log(`  ❌ Failed: ${failed}`);
      console.log(`  ⏱️  Duration: ${totalDuration}ms`);
      console.log(`  📁 Output: ${outputDir}`);

      // Check max build time
      if (totalDuration / 1000 > config.verification.maxBuildTimeSeconds) {
        console.warn(`\n⚠️ Warning: Build time exceeded ${config.verification.maxBuildTimeSeconds}s limit`);
      }

      if (failed > 0) {
        process.exit(1);
      }
      break;
    }

    case 'verify': {
      const tenantIndex = args.indexOf('--tenant');
      const tenantId = tenantIndex >= 0 ? args[tenantIndex + 1] : null;

      if (!tenantId) {
        console.error('❌ Please specify --tenant <ID>');
        process.exit(1);
      }

      const tenant = config.tenants.find(t => t.id === tenantId.toUpperCase());
      if (!tenant) {
        console.error(`❌ Tenant '${tenantId}' not found`);
        process.exit(1);
      }

      const verified = verifyBundle(config, tenant, outputDir);
      process.exit(verified ? 0 : 1);
    }

    case 'list':
      listTenants(config);
      break;

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
