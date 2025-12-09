#!/usr/bin/env npx ts-node
/**
 * Policy Decision Baseline Capture
 * Phase 0: Safety Net for Policy Refactoring
 * 
 * This script captures current OPA decision behavior for all test cases,
 * creating a baseline that can be compared against after policy changes.
 * 
 * Usage:
 *   npx ts-node scripts/policy/capture-baseline.ts capture
 *   npx ts-node scripts/policy/capture-baseline.ts compare
 *   npx ts-node scripts/policy/capture-baseline.ts report
 */

import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const BASELINE_DIR = path.join(__dirname, '../../policies/baselines');
const BASELINE_FILE = path.join(BASELINE_DIR, 'decision-baseline.json');

// Test matrix dimensions
const CLEARANCE_LEVELS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
const CLASSIFICATIONS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
const COUNTRIES = ['USA', 'FRA', 'GBR', 'DEU', 'CAN'];
const COI_COMBINATIONS = [
  [],
  ['NATO'],
  ['FVEY'],
  ['NATO', 'FVEY'],
  ['US-ONLY'],
  ['CAN-US'],
];
const OPERATIONS = ['view', 'upload', 'delete'];

interface TestCase {
  id: string;
  input: OPAInput;
  expectedAllow?: boolean;
  description: string;
}

interface OPAInput {
  input: {
    subject: {
      authenticated: boolean;
      uniqueID: string;
      clearance: string;
      countryOfAffiliation: string;
      acpCOI: string[];
    };
    action: {
      operation: string;
    };
    resource: {
      resourceId: string;
      classification: string;
      releasabilityTo: string[];
      COI: string[];
      coiOperator?: string;
      creationDate?: string;
      encrypted?: boolean;
    };
    context: {
      currentTime: string;
      sourceIP: string;
      deviceCompliant: boolean;
      requestId: string;
      acr?: string;
      amr?: string[];
    };
  };
}

interface BaselineEntry {
  id: string;
  inputHash: string;
  decision: boolean;
  reason: string;
  timestamp: string;
  opaVersion?: string;
  policyVersion?: string;
}

interface BaselineReport {
  version: string;
  capturedAt: string;
  totalCases: number;
  allowCount: number;
  denyCount: number;
  entries: BaselineEntry[];
}

/**
 * Generate hash of input for comparison
 */
function hashInput(input: OPAInput): string {
  const normalized = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate comprehensive test cases
 */
function generateTestCases(): TestCase[] {
  const cases: TestCase[] = [];
  let caseId = 0;

  // Matrix tests: clearance × classification × country × COI
  for (const clearance of CLEARANCE_LEVELS) {
    for (const classification of CLASSIFICATIONS) {
      for (const country of COUNTRIES) {
        for (const userCOI of COI_COMBINATIONS) {
          for (const resourceCOI of COI_COMBINATIONS) {
            // Skip redundant combinations
            if (resourceCOI.includes('US-ONLY') && country !== 'USA') {
              // US-ONLY resource, non-US user - should always deny
            }
            
            const releasabilityTo = generateReleasability(country, resourceCOI);
            
            cases.push({
              id: `matrix-${++caseId}`,
              description: `${clearance} user from ${country} accessing ${classification} resource (COI: ${resourceCOI.join(',')||'none'})`,
              input: createOPAInput({
                clearance,
                classification,
                country,
                userCOI,
                resourceCOI,
                releasabilityTo,
              }),
            });
          }
        }
      }
    }
  }

  // Edge cases
  cases.push(...generateEdgeCases(caseId));

  // Federation-specific cases
  cases.push(...generateFederationCases(caseId + 100));

  // AAL/MFA cases
  cases.push(...generateAALCases(caseId + 200));

  return cases;
}

/**
 * Generate releasability based on COI
 */
function generateReleasability(userCountry: string, resourceCOI: string[]): string[] {
  if (resourceCOI.includes('US-ONLY')) {
    return ['USA'];
  }
  if (resourceCOI.includes('FVEY')) {
    return ['USA', 'GBR', 'CAN', 'AUS', 'NZL'];
  }
  if (resourceCOI.includes('NATO')) {
    return ['USA', 'FRA', 'GBR', 'DEU', 'CAN', 'ITA', 'ESP', 'POL', 'NLD'];
  }
  // Default: releasable to user's country
  return [userCountry];
}

/**
 * Create OPA input from test parameters
 */
function createOPAInput(params: {
  clearance: string;
  classification: string;
  country: string;
  userCOI: string[];
  resourceCOI: string[];
  releasabilityTo: string[];
  operation?: string;
  acr?: string;
  amr?: string[];
}): OPAInput {
  return {
    input: {
      subject: {
        authenticated: true,
        uniqueID: `test-user-${params.country.toLowerCase()}`,
        clearance: params.clearance,
        countryOfAffiliation: params.country,
        acpCOI: params.userCOI,
      },
      action: {
        operation: params.operation || 'view',
      },
      resource: {
        resourceId: `test-resource-${Date.now()}`,
        classification: params.classification,
        releasabilityTo: params.releasabilityTo,
        COI: params.resourceCOI,
        coiOperator: 'ALL',
        encrypted: false,
      },
      context: {
        currentTime: new Date().toISOString(),
        sourceIP: '127.0.0.1',
        deviceCompliant: true,
        requestId: `baseline-${Date.now()}`,
        acr: params.acr,
        amr: params.amr,
      },
    },
  };
}

/**
 * Generate edge cases
 */
function generateEdgeCases(startId: number): TestCase[] {
  let id = startId;
  return [
    {
      id: `edge-${++id}`,
      description: 'Unauthenticated user',
      input: {
        input: {
          subject: {
            authenticated: false,
            uniqueID: '',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: [],
          },
          action: { operation: 'view' },
          resource: {
            resourceId: 'test-edge-1',
            classification: 'UNCLASSIFIED',
            releasabilityTo: ['USA'],
            COI: [],
          },
          context: {
            currentTime: new Date().toISOString(),
            sourceIP: '127.0.0.1',
            deviceCompliant: true,
            requestId: `edge-${id}`,
          },
        },
      },
    },
    {
      id: `edge-${++id}`,
      description: 'Empty releasabilityTo (deny all)',
      input: createOPAInput({
        clearance: 'TOP_SECRET',
        classification: 'UNCLASSIFIED',
        country: 'USA',
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: [], // Empty = deny all
      }),
    },
    {
      id: `edge-${++id}`,
      description: 'Missing clearance attribute',
      input: {
        input: {
          subject: {
            authenticated: true,
            uniqueID: 'test-missing-clearance',
            clearance: '', // Empty
            countryOfAffiliation: 'USA',
            acpCOI: [],
          },
          action: { operation: 'view' },
          resource: {
            resourceId: 'test-edge-missing',
            classification: 'UNCLASSIFIED',
            releasabilityTo: ['USA'],
            COI: [],
          },
          context: {
            currentTime: new Date().toISOString(),
            sourceIP: '127.0.0.1',
            deviceCompliant: true,
            requestId: `edge-${id}`,
          },
        },
      },
    },
    {
      id: `edge-${++id}`,
      description: 'Invalid country code',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'SECRET',
        country: 'XX', // Invalid
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: ['USA'],
      }),
    },
    {
      id: `edge-${++id}`,
      description: 'Resource under embargo (future date)',
      input: {
        input: {
          subject: {
            authenticated: true,
            uniqueID: 'test-embargo',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: [],
          },
          action: { operation: 'view' },
          resource: {
            resourceId: 'test-embargo-resource',
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: [],
            creationDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          },
          context: {
            currentTime: new Date().toISOString(),
            sourceIP: '127.0.0.1',
            deviceCompliant: true,
            requestId: `edge-${id}`,
          },
        },
      },
    },
  ];
}

/**
 * Generate federation-specific cases
 */
function generateFederationCases(startId: number): TestCase[] {
  let id = startId;
  return [
    {
      id: `fed-${++id}`,
      description: 'Cross-border access: FRA user to USA resource',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'SECRET',
        country: 'FRA',
        userCOI: ['NATO'],
        resourceCOI: ['NATO'],
        releasabilityTo: ['USA', 'FRA', 'GBR'],
      }),
    },
    {
      id: `fed-${++id}`,
      description: 'Cross-border denied: FRA user to US-ONLY resource',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'SECRET',
        country: 'FRA',
        userCOI: ['NATO'],
        resourceCOI: ['US-ONLY'],
        releasabilityTo: ['USA'],
      }),
    },
    {
      id: `fed-${++id}`,
      description: 'FVEY access: CAN user to FVEY resource',
      input: createOPAInput({
        clearance: 'TOP_SECRET',
        classification: 'TOP_SECRET',
        country: 'CAN',
        userCOI: ['FVEY'],
        resourceCOI: ['FVEY'],
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
      }),
    },
  ];
}

/**
 * Generate AAL/MFA cases
 */
function generateAALCases(startId: number): TestCase[] {
  let id = startId;
  return [
    {
      id: `aal-${++id}`,
      description: 'AAL1 accessing UNCLASSIFIED (should allow)',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'UNCLASSIFIED',
        country: 'USA',
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: ['USA'],
        acr: '0', // AAL1
        amr: ['pwd'],
      }),
    },
    {
      id: `aal-${++id}`,
      description: 'AAL1 accessing SECRET (should deny if AAL enforcement on)',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'SECRET',
        country: 'USA',
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: ['USA'],
        acr: '0', // AAL1
        amr: ['pwd'],
      }),
    },
    {
      id: `aal-${++id}`,
      description: 'AAL2 accessing SECRET (should allow)',
      input: createOPAInput({
        clearance: 'SECRET',
        classification: 'SECRET',
        country: 'USA',
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: ['USA'],
        acr: '1', // AAL2
        amr: ['pwd', 'otp'],
      }),
    },
    {
      id: `aal-${++id}`,
      description: 'AAL3 accessing TOP_SECRET (should allow)',
      input: createOPAInput({
        clearance: 'TOP_SECRET',
        classification: 'TOP_SECRET',
        country: 'USA',
        userCOI: [],
        resourceCOI: [],
        releasabilityTo: ['USA'],
        acr: '2', // AAL3
        amr: ['pwd', 'hwk'],
      }),
    },
  ];
}

/**
 * Call OPA for authorization decision
 */
async function callOPA(input: OPAInput): Promise<{ allow: boolean; reason: string }> {
  try {
    const response = await axios.post(
      `${OPA_URL}/v1/data/dive/authorization`,
      input,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );

    const decision = response.data.result?.decision || response.data.result;
    return {
      allow: decision?.allow ?? false,
      reason: decision?.reason ?? 'No decision returned',
    };
  } catch (error) {
    console.error(`OPA call failed: ${error}`);
    return {
      allow: false,
      reason: `OPA error: ${error}`,
    };
  }
}

/**
 * Capture baseline for all test cases
 */
async function captureBaseline(): Promise<void> {
  console.log('🔍 Generating test cases...');
  const testCases = generateTestCases();
  console.log(`📋 Generated ${testCases.length} test cases`);

  // Ensure baseline directory exists
  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }

  const entries: BaselineEntry[] = [];
  let allowCount = 0;
  let denyCount = 0;

  console.log('📊 Capturing baseline decisions...');
  const startTime = Date.now();

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const decision = await callOPA(testCase.input);
    
    if (decision.allow) {
      allowCount++;
    } else {
      denyCount++;
    }

    entries.push({
      id: testCase.id,
      inputHash: hashInput(testCase.input),
      decision: decision.allow,
      reason: decision.reason,
      timestamp: new Date().toISOString(),
    });

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Progress: ${i + 1}/${testCases.length} (${Math.round((i + 1) / testCases.length * 100)}%)`);
    }
  }

  console.log('\n');

  const report: BaselineReport = {
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    totalCases: testCases.length,
    allowCount,
    denyCount,
    entries,
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(report, null, 2));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Baseline captured successfully!`);
  console.log(`   📁 File: ${BASELINE_FILE}`);
  console.log(`   📊 Total: ${testCases.length} cases`);
  console.log(`   ✅ Allow: ${allowCount} (${Math.round(allowCount / testCases.length * 100)}%)`);
  console.log(`   ❌ Deny: ${denyCount} (${Math.round(denyCount / testCases.length * 100)}%)`);
  console.log(`   ⏱️  Duration: ${duration}s`);
}

/**
 * Compare current decisions against baseline
 */
async function compareBaseline(): Promise<void> {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('❌ No baseline found. Run "capture" first.');
    process.exit(1);
  }

  const baseline: BaselineReport = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  console.log(`📋 Loaded baseline: ${baseline.totalCases} cases from ${baseline.capturedAt}`);

  const testCases = generateTestCases();
  const regressions: { id: string; expected: boolean; actual: boolean; reason: string }[] = [];
  const improvements: { id: string; expected: boolean; actual: boolean; reason: string }[] = [];

  console.log('🔄 Comparing against current policy...');

  for (const testCase of testCases) {
    const hash = hashInput(testCase.input);
    const baselineEntry = baseline.entries.find(e => e.inputHash === hash);
    
    if (!baselineEntry) {
      console.warn(`⚠️ New test case not in baseline: ${testCase.id}`);
      continue;
    }

    const decision = await callOPA(testCase.input);

    if (decision.allow !== baselineEntry.decision) {
      if (baselineEntry.decision && !decision.allow) {
        // Was allow, now deny = regression
        regressions.push({
          id: testCase.id,
          expected: baselineEntry.decision,
          actual: decision.allow,
          reason: decision.reason,
        });
      } else {
        // Was deny, now allow = potential improvement (but verify!)
        improvements.push({
          id: testCase.id,
          expected: baselineEntry.decision,
          actual: decision.allow,
          reason: decision.reason,
        });
      }
    }
  }

  console.log('\n📊 Comparison Results:');
  console.log(`   Total cases: ${testCases.length}`);
  console.log(`   Regressions: ${regressions.length}`);
  console.log(`   Improvements: ${improvements.length}`);

  if (regressions.length > 0) {
    console.log('\n❌ REGRESSIONS DETECTED:');
    for (const reg of regressions.slice(0, 10)) {
      console.log(`   - ${reg.id}: expected ALLOW, got DENY (${reg.reason})`);
    }
    if (regressions.length > 10) {
      console.log(`   ... and ${regressions.length - 10} more`);
    }

    // Write regression report
    const regressionFile = path.join(BASELINE_DIR, 'regressions.json');
    fs.writeFileSync(regressionFile, JSON.stringify(regressions, null, 2));
    console.log(`\n📁 Full regression report: ${regressionFile}`);

    process.exit(1);
  }

  if (improvements.length > 0) {
    console.log('\n⚠️ CHANGES DETECTED (verify these are intentional):');
    for (const imp of improvements.slice(0, 10)) {
      console.log(`   - ${imp.id}: was DENY, now ALLOW (${imp.reason})`);
    }
  }

  console.log('\n✅ No regressions detected!');
}

/**
 * Generate baseline report
 */
function generateReport(): void {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('❌ No baseline found. Run "capture" first.');
    process.exit(1);
  }

  const baseline: BaselineReport = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));

  console.log('\n📊 Baseline Report');
  console.log('==================');
  console.log(`Version: ${baseline.version}`);
  console.log(`Captured: ${baseline.capturedAt}`);
  console.log(`Total Cases: ${baseline.totalCases}`);
  console.log(`Allow: ${baseline.allowCount} (${Math.round(baseline.allowCount / baseline.totalCases * 100)}%)`);
  console.log(`Deny: ${baseline.denyCount} (${Math.round(baseline.denyCount / baseline.totalCases * 100)}%)`);

  // Breakdown by category
  const byCategory: Record<string, { allow: number; deny: number }> = {};
  for (const entry of baseline.entries) {
    const category = entry.id.split('-')[0];
    if (!byCategory[category]) {
      byCategory[category] = { allow: 0, deny: 0 };
    }
    if (entry.decision) {
      byCategory[category].allow++;
    } else {
      byCategory[category].deny++;
    }
  }

  console.log('\nBreakdown by Category:');
  for (const [category, stats] of Object.entries(byCategory)) {
    const total = stats.allow + stats.deny;
    const allowRate = Math.round(stats.allow / total * 100);
    console.log(`  ${category}: ${stats.allow}/${total} allow (${allowRate}%)`);
  }
}

// Main entry point
const command = process.argv[2];

switch (command) {
  case 'capture':
    captureBaseline().catch(console.error);
    break;
  case 'compare':
    compareBaseline().catch(console.error);
    break;
  case 'report':
    generateReport();
    break;
  default:
    console.log('Usage: npx ts-node scripts/policy/capture-baseline.ts <capture|compare|report>');
    process.exit(1);
}








