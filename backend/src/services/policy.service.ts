/**
 * Policy Service
 * Week 3.2: OPA Policy Management
 * 
 * Service for exposing OPA Rego policies through REST API (read-only)
 * Provides policy listing, content retrieval, and decision testing
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from '../utils/logger';
import {
    IPolicyMetadata,
    IPolicyContent,
    IOPAInput,
    IOPADecision,
    IPolicyTestResult,
    IPolicyStats
} from '../types/policy.types';

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const POLICY_DIR = path.join(__dirname, '../../../policies');
const TEST_DIR = path.join(POLICY_DIR, 'tests');

/**
 * Get all available policies
 */
export async function listPolicies(): Promise<IPolicyMetadata[]> {
    try {
        const policies: IPolicyMetadata[] = [];

        // Scan policies directory for all .rego files (excluding tests subdirectory)
        if (fs.existsSync(POLICY_DIR)) {
            const files = fs.readdirSync(POLICY_DIR);

            for (const file of files) {
                const filePath = path.join(POLICY_DIR, file);
                const stat = fs.statSync(filePath);

                // Only process .rego files, skip directories
                if (stat.isFile() && file.endsWith('.rego')) {
                    const policyId = file.replace('.rego', '');
                    const metadata = await getPolicyMetadata(policyId, filePath);
                    policies.push(metadata);
                }
            }
        }

        logger.info('Listed policies', { count: policies.length });
        return policies;

    } catch (error) {
        logger.error('Failed to list policies', { error });
        throw error;
    }
}

/**
 * Get policy metadata by ID
 */
async function getPolicyMetadata(
    policyId: string,
    filePath: string
): Promise<IPolicyMetadata> {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);

        // Count rules (lines starting with rule names)
        const ruleMatches = content.match(/^(allow|is_\w+|check_\w+|decision|reason|obligations|evaluation_details)\s+:?=/gm);
        const ruleCount = ruleMatches ? ruleMatches.length : 0;

        // Extract package name
        const packageMatch = content.match(/^package\s+([\w.]+)/m);
        const packageName = packageMatch ? packageMatch[1] : 'unknown';

        // Extract version from comments
        const versionMatch = content.match(/#.*[Vv]ersion:?\s+([\d.]+)/);
        const version = versionMatch ? versionMatch[1] : '1.0';

        // Extract policy name from comments (look for lines like "# Policy Name" or "# Policy:")
        const nameMatch = content.match(/^#\s*([A-Z][A-Za-z\s]+(?:Policy|Authorization))\s*$/m);
        const name = nameMatch ? nameMatch[1].trim() : formatPolicyName(policyId);

        // Extract description from comments (look for multi-line comment blocks)
        const description = extractPolicyDescription(content, policyId);

        // Count test files
        const testCount = await countPolicyTests(policyId);

        return {
            policyId,
            name,
            description,
            version,
            package: packageName,
            ruleCount,
            testCount,
            lastModified: stats.mtime.toISOString(),
            status: 'active',
            filePath
        };

    } catch (error) {
        logger.error('Failed to get policy metadata', { error, policyId });
        throw error;
    }
}

/**
 * Format policy ID into human-readable name
 */
function formatPolicyName(policyId: string): string {
    return policyId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Extract policy description from comments
 */
function extractPolicyDescription(content: string, policyId: string): string {
    // Look for description patterns in comments
    const descriptionPatterns = [
        /^#\s*Enforces?\s+(.+)$/m,
        /^#\s*(.+authorization.+)$/im,
        /^#\s*(.+policy.+)$/im
    ];

    for (const pattern of descriptionPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    // Fallback descriptions based on policy ID
    if (policyId.includes('admin')) {
        return 'Administrative operations authorization for super_admin role';
    } else if (policyId.includes('fuel') || policyId.includes('inventory')) {
        return 'Coalition ICAM authorization with clearance, releasability, COI, embargo, and ZTDF integrity checks';
    }

    return 'Authorization policy for access control decisions';
}

/**
 * Count policy tests
 */
async function countPolicyTests(policyId: string): Promise<number> {
    try {
        let totalTests = 0;

        if (!fs.existsSync(TEST_DIR)) {
            return 0;
        }

        const testFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.rego'));

        for (const testFile of testFiles) {
            const testPath = path.join(TEST_DIR, testFile);
            const content = fs.readFileSync(testPath, 'utf-8');

            // Count test_ rules
            const testMatches = content.match(/^test_\w+/gm);
            if (testMatches) {
                totalTests += testMatches.length;
            }
        }

        return totalTests;

    } catch (error) {
        logger.warn('Failed to count policy tests', { error, policyId });
        return 0;
    }
}

/**
 * Get policy content by ID
 */
export async function getPolicyById(policyId: string): Promise<IPolicyContent> {
    try {
        const mainPolicyPath = path.join(POLICY_DIR, `${policyId}.rego`);

        if (!fs.existsSync(mainPolicyPath)) {
            throw new Error(`Policy ${policyId} not found`);
        }

        const content = fs.readFileSync(mainPolicyPath, 'utf-8');
        const lines = content.split('\n').length;

        // Extract rule names
        const rules = extractRuleNames(content);

        // Get metadata
        const metadata = await getPolicyMetadata(policyId, mainPolicyPath);

        logger.info('Retrieved policy content', { policyId, lines, ruleCount: rules.length });

        return {
            policyId,
            name: metadata.name,
            content,
            syntax: 'rego',
            lines,
            rules,
            metadata: {
                version: metadata.version,
                package: metadata.package,
                testCount: metadata.testCount,
                lastModified: metadata.lastModified
            }
        };

    } catch (error) {
        logger.error('Failed to get policy by ID', { error, policyId });
        throw error;
    }
}

/**
 * Extract rule names from Rego source
 */
function extractRuleNames(content: string): string[] {
    const rules: string[] = [];

    // Match rule definitions (allow, is_*, check_*, decision, etc.)
    const ruleMatches = content.matchAll(/^(\w+)\s+:?=/gm);

    for (const match of ruleMatches) {
        const ruleName = match[1];
        if (ruleName && !rules.includes(ruleName)) {
            rules.push(ruleName);
        }
    }

    // Sort for consistent output
    return rules.sort();
}

/**
 * Test policy decision with custom input
 */
export async function testPolicyDecision(input: IOPAInput): Promise<IPolicyTestResult> {
    const startTime = Date.now();

    try {
        logger.info('Testing policy decision', {
            subject: input.input.subject.uniqueID,
            resourceId: input.input.resource.resourceId,
            operation: input.input.action.operation
        });

        // Call OPA decision endpoint (same as authz middleware)
        const response = await axios.post(
            `${OPA_URL}/v1/data/dive/authorization`,
            input,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );

        // Extract decision from OPA response
        // OPA returns: { result: { decision: { allow, reason, ... } } }
        const decision: IOPADecision = response.data.result?.decision || response.data.result;
        const executionTime = `${Date.now() - startTime}ms`;

        logger.info('Policy decision tested', {
            allow: decision.allow,
            reason: decision.reason,
            executionTime
        });

        return {
            decision,
            executionTime,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        logger.error('Failed to test policy decision', { error });
        throw error;
    }
}

/**
 * Get policy statistics
 */
export async function getPolicyStats(): Promise<IPolicyStats> {
    try {
        const policies = await listPolicies();
        const totalTests = policies.reduce((sum, p) => sum + p.testCount, 0);
        const activeRules = policies.reduce((sum, p) => sum + p.ruleCount, 0);

        return {
            totalPolicies: policies.length,
            activeRules,
            totalTests,
            lastUpdated: new Date().toISOString()
        };

    } catch (error) {
        logger.error('Failed to get policy stats', { error });
        throw error;
    }
}

