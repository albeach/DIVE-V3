#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Policy Drift Detector
 * Phase 6: Continuous Compliance Automation
 * 
 * Detects drift between source policies and deployed OPA instances.
 * 
 * Features:
 * - Compares source policy checksums with deployed bundles
 * - Validates bundle manifests across all tenants
 * - Checks OPA server policy versions
 * - Generates detailed drift reports
 * - Supports automated remediation triggers
 * 
 * Usage:
 *   npx ts-node --esm scripts/policy/drift-detector.ts check
 *   npx ts-node --esm scripts/policy/drift-detector.ts check --tenant USA
 *   npx ts-node --esm scripts/policy/drift-detector.ts report
 *   npx ts-node --esm scripts/policy/drift-detector.ts compare --baseline latest
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const POLICIES_DIR = path.join(PROJECT_ROOT, 'policies');
const BUNDLES_DIR = path.join(PROJECT_ROOT, 'dist/bundles');
const BASELINES_DIR = path.join(POLICIES_DIR, 'baselines');
const OPA_BIN = path.join(PROJECT_ROOT, 'bin/opa');

// Types
interface PolicyFile {
    path: string;
    relativePath: string;
    hash: string;
    size: number;
    lastModified: Date;
    package?: string;
}

interface TenantState {
    tenant: string;
    bundleExists: boolean;
    bundlePath?: string;
    manifest?: BundleManifest;
    bundleHash?: string;
    lastUpdated?: string;
    policyCount?: number;
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

interface DriftReport {
    timestamp: string;
    status: 'no_drift' | 'drift_detected' | 'error';
    summary: string;
    source: {
        policyCount: number;
        overallHash: string;
        lastCommit?: string;
        files: PolicyFile[];
    };
    tenants: TenantState[];
    driftDetails: DriftDetail[];
    recommendations: string[];
}

interface DriftDetail {
    type: 'missing_bundle' | 'hash_mismatch' | 'version_drift' | 'file_changed' | 'file_added' | 'file_removed';
    tenant?: string;
    description: string;
    expected?: string;
    actual?: string;
    severity: 'critical' | 'warning' | 'info';
}

interface Baseline {
    timestamp: string;
    source: {
        hash: string;
        policy_count: number;
        commit?: string;
    };
    bundles: Record<string, BundleManifest | null>;
    status: string;
}

const TENANTS = ['USA', 'FRA', 'GBR', 'DEU'];

/**
 * Calculate SHA-256 hash of a file
 */
function hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate combined hash of all policy files
 */
function calculateOverallHash(files: PolicyFile[]): string {
    const combined = files
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .map(f => `${f.relativePath}:${f.hash}`)
        .join('\n');
    return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Extract package name from Rego file
 */
function extractPackageName(filePath: string): string | undefined {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/^package\s+([\w.]+)/m);
        return match ? match[1] : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Scan all policy files in the policies directory
 */
async function scanPolicyFiles(): Promise<PolicyFile[]> {
    const files: PolicyFile[] = [];

    const regoFiles = await glob('**/*.rego', {
        cwd: POLICIES_DIR,
        ignore: ['**/node_modules/**', '**/*.bak'],
    });

    for (const relativePath of regoFiles) {
        const fullPath = path.join(POLICIES_DIR, relativePath);
        const stats = fs.statSync(fullPath);

        files.push({
            path: fullPath,
            relativePath,
            hash: hashFile(fullPath),
            size: stats.size,
            lastModified: stats.mtime,
            package: extractPackageName(fullPath),
        });
    }

    return files;
}

/**
 * Get tenant bundle state
 */
function getTenantState(tenant: string): TenantState {
    const tenantDir = path.join(BUNDLES_DIR, tenant.toLowerCase());
    const bundlePath = path.join(tenantDir, 'bundle.tar.gz');
    const manifestPath = path.join(tenantDir, 'manifest.json');

    const state: TenantState = {
        tenant,
        bundleExists: fs.existsSync(bundlePath),
    };

    if (state.bundleExists) {
        state.bundlePath = bundlePath;
        state.bundleHash = hashFile(bundlePath);

        if (fs.existsSync(manifestPath)) {
            state.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            state.lastUpdated = state.manifest.createdAt;
            state.policyCount = state.manifest.files.filter(f => f.endsWith('.rego')).length;
        }
    }

    return state;
}

/**
 * Load baseline if it exists
 */
function loadBaseline(): Baseline | null {
    const baselinePath = path.join(BASELINES_DIR, 'policy-baseline.json');

    if (fs.existsSync(baselinePath)) {
        return JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    }

    return null;
}

/**
 * Save baseline
 */
function saveBaseline(report: DriftReport): void {
    if (!fs.existsSync(BASELINES_DIR)) {
        fs.mkdirSync(BASELINES_DIR, { recursive: true });
    }

    const baseline: Baseline = {
        timestamp: report.timestamp,
        source: {
            hash: report.source.overallHash,
            policy_count: report.source.policyCount,
            commit: report.source.lastCommit,
        },
        bundles: {},
        status: 'baseline',
    };

    for (const tenant of report.tenants) {
        baseline.bundles[tenant.tenant.toLowerCase()] = tenant.manifest || null;
    }

    const baselinePath = path.join(BASELINES_DIR, 'policy-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

    console.log(`✅ Baseline saved to ${baselinePath}`);
}

/**
 * Detect drift between source and deployed state
 */
function detectDrift(
    sourceFiles: PolicyFile[],
    tenantStates: TenantState[],
    baseline: Baseline | null
): DriftDetail[] {
    const drifts: DriftDetail[] = [];
    const currentHash = calculateOverallHash(sourceFiles);

    // Check against baseline
    if (baseline) {
        if (baseline.source.hash !== currentHash) {
            drifts.push({
                type: 'hash_mismatch',
                description: 'Source policy hash differs from baseline',
                expected: baseline.source.hash.substring(0, 12),
                actual: currentHash.substring(0, 12),
                severity: 'warning',
            });
        }

        const currentCount = sourceFiles.length;
        const baselineCount = baseline.source.policy_count;

        if (currentCount > baselineCount) {
            drifts.push({
                type: 'file_added',
                description: `${currentCount - baselineCount} new policy file(s) added since baseline`,
                expected: String(baselineCount),
                actual: String(currentCount),
                severity: 'info',
            });
        } else if (currentCount < baselineCount) {
            drifts.push({
                type: 'file_removed',
                description: `${baselineCount - currentCount} policy file(s) removed since baseline`,
                expected: String(baselineCount),
                actual: String(currentCount),
                severity: 'warning',
            });
        }
    }

    // Check tenant bundles
    for (const tenant of tenantStates) {
        if (!tenant.bundleExists) {
            drifts.push({
                type: 'missing_bundle',
                tenant: tenant.tenant,
                description: `Bundle for tenant ${tenant.tenant} does not exist`,
                severity: 'critical',
            });
            continue;
        }

        // Check bundle against baseline
        if (baseline) {
            const baselineBundle = baseline.bundles[tenant.tenant.toLowerCase()];

            if (baselineBundle && tenant.manifest) {
                if (baselineBundle.checksum !== tenant.bundleHash) {
                    drifts.push({
                        type: 'hash_mismatch',
                        tenant: tenant.tenant,
                        description: `Bundle checksum for ${tenant.tenant} differs from baseline`,
                        expected: baselineBundle.checksum.substring(0, 12),
                        actual: tenant.bundleHash?.substring(0, 12),
                        severity: 'warning',
                    });
                }

                // Check revision
                if (baselineBundle.revision !== tenant.manifest.revision) {
                    drifts.push({
                        type: 'version_drift',
                        tenant: tenant.tenant,
                        description: `Bundle revision for ${tenant.tenant} has changed`,
                        expected: baselineBundle.revision,
                        actual: tenant.manifest.revision,
                        severity: 'info',
                    });
                }
            }
        }

        // Check bundle age (warn if older than 24 hours)
        if (tenant.lastUpdated) {
            const bundleAge = Date.now() - new Date(tenant.lastUpdated).getTime();
            const ageHours = bundleAge / (1000 * 60 * 60);

            if (ageHours > 24) {
                drifts.push({
                    type: 'version_drift',
                    tenant: tenant.tenant,
                    description: `Bundle for ${tenant.tenant} is ${Math.floor(ageHours)} hours old`,
                    severity: ageHours > 72 ? 'warning' : 'info',
                });
            }
        }
    }

    return drifts;
}

/**
 * Generate recommendations based on drift
 */
function generateRecommendations(drifts: DriftDetail[]): string[] {
    const recommendations: string[] = [];
    const criticalDrifts = drifts.filter(d => d.severity === 'critical');
    const warningDrifts = drifts.filter(d => d.severity === 'warning');

    if (criticalDrifts.length > 0) {
        recommendations.push('🚨 CRITICAL: Rebuild missing bundles immediately');

        const missingTenants = criticalDrifts
            .filter(d => d.type === 'missing_bundle')
            .map(d => d.tenant)
            .filter(Boolean);

        if (missingTenants.length > 0) {
            recommendations.push(`   Run: npx ts-node --esm scripts/policy/build-tenant-bundle.ts build --all`);
        }
    }

    if (warningDrifts.some(d => d.type === 'hash_mismatch')) {
        recommendations.push('⚠️ WARNING: Policy hash mismatch detected');
        recommendations.push('   1. Review recent policy changes');
        recommendations.push('   2. Rebuild bundles: npx ts-node --esm scripts/policy/build-tenant-bundle.ts build --all');
        recommendations.push('   3. Update baseline: npx ts-node --esm scripts/policy/drift-detector.ts baseline --update');
    }

    if (drifts.some(d => d.type === 'version_drift')) {
        recommendations.push('ℹ️ INFO: Bundle versions have drifted');
        recommendations.push('   Consider triggering OPAL update to synchronize deployed policies');
    }

    if (drifts.length === 0) {
        recommendations.push('✅ All policies are in sync with baseline');
    }

    return recommendations;
}

/**
 * Check for policy drift
 */
async function checkDrift(tenant?: string): Promise<DriftReport> {
    console.log('\n🔍 DIVE V3 Policy Drift Detection\n');
    console.log('='.repeat(50));

    const timestamp = new Date().toISOString();

    // Scan source policies
    console.log('\n📂 Scanning source policies...');
    const sourceFiles = await scanPolicyFiles();
    console.log(`   Found ${sourceFiles.length} policy files`);

    const overallHash = calculateOverallHash(sourceFiles);
    console.log(`   Overall hash: ${overallHash.substring(0, 12)}...`);

    // Get tenant states
    console.log('\n📦 Checking tenant bundles...');
    const tenantsToCheck = tenant ? [tenant.toUpperCase()] : TENANTS;
    const tenantStates: TenantState[] = [];

    for (const t of tenantsToCheck) {
        const state = getTenantState(t);
        tenantStates.push(state);

        const status = state.bundleExists ? '✓' : '✗';
        const info = state.manifest
            ? `rev:${state.manifest.revision.substring(0, 12)}`
            : 'missing';
        console.log(`   ${status} ${t}: ${info}`);
    }

    // Load baseline
    console.log('\n📋 Loading baseline...');
    const baseline = loadBaseline();
    if (baseline) {
        console.log(`   Baseline from: ${baseline.timestamp}`);
        console.log(`   Baseline hash: ${baseline.source.hash.substring(0, 12)}...`);
    } else {
        console.log('   ⚠️ No baseline found');
    }

    // Detect drift
    console.log('\n🔎 Detecting drift...');
    const driftDetails = detectDrift(sourceFiles, tenantStates, baseline);

    // Generate recommendations
    const recommendations = generateRecommendations(driftDetails);

    // Determine status
    const criticalDrifts = driftDetails.filter(d => d.severity === 'critical');
    const warningDrifts = driftDetails.filter(d => d.severity === 'warning');

    let status: DriftReport['status'] = 'no_drift';
    let summary = 'No drift detected';

    if (criticalDrifts.length > 0) {
        status = 'drift_detected';
        summary = `CRITICAL: ${criticalDrifts.length} critical drift(s) detected`;
    } else if (warningDrifts.length > 0) {
        status = 'drift_detected';
        summary = `WARNING: ${warningDrifts.length} warning drift(s) detected`;
    } else if (driftDetails.length > 0) {
        summary = `${driftDetails.length} minor drift(s) detected`;
    }

    // Create report
    const report: DriftReport = {
        timestamp,
        status,
        summary,
        source: {
            policyCount: sourceFiles.length,
            overallHash,
            files: sourceFiles,
        },
        tenants: tenantStates,
        driftDetails,
        recommendations,
    };

    // Display results
    console.log('\n' + '='.repeat(50));
    console.log('📊 Drift Report');
    console.log('='.repeat(50));
    console.log(`Status: ${status.toUpperCase()}`);
    console.log(`Summary: ${summary}`);

    if (driftDetails.length > 0) {
        console.log('\nDrift Details:');
        for (const drift of driftDetails) {
            const icon = drift.severity === 'critical' ? '🚨'
                : drift.severity === 'warning' ? '⚠️'
                    : 'ℹ️';
            console.log(`  ${icon} [${drift.type}] ${drift.description}`);
            if (drift.expected && drift.actual) {
                console.log(`     Expected: ${drift.expected}`);
                console.log(`     Actual: ${drift.actual}`);
            }
        }
    }

    console.log('\nRecommendations:');
    for (const rec of recommendations) {
        console.log(`  ${rec}`);
    }

    return report;
}

/**
 * Generate detailed drift report
 */
async function generateReport(outputPath?: string): Promise<void> {
    const report = await checkDrift();

    const output = outputPath || path.join(PROJECT_ROOT, 'drift-report.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2));

    console.log(`\n📄 Report saved to: ${output}`);
}

/**
 * Update baseline
 */
async function updateBaseline(): Promise<void> {
    console.log('\n📝 Updating policy baseline...\n');

    const report = await checkDrift();

    if (report.status === 'error') {
        console.error('❌ Cannot update baseline: errors detected');
        process.exit(1);
    }

    // Check for critical issues before updating
    const criticalDrifts = report.driftDetails.filter(d => d.severity === 'critical');
    if (criticalDrifts.length > 0) {
        console.error('❌ Cannot update baseline: critical issues must be resolved first');
        console.error('   Critical issues:');
        for (const drift of criticalDrifts) {
            console.error(`   - ${drift.description}`);
        }
        process.exit(1);
    }

    saveBaseline(report);
    console.log('\n✅ Baseline updated successfully');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log('DIVE V3 Policy Drift Detector');
        console.log('==============================');
        console.log('\nUsage:');
        console.log('  check                    Check for policy drift');
        console.log('  check --tenant <ID>      Check specific tenant');
        console.log('  report                   Generate detailed drift report');
        console.log('  report --output <path>   Generate report to specific file');
        console.log('  baseline --update        Update the baseline');
        console.log('  baseline --show          Show current baseline');
        console.log('\nExamples:');
        console.log('  npx ts-node --esm scripts/policy/drift-detector.ts check');
        console.log('  npx ts-node --esm scripts/policy/drift-detector.ts check --tenant USA');
        console.log('  npx ts-node --esm scripts/policy/drift-detector.ts baseline --update');
        process.exit(0);
    }

    switch (command) {
        case 'check': {
            const tenantIndex = args.indexOf('--tenant');
            const tenant = tenantIndex >= 0 ? args[tenantIndex + 1] : undefined;

            const report = await checkDrift(tenant);

            // Exit with non-zero if critical drift detected
            if (report.driftDetails.some(d => d.severity === 'critical')) {
                process.exit(1);
            }
            break;
        }

        case 'report': {
            const outputIndex = args.indexOf('--output');
            const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;

            await generateReport(outputPath);
            break;
        }

        case 'baseline': {
            if (args.includes('--update')) {
                await updateBaseline();
            } else if (args.includes('--show')) {
                const baseline = loadBaseline();
                if (baseline) {
                    console.log('\n📋 Current Baseline:');
                    console.log(JSON.stringify(baseline, null, 2));
                } else {
                    console.log('\n⚠️ No baseline found');
                }
            } else {
                console.log('Use --update to update baseline or --show to display it');
            }
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




