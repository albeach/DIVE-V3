#!/usr/bin/env npx tsx
/**
 * Generate national clearance mappings JSON from SSOT
 *
 * Reads the CLEARANCE_EQUIVALENCY_TABLE and produces a JSON file
 * mapping: { COUNTRY: { NATO_LEVEL: "display_label" } }
 * where "display_label" is the FIRST entry in nationalEquivalents
 * (the canonical/official term for that country).
 *
 * Usage:
 *   cd backend && npx tsx src/scripts/generate-national-clearance-json.ts
 *
 * Output:
 *   ../scripts/data/national-clearance-mappings.json
 */

import { CLEARANCE_EQUIVALENCY_TABLE } from '../services/clearance-mapper.service';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Build reverse mapping: country → { level → display_label }
const mappings: Record<string, Record<string, string>> = {};

for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
    const level = entry.standardLevel;
    const nationalEquivalents = entry.nationalEquivalents;

    for (const [country, variants] of Object.entries(nationalEquivalents)) {
        if (!mappings[country]) {
            mappings[country] = {};
        }
        // First entry is the canonical display label
        mappings[country][level] = variants[0];
    }
}

// Sort countries alphabetically for readability
const sorted: Record<string, Record<string, string>> = {};
for (const country of Object.keys(mappings).sort()) {
    sorted[country] = mappings[country];
}

const outputPath = resolve(__dirname, '../../../scripts/data/national-clearance-mappings.json');
writeFileSync(outputPath, JSON.stringify(sorted, null, 2) + '\n');

console.log(`Generated ${outputPath}`);
console.log(`  Countries: ${Object.keys(sorted).length}`);
console.log(`  Levels: ${CLEARANCE_EQUIVALENCY_TABLE.length}`);
