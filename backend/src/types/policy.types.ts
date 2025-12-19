/**
 * Policy Management Types
 * Week 3.2: OPA Policy Viewer
 * 
 * Type definitions for exposing OPA Rego policies through REST API
 */

/**
 * Policy metadata (list view)
 */
export interface IPolicyMetadata {
    policyId: string;
    name: string;
    description: string;
    version: string;
    package: string;
    ruleCount: number;
    testCount: number;
    lastModified: string; // ISO 8601 timestamp
    status: 'active' | 'draft' | 'deprecated';
    filePath: string;
}

/**
 * Policy content (full source code)
 */
export interface IPolicyContent {
    policyId: string;
    name: string;
    content: string; // Full Rego source code
    syntax: 'rego';
    lines: number;
    rules: string[]; // List of rule names (allow, is_not_authenticated, etc.)
    metadata: {
        version: string;
        package: string;
        testCount: number;
        lastModified: string;
    };
}

/**
 * OPA input for testing policy decisions
 */
export interface IOPAInput {
    input: {
        subject: {
            authenticated: boolean;
            uniqueID: string;
            clearance: string;
            countryOfAffiliation: string;
            acpCOI?: string[];
        };
        action: {
            operation: string;
        };
        resource: {
            resourceId: string;
            classification: string;
            releasabilityTo: string[];
            COI?: string[];
            creationDate?: string;
            encrypted: boolean;
            ztdf?: {
                integrityValidated?: boolean;
                policyHash?: string;
                payloadHash?: string;
            };
        };
        context: {
            currentTime: string;
            sourceIP: string;
            deviceCompliant: boolean;
            requestId: string;
        };
    };
}

/**
 * OPA decision response
 */
export interface IOPADecision {
    allow: boolean;
    reason: string;
    obligations: IObligation[];
    evaluation_details: {
        checks: {
            authenticated: boolean;
            required_attributes: boolean;
            clearance_sufficient: boolean;
            country_releasable: boolean;
            coi_satisfied: boolean;
            embargo_passed: boolean;
            ztdf_integrity_valid: boolean;
        };
        subject: {
            uniqueID: string;
            clearance: string;
            country: string;
        };
        resource: {
            resourceId: string;
            classification: string;
            encrypted: boolean;
            ztdfEnabled: boolean;
        };
        acp240_compliance: {
            ztdf_validation: boolean;
            kas_obligations: boolean;
            fail_closed_enforcement: boolean;
        };
    };
}

/**
 * KAS obligation
 */
export interface IObligation {
    type: string;
    action: string;
    resourceId: string;
    kaoId?: string;
    kasEndpoint?: string;
    reason: string;
    policyContext?: {
        clearanceRequired: string;
        countriesAllowed: string[];
        coiRequired: string[];
    };
}

/**
 * Policy test result
 */
export interface IPolicyTestResult {
    decision: IOPADecision;
    executionTime: string; // e.g., "45ms"
    timestamp: string;
}

/**
 * Policy statistics
 */
export interface IPolicyStats {
    totalPolicies: number;
    activeRules: number;
    totalTests: number;
    lastUpdated: string;
}
