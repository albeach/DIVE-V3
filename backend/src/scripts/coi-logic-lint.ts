/**
 * COI Logic Lint Migration Script
 * 
 * Audits existing documents for COI coherence violations
 * Identifies and reports invalid COI/releasability combinations
 * 
 * Date: October 21, 2025
 */

import { MongoClient } from 'mongodb';
import { validateCOICoherence } from '../services/coi-validation.service';
// import { logger } from '../utils/logger';  // Commented out - not used in this script

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://admin:password@mongo:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

interface IViolationReport {
    resourceId: string;
    title: string;
    violations: string[];
    warnings: string[];
    securityLabel: {
        classification: string;
        releasabilityTo: string[];
        COI: string[];
        coiOperator?: string;
        caveats?: string[];
    };
}

async function main() {
    console.log('🔍 COI Logic Lint: Auditing Existing Documents');
    console.log('===============================================\n');

    const client = new MongoClient(MONGODB_URL, {
        authSource: 'admin',
        auth: {
            username: 'admin',
            password: 'password'
        },
        serverSelectionTimeoutMS: 5000 // Fail fast if MongoDB not available
    });

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection('resources');

        // Get all resources
        const totalCount = await collection.countDocuments();
        console.log(`📊 Total documents: ${totalCount}\n`);

        const resources = await collection.find({}).toArray();

        const violations: IViolationReport[] = [];
        let validCount = 0;
        let invalidCount = 0;

        console.log('🔍 Validating COI coherence...\n');

        for (const resource of resources) {
            const resourceId = resource.resourceId;
            const title = resource.title || 'Untitled';

            // Extract security label from ZTDF or legacy
            let securityLabel;
            if (resource.ztdf?.policy?.securityLabel) {
                securityLabel = {
                    classification: resource.ztdf.policy.securityLabel.classification,
                    releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                    COI: resource.ztdf.policy.securityLabel.COI || [],
                    coiOperator: resource.ztdf.policy.securityLabel.coiOperator || 'ALL',
                    caveats: resource.ztdf.policy.securityLabel.caveats || []
                };
            } else if (resource.legacy) {
                securityLabel = {
                    classification: resource.legacy.classification,
                    releasabilityTo: resource.legacy.releasabilityTo,
                    COI: resource.legacy.COI || [],
                    coiOperator: resource.legacy.coiOperator || 'ALL',
                    caveats: resource.legacy.caveats || []
                };
            } else {
                console.log(`⚠️  Skipping ${resourceId}: No security label found`);
                continue;
            }

            // Validate COI coherence
            const validation = await validateCOICoherence(securityLabel);

            if (!validation.valid) {
                invalidCount++;
                violations.push({
                    resourceId,
                    title,
                    violations: validation.errors,
                    warnings: validation.warnings,
                    securityLabel
                });

                console.log(`❌ INVALID: ${resourceId}`);
                console.log(`   Title: ${title}`);
                console.log(`   Violations:`);
                validation.errors.forEach((err: string) => console.log(`      - ${err}`));
                console.log('');
            } else {
                validCount++;
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📊 Audit Results:\n');
        console.log(`   Total documents:   ${totalCount}`);
        console.log(`   Valid:             ${validCount} (${((validCount / totalCount) * 100).toFixed(1)}%)`);
        console.log(`   Invalid:           ${invalidCount} (${((invalidCount / totalCount) * 100).toFixed(1)}%)`);
        console.log('');

        if (violations.length > 0) {
            console.log('❌ VIOLATIONS DETECTED:\n');

            // Group violations by type
            const violationTypes = new Map<string, number>();
            for (const v of violations) {
                for (const err of v.violations) {
                    // Extract violation type (first part before colon)
                    const type = err.split(':')[0].trim();
                    violationTypes.set(type, (violationTypes.get(type) || 0) + 1);
                }
            }

            console.log('Violation breakdown:');
            Array.from(violationTypes.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([type, count]) => {
                    console.log(`   ${type}: ${count}`);
                });

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Show first 10 violations in detail
            console.log('📋 Sample Violations (first 10):\n');
            violations.slice(0, 10).forEach((v, idx) => {
                console.log(`${idx + 1}. ${v.resourceId} - ${v.title}`);
                console.log(`   Classification: ${v.securityLabel.classification}`);
                console.log(`   COI: [${v.securityLabel.COI.join(', ')}] (${v.securityLabel.coiOperator || 'ALL'})`);
                console.log(`   REL TO: [${v.securityLabel.releasabilityTo.join(', ')}]`);
                if (v.securityLabel.caveats && v.securityLabel.caveats.length > 0) {
                    console.log(`   Caveats: [${v.securityLabel.caveats.join(', ')}]`);
                }
                console.log('   Violations:');
                v.violations.forEach(err => console.log(`      - ${err}`));
                console.log('');
            });

            // Export violations to JSON
            const violationsFilename = `coi-violations-${Date.now()}.json`;
            const fs = await import('fs');
            fs.writeFileSync(
                violationsFilename,
                JSON.stringify(violations, null, 2)
            );

            console.log(`\n💾 Full violation report saved to: ${violationsFilename}\n`);

            console.log('🔧 Remediation Steps:\n');
            console.log('1. Review violations in the exported JSON file');
            console.log('2. For each violation:');
            console.log('   a. Fix COI/releasability combination');
            console.log('   b. Or delete invalid documents');
            console.log('   c. Or migrate to valid templates');
            console.log('3. Re-seed with fixed script: npm run seed:fixed');
            console.log('4. Re-run this audit to verify: npm run lint:coi');
            console.log('');

        } else {
            console.log('✅ ALL DOCUMENTS PASS COI COHERENCE VALIDATION\n');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Return exit code based on results
        if (invalidCount > 0) {
            process.exit(1);
        }

    } catch (error: any) {
        // Graceful failure if MongoDB not available (CI environment)
        if (error.message?.includes('ECONNREFUSED') || 
            error.message?.includes('EAI_AGAIN') ||
            error.message?.includes('getaddrinfo')) {
            console.warn('⚠️  MongoDB not available - skipping COI lint (likely CI environment)');
            console.log('This is expected in CI without external MongoDB');
            process.exit(0); // Success exit
        }
        
        console.error('❌ Error auditing documents:', error);
        throw error;
    } finally {
        try {
            await client.close();
            console.log('🔌 MongoDB connection closed\n');
        } catch (closeError) {
            // Ignore close errors
        }
    }
}

main();

