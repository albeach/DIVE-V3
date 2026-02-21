#!/usr/bin/env npx tsx
/**
 * Generate OPA classification equivalency data from SSOT
 *
 * Reads the CLEARANCE_EQUIVALENCY_TABLE and produces a JSON file
 * mapping: { COUNTRY: { "NATIONAL_TERM": "NATO_LEVEL", ... }, ... }
 *
 * This data is consumed by:
 *   1. OPA policies (loaded as data.classification_equivalency during opa test)
 *   2. OPAL server (served via /api/opal/classification-equivalency endpoint)
 *
 * The output format matches the structure expected by
 * policies/org/nato/classification.rego's classification_equivalency rule.
 *
 * Usage:
 *   cd backend && npx tsx src/scripts/generate-opa-clearance-data.ts
 *
 * Output:
 *   ../policies/classification_equivalency.json
 */

import { CLEARANCE_EQUIVALENCY_TABLE } from '../services/clearance-mapper.service';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// DIVE standard level → NATO level mapping
const DIVE_TO_NATO: Record<string, string> = {
    UNCLASSIFIED: 'NATO_UNCLASSIFIED',
    RESTRICTED: 'NATO_RESTRICTED',
    CONFIDENTIAL: 'NATO_CONFIDENTIAL',
    SECRET: 'NATO_SECRET',
    TOP_SECRET: 'COSMIC_TOP_SECRET',
};

// English/NATO standard terms to add as fallbacks for non-English countries
const ENGLISH_FALLBACK_TERMS: Record<string, string> = {
    UNCLASSIFIED: 'NATO_UNCLASSIFIED',
    RESTRICTED: 'NATO_RESTRICTED',
    CONFIDENTIAL: 'NATO_CONFIDENTIAL',
    SECRET: 'NATO_SECRET',
    TOP_SECRET: 'COSMIC_TOP_SECRET',
    'TOP SECRET': 'COSMIC_TOP_SECRET',
};

// Countries that already use English natively (no fallback needed)
const ENGLISH_COUNTRIES = new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'INDUSTRY']);

// Build the equivalency map: country → { national_term → NATO_level }
const equivalency: Record<string, Record<string, string>> = {};

for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
    const natoLevel = DIVE_TO_NATO[entry.standardLevel];
    if (!natoLevel) continue;

    for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
        if (country === 'INDUSTRY') continue;
        if (!equivalency[country]) {
            equivalency[country] = {};
        }
        for (const variant of variants) {
            equivalency[country][variant] = natoLevel;
        }
    }
}

// Add English/NATO standard fallback terms for non-English countries
for (const country of Object.keys(equivalency)) {
    if (ENGLISH_COUNTRIES.has(country)) continue;
    for (const [term, natoLevel] of Object.entries(ENGLISH_FALLBACK_TERMS)) {
        if (!equivalency[country][term]) {
            equivalency[country][term] = natoLevel;
        }
    }
}

// Add NATO's own classification terms
equivalency['NATO'] = {
    'NATO UNCLASSIFIED': 'NATO_UNCLASSIFIED',
    'NATO RESTRICTED': 'NATO_RESTRICTED',
    'NATO CONFIDENTIAL': 'NATO_CONFIDENTIAL',
    'NATO SECRET': 'NATO_SECRET',
    'COSMIC TOP SECRET': 'COSMIC_TOP_SECRET',
};

// Sort countries alphabetically for readability
const sorted: Record<string, Record<string, string>> = {};
for (const country of Object.keys(equivalency).sort()) {
    sorted[country] = equivalency[country];
}

const outputPath = resolve(__dirname, '../../../policies/classification_equivalency/data.json');
writeFileSync(outputPath, JSON.stringify(sorted, null, 2) + '\n');

const totalMappings = Object.values(sorted).reduce((sum, m) => sum + Object.keys(m).length, 0);
console.log(`Generated ${outputPath}`);
console.log(`  Countries: ${Object.keys(sorted).length}`);
console.log(`  Total mappings: ${totalMappings}`);
