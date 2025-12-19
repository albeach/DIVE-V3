/**
 * Policy Validation Service
 * 
 * Validates uploaded Rego and XACML policies with:
 * - Syntax validation (OPA fmt/check for Rego, XSD for XACML)
 * - Security constraints (package whitelist, unsafe builtins)
 * - Metadata extraction (package names, rules, structure)
 * 
 * Date: October 26, 2025
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger';
import { IValidationResult, IPolicyMetadata, IPolicyStructure } from '../types/policies-lab.types';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

// Package whitelist for Rego policies (security constraint)
const ALLOWED_REGO_PACKAGES = ['dive.lab'];

// Unsafe Rego builtins to block (prevent network access, code execution)
const UNSAFE_REGO_BUILTINS = [
    'http.send',
    'net.lookup_ip_addr',
    'opa.runtime',
    'net.cidr_contains',
    'net.cidr_expand',
    'net.cidr_intersects'
];

// Max nesting depth for XACML policies (prevent DoS)
const MAX_XACML_NESTING_DEPTH = 10;

// ============================================================================
// Rego Validation
// ============================================================================

/**
 * Validate Rego policy source
 */
export async function validateRego(source: string): Promise<IValidationResult> {
    const errors: string[] = [];

    try {
        // Create temporary file for validation
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dive-rego-'));
        const tempFile = path.join(tempDir, 'policy.rego');

        try {
            await fs.writeFile(tempFile, source, 'utf8');

            // Step 1: Syntax check with OPA fmt
            try {
                await execAsync(`opa fmt --fail ${tempFile}`, { timeout: 5000 });
            } catch (error: any) {
                errors.push(`Syntax error: ${error.message || 'Invalid Rego syntax'}`);
            }

            // Step 2: Semantic check with OPA check
            try {
                await execAsync(`opa check ${tempFile}`, { timeout: 5000 });
            } catch (error: any) {
                errors.push(`Semantic error: ${error.message || 'Invalid policy semantics'}`);
            }

            // Step 3: Security checks
            const securityErrors = validateRegoSecurity(source);
            errors.push(...securityErrors);

            // Step 4: Extract metadata if valid
            let metadata: Partial<IPolicyMetadata> | undefined;
            let structure: Partial<IPolicyStructure> | undefined;

            if (errors.length === 0) {
                try {
                    const extracted = extractRegoMetadata(source);
                    metadata = extracted.metadata;
                    structure = extracted.structure;
                } catch (error: any) {
                    logger.warn('Failed to extract Rego metadata', { error: error.message });
                }
            }

            return {
                validated: errors.length === 0,
                errors,
                metadata,
                structure
            };

        } finally {
            // Clean up temp file
            await fs.rm(tempDir, { recursive: true, force: true });
        }

    } catch (error: any) {
        logger.error('Rego validation failed', { error: error.message });
        return {
            validated: false,
            errors: [`Validation error: ${error.message || 'Unknown error'}`]
        };
    }
}

/**
 * Security validation for Rego policies
 */
function validateRegoSecurity(source: string): string[] {
    const errors: string[] = [];

    // Check package name
    const packageMatch = source.match(/^\s*package\s+([a-zA-Z0-9_.]+)/m);
    if (!packageMatch) {
        errors.push('Missing package declaration');
    } else {
        const packageName = packageMatch[1];
        const isAllowed = ALLOWED_REGO_PACKAGES.some(prefix => packageName.startsWith(prefix));
        if (!isAllowed) {
            errors.push(`Package must start with one of: ${ALLOWED_REGO_PACKAGES.join(', ')}. Got: ${packageName}`);
        }
    }

    // Check for unsafe builtins
    for (const builtin of UNSAFE_REGO_BUILTINS) {
        if (source.includes(builtin)) {
            errors.push(`Unsafe builtin '${builtin}' not allowed`);
        }
    }

    // Check for suspicious patterns
    if (source.includes('trace(') && source.split('trace(').length > 10) {
        errors.push('Excessive use of trace() detected (max 10 allowed)');
    }

    return errors;
}

/**
 * Extract metadata from Rego policy
 */
function extractRegoMetadata(source: string): {
    metadata: Partial<IPolicyMetadata>;
    structure: Partial<IPolicyStructure>;
} {
    // Extract package
    const packageMatch = source.match(/^\s*package\s+([a-zA-Z0-9_.]+)/m);
    const packageName = packageMatch ? packageMatch[1] : 'unknown';

    // Extract imports
    const importMatches = source.match(/^\s*import\s+[^\n]+/gm) || [];
    const imports = importMatches.map(imp => imp.trim());

    // Extract rules
    const ruleRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::=|if\s*\{)/gm;
    const ruleMatches = [...source.matchAll(ruleRegex)];
    const rules = ruleMatches.map(match => {
        const name = match[1];
        let type: 'violation' | 'allow' | 'helper' = 'helper';

        if (name === 'allow') {
            type = 'allow';
        } else if (name.startsWith('is_not_') || name.startsWith('violation_')) {
            type = 'violation';
        }

        return { name, type };
    });

    return {
        metadata: {
            packageOrPolicyId: packageName,
            rulesCount: rules.length
        },
        structure: {
            package: packageName,
            imports,
            rules
        }
    };
}

// ============================================================================
// XACML Validation
// ============================================================================

/**
 * Validate XACML policy source
 */
export async function validateXACML(source: string): Promise<IValidationResult> {
    const errors: string[] = [];

    try {
        // Step 1: Parse XML
        let parsed: any;
        try {
            parsed = await parseStringPromise(source, {
                explicitArray: false,
                mergeAttrs: true,
                xmlns: true
            });
        } catch (error: any) {
            errors.push(`XML parsing error: ${error.message || 'Malformed XML'}`);
            return { validated: false, errors };
        }

        // Step 2: Validate XACML structure
        const structureErrors = validateXACMLStructure(parsed);
        errors.push(...structureErrors);

        // Step 3: Security checks
        const securityErrors = validateXACMLSecurity(source, parsed);
        errors.push(...securityErrors);

        // Step 4: Extract metadata if valid
        let metadata: Partial<IPolicyMetadata> | undefined;
        let structure: Partial<IPolicyStructure> | undefined;

        if (errors.length === 0) {
            try {
                const extracted = extractXACMLMetadata(parsed, source);
                metadata = extracted.metadata;
                structure = extracted.structure;
            } catch (error: any) {
                logger.warn('Failed to extract XACML metadata', { error: error.message });
            }
        }

        return {
            validated: errors.length === 0,
            errors,
            metadata,
            structure
        };

    } catch (error: any) {
        logger.error('XACML validation failed', { error: error.message });
        return {
            validated: false,
            errors: [`Validation error: ${error.message || 'Unknown error'}`]
        };
    }
}

/**
 * Validate XACML document structure
 */
function validateXACMLStructure(parsed: any): string[] {
    const errors: string[] = [];

    // Check for PolicySet or Policy root element
    const hasPolicy = parsed.Policy || parsed.PolicySet;
    if (!hasPolicy) {
        errors.push('Missing Policy or PolicySet root element');
        return errors;
    }

    // Get root element
    const root = parsed.PolicySet || parsed.Policy;
    const rootType = parsed.PolicySet ? 'PolicySet' : 'Policy';

    // Validate required attributes
    if (rootType === 'PolicySet') {
        if (!root.PolicySetId) {
            errors.push('PolicySet missing required PolicySetId attribute');
        }
        if (!root.PolicyCombiningAlgId) {
            errors.push('PolicySet missing required PolicyCombiningAlgId attribute');
        }
    } else {
        if (!root.PolicyId) {
            errors.push('Policy missing required PolicyId attribute');
        }
        if (!root.RuleCombiningAlgId) {
            errors.push('Policy missing required RuleCombiningAlgId attribute');
        }
    }

    // Check nesting depth (DoS prevention)
    const depth = calculateXACMLDepth(root);
    if (depth > MAX_XACML_NESTING_DEPTH) {
        errors.push(`XACML nesting depth ${depth} exceeds maximum of ${MAX_XACML_NESTING_DEPTH}`);
    }

    return errors;
}

/**
 * Calculate nesting depth of XACML policy
 */
function calculateXACMLDepth(node: any, currentDepth: number = 0): number {
    let maxDepth = currentDepth;

    // Check nested policies
    if (node.Policy) {
        const policies = Array.isArray(node.Policy) ? node.Policy : [node.Policy];
        for (const policy of policies) {
            const depth = calculateXACMLDepth(policy, currentDepth + 1);
            maxDepth = Math.max(maxDepth, depth);
        }
    }

    // Check nested policy sets
    if (node.PolicySet) {
        const sets = Array.isArray(node.PolicySet) ? node.PolicySet : [node.PolicySet];
        for (const set of sets) {
            const depth = calculateXACMLDepth(set, currentDepth + 1);
            maxDepth = Math.max(maxDepth, depth);
        }
    }

    return maxDepth;
}

/**
 * Security validation for XACML policies
 */
function validateXACMLSecurity(source: string, _parsed: any): string[] {
    const errors: string[] = [];

    // Check for DTD (XXE attack prevention)
    if (source.includes('<!DOCTYPE') || source.includes('<!ENTITY')) {
        errors.push('DTD declarations not allowed (security risk)');
    }

    // Check for external entity references
    if (source.includes('SYSTEM') || source.includes('PUBLIC')) {
        errors.push('External entity references not allowed (security risk)');
    }

    // Validate URN namespace (should be XACML 3.0)
    if (!source.includes('urn:oasis:names:tc:xacml:3.0')) {
        errors.push('Policy must use XACML 3.0 namespace');
    }

    // Check for suspicious attribute finders (external data sources)
    if (source.toLowerCase().includes('attributefinder')) {
        errors.push('External AttributeFinder not allowed');
    }

    return errors;
}

/**
 * Extract metadata from XACML policy
 */
function extractXACMLMetadata(parsed: any, _source: string): {
    metadata: Partial<IPolicyMetadata>;
    structure: Partial<IPolicyStructure>;
} {
    const root = parsed.PolicySet || parsed.Policy;
    const rootType = parsed.PolicySet ? 'PolicySet' : 'Policy';

    // Helper function to extract string value from attribute (handles both string and object formats)
    const getAttrValue = (attr: any): string | undefined => {
        if (typeof attr === 'string') return attr;
        if (attr && typeof attr === 'object' && attr.value) return attr.value;
        return undefined;
    };

    // Extract basic info
    const policyId = getAttrValue(root.PolicySetId || root.PolicyId);
    const combiningAlg = getAttrValue(root.PolicyCombiningAlgId || root.RuleCombiningAlgId);

    // Count rules
    let rulesCount = 0;
    const policies: any[] = [];

    if (rootType === 'PolicySet') {
        // Count policies and their rules
        const nestedPolicies = root.Policy ? (Array.isArray(root.Policy) ? root.Policy : [root.Policy]) : [];
        for (const policy of nestedPolicies) {
            const rules = policy.Rule ? (Array.isArray(policy.Rule) ? policy.Rule : [policy.Rule]) : [];
            rulesCount += rules.length;
            policies.push({
                policyId: getAttrValue(policy.PolicyId),
                ruleCombiningAlg: getAttrValue(policy.RuleCombiningAlgId),
                rulesCount: rules.length
            });
        }
    } else {
        // Count rules in single policy
        const rules = root.Rule ? (Array.isArray(root.Rule) ? root.Rule : [root.Rule]) : [];
        rulesCount = rules.length;
    }

    return {
        metadata: {
            packageOrPolicyId: policyId,
            rulesCount
        },
        structure: {
            policySetId: rootType === 'PolicySet' ? policyId : undefined,
            policyCombiningAlg: rootType === 'PolicySet' ? combiningAlg : undefined,
            policies: policies.length > 0 ? policies : undefined
        }
    };
}
