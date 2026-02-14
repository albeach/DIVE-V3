#!/usr/bin/env npx tsx
/**
 * Validate Clearance SSOT Consistency
 *
 * Ensures that generated files match the CLEARANCE_EQUIVALENCY_TABLE SSOT.
 * Run during CI or before deployments to catch mapping drift.
 *
 * Checks:
 *   1. Generated OPA JSON matches SSOT (policies/classification_equivalency/data.json)
 *   2. Generated national JSON matches SSOT (scripts/data/national-clearance-mappings.json)
 *   3. Every country has all 5 standard clearance levels
 *   4. No orphan countries in generated files that don't exist in SSOT
 *   5. RESTRICTED rank consistency (must be 1, not 0.5)
 *
 * Usage:
 *   cd backend && npx tsx src/scripts/validate-clearance-ssot.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks failed
 */

import { CLEARANCE_EQUIVALENCY_TABLE } from '../services/clearance-mapper.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STANDARD_LEVELS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'] as const;

const DIVE_TO_NATO: Record<string, string> = {
    UNCLASSIFIED: 'NATO_UNCLASSIFIED',
    RESTRICTED: 'NATO_RESTRICTED',
    CONFIDENTIAL: 'NATO_CONFIDENTIAL',
    SECRET: 'NATO_SECRET',
    TOP_SECRET: 'COSMIC_TOP_SECRET',
};

const ENGLISH_FALLBACK_TERMS: Record<string, string> = {
    UNCLASSIFIED: 'NATO_UNCLASSIFIED',
    RESTRICTED: 'NATO_RESTRICTED',
    CONFIDENTIAL: 'NATO_CONFIDENTIAL',
    SECRET: 'NATO_SECRET',
    TOP_SECRET: 'COSMIC_TOP_SECRET',
    'TOP SECRET': 'COSMIC_TOP_SECRET',
};

const ENGLISH_COUNTRIES = new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'INDUSTRY']);

let failures = 0;

function pass(msg: string) {
    console.log(`  ✓ ${msg}`);
}

function fail(msg: string) {
    console.error(`  ✗ ${msg}`);
    failures++;
}

// ─── Check 1: SSOT Coverage ─────────────────────────────────────────────────

console.log('\n[1/5] SSOT Coverage — all countries have all 5 levels');

const ssotCountries = new Set<string>();
const countryLevels: Record<string, Set<string>> = {};

for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
    for (const country of Object.keys(entry.nationalEquivalents)) {
        ssotCountries.add(country);
        if (!countryLevels[country]) countryLevels[country] = new Set();
        countryLevels[country].add(entry.standardLevel);
    }
}

let coverageOk = true;
for (const country of ssotCountries) {
    const levels = countryLevels[country];
    for (const level of STANDARD_LEVELS) {
        if (!levels.has(level)) {
            fail(`${country} missing level ${level}`);
            coverageOk = false;
        }
    }
}
if (coverageOk) {
    pass(`All ${ssotCountries.size} countries have all 5 standard levels`);
}

// ─── Check 2: OPA JSON Freshness ────────────────────────────────────────────

console.log('\n[2/5] OPA JSON freshness — generated data matches SSOT');

const opaJsonPath = resolve(__dirname, '../../../policies/classification_equivalency/data.json');
try {
    const diskOpa = JSON.parse(readFileSync(opaJsonPath, 'utf-8'));

    // Regenerate in-memory using same logic as generate-opa-clearance-data.ts
    const expectedOpa: Record<string, Record<string, string>> = {};
    for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
        const natoLevel = DIVE_TO_NATO[entry.standardLevel];
        if (!natoLevel) continue;
        for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
            if (country === 'INDUSTRY') continue;
            if (!expectedOpa[country]) expectedOpa[country] = {};
            for (const variant of variants) {
                expectedOpa[country][variant] = natoLevel;
            }
        }
    }
    // Add English fallbacks for non-English countries
    for (const country of Object.keys(expectedOpa)) {
        if (ENGLISH_COUNTRIES.has(country)) continue;
        for (const [term, natoLevel] of Object.entries(ENGLISH_FALLBACK_TERMS)) {
            if (!expectedOpa[country][term]) {
                expectedOpa[country][term] = natoLevel;
            }
        }
    }
    // Add NATO's own terms
    expectedOpa['NATO'] = {
        'NATO UNCLASSIFIED': 'NATO_UNCLASSIFIED',
        'NATO RESTRICTED': 'NATO_RESTRICTED',
        'NATO CONFIDENTIAL': 'NATO_CONFIDENTIAL',
        'NATO SECRET': 'NATO_SECRET',
        'COSMIC TOP SECRET': 'COSMIC_TOP_SECRET',
    };
    // Sort
    const sortedExpected: Record<string, Record<string, string>> = {};
    for (const country of Object.keys(expectedOpa).sort()) {
        sortedExpected[country] = expectedOpa[country];
    }

    const expectedStr = JSON.stringify(sortedExpected, null, 2) + '\n';
    const diskStr = JSON.stringify(diskOpa, null, 2) + '\n';

    if (expectedStr === diskStr) {
        const totalMappings = Object.values(sortedExpected).reduce((sum, m) => sum + Object.keys(m).length, 0);
        pass(`OPA data.json matches SSOT (${Object.keys(sortedExpected).length} countries, ${totalMappings} mappings)`);
    } else {
        fail('OPA data.json is stale — run: cd backend && npx tsx src/scripts/generate-opa-clearance-data.ts');
    }
} catch (e) {
    fail(`Cannot read OPA JSON at ${opaJsonPath}: ${e.message}`);
}

// ─── Check 3: National JSON Freshness ────────────────────────────────────────

console.log('\n[3/5] National JSON freshness — generated data matches SSOT');

const nationalJsonPath = resolve(__dirname, '../../../scripts/data/national-clearance-mappings.json');
try {
    const diskNational = JSON.parse(readFileSync(nationalJsonPath, 'utf-8'));

    // Regenerate in-memory using same logic as generate-national-clearance-json.ts
    const expectedNational: Record<string, Record<string, string>> = {};
    for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
        for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
            if (!expectedNational[country]) expectedNational[country] = {};
            expectedNational[country][entry.standardLevel] = variants[0];
        }
    }
    // Sort
    const sortedNational: Record<string, Record<string, string>> = {};
    for (const country of Object.keys(expectedNational).sort()) {
        sortedNational[country] = expectedNational[country];
    }

    const expectedNatStr = JSON.stringify(sortedNational, null, 2) + '\n';
    const diskNatStr = JSON.stringify(diskNational, null, 2) + '\n';

    if (expectedNatStr === diskNatStr) {
        pass(`National JSON matches SSOT (${Object.keys(sortedNational).length} countries)`);
    } else {
        fail('National JSON is stale — run: cd backend && npx tsx src/scripts/generate-national-clearance-json.ts');
    }
} catch (e) {
    fail(`Cannot read national JSON at ${nationalJsonPath}: ${e.message}`);
}

// ─── Check 4: No Orphan Countries ───────────────────────────────────────────

console.log('\n[4/5] No orphan countries in generated files');

try {
    const diskOpa = JSON.parse(readFileSync(opaJsonPath, 'utf-8'));
    const opaCountries = new Set(Object.keys(diskOpa));
    // NATO is a pseudo-country added by the generator, not in SSOT
    opaCountries.delete('NATO');

    let orphanOk = true;
    for (const country of opaCountries) {
        if (!ssotCountries.has(country)) {
            fail(`OPA JSON has orphan country not in SSOT: ${country}`);
            orphanOk = false;
        }
    }
    if (orphanOk) pass('No orphan countries in OPA JSON');
} catch {
    fail('Could not check OPA JSON for orphans');
}

try {
    const diskNational = JSON.parse(readFileSync(nationalJsonPath, 'utf-8'));
    const natCountries = new Set(Object.keys(diskNational));

    let orphanOk = true;
    for (const country of natCountries) {
        if (!ssotCountries.has(country)) {
            fail(`National JSON has orphan country not in SSOT: ${country}`);
            orphanOk = false;
        }
    }
    if (orphanOk) pass('No orphan countries in national JSON');
} catch {
    fail('Could not check national JSON for orphans');
}

// ─── Check 5: RESTRICTED Rank Consistency ────────────────────────────────────

console.log('\n[5/5] RESTRICTED rank consistency');

// Check clearance-normalization.service.ts CLEARANCE_HIERARCHY
try {
    const { getClearanceLevel, StandardClearance } = require('../services/clearance-normalization.service');
    const restrictedRank = getClearanceLevel(StandardClearance.RESTRICTED);
    if (restrictedRank === 1) {
        pass('clearance-normalization.service RESTRICTED rank = 1');
    } else {
        fail(`clearance-normalization.service RESTRICTED rank = ${restrictedRank} (expected 1)`);
    }

    // Verify full hierarchy ordering
    const ranks = Object.values(StandardClearance).map((level: string) => ({
        level,
        rank: getClearanceLevel(level as any),
    }));
    const ordered = ranks.every((r: any, i: number) => i === 0 || r.rank > ranks[i - 1].rank);
    if (ordered) {
        pass('Clearance hierarchy is strictly ordered');
    } else {
        fail(`Clearance hierarchy is not strictly ordered: ${JSON.stringify(ranks)}`);
    }
} catch (e) {
    fail(`Cannot import clearance-normalization.service: ${e.message}`);
}

// Check OPA classification.rego nato_levels via data.json structure
try {
    const regoPath = resolve(__dirname, '../../../policies/org/nato/classification.rego');
    const regoContent = readFileSync(regoPath, 'utf-8');
    const restrictedMatch = regoContent.match(/"NATO_RESTRICTED":\s*(\d+)/);
    if (restrictedMatch && restrictedMatch[1] === '1') {
        pass('OPA classification.rego NATO_RESTRICTED rank = 1');
    } else {
        fail(`OPA classification.rego NATO_RESTRICTED rank = ${restrictedMatch?.[1] ?? 'not found'} (expected 1)`);
    }
} catch (e) {
    fail(`Cannot read classification.rego: ${e.message}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
    console.log('All clearance SSOT checks passed.');
    process.exit(0);
} else {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
