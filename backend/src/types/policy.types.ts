/**
 * Policy Management Types
 * Week 3.2: OPA Policy Viewer
 * Enhanced with modular policy hierarchy support
 *
 * Type definitions for exposing OPA Rego policies through REST API
 */

/**
 * Policy layer classification
 */
export type PolicyLayer = 'base' | 'org' | 'tenant' | 'entrypoints' | 'standalone';

/**
 * NATO compliance standards
 */
export type NATOCompliance = 'ACP-240' | 'STANAG 4774' | 'STANAG 4778' | 'STANAG 5636' | 'ADatP-5663';

/**
 * Tenant codes
 */
export type TenantCode = 'USA' | 'FRA' | 'GBR' | 'DEU' | 'CAN' | 'ITA' | 'ESP' | 'POL' | 'NLD';

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
    // New fields for modular architecture
    layer: PolicyLayer;
    imports: string[];  // List of imported packages
    natoCompliance: NATOCompliance[];
    tenant?: TenantCode;
    relativePath: string;  // Path relative to policies directory
}

/**
 * Dependency edge for graph visualization
 */
export interface IDependencyEdge {
    source: string;  // Package name of importing policy
    target: string;  // Package name of imported policy
}

/**
 * Policy bundle version metadata
 */
export interface IPolicyBundleVersion {
    version: string;
    bundleId: string;
    timestamp: string;
    gitCommit?: string;
    modules: string[];
    compliance: NATOCompliance[];
    features: Record<string, boolean>;
}

/**
 * Complete policy hierarchy with dependency graph
 */
export interface IPolicyHierarchy {
    version: IPolicyBundleVersion;
    layers: {
        base: IPolicyMetadata[];
        org: IPolicyMetadata[];
        tenant: IPolicyMetadata[];
        entrypoints: IPolicyMetadata[];
        standalone: IPolicyMetadata[];
    };
    dependencyGraph: IDependencyEdge[];
    stats: {
        totalPolicies: number;
        totalRules: number;
        totalTests: number;
        byLayer: Record<PolicyLayer, number>;
        byTenant: Record<TenantCode | 'none', number>;
    };
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

/**
 * Individual unit test metadata
 */
export interface IUnitTest {
    name: string;           // e.g., "test_current_tenant_from_context"
    description?: string;   // Extracted from comments
    lineNumber: number;     // Line number in source file
    sourceFile: string;     // Path to test file
}

/**
 * Unit test result (after running opa test)
 */
export interface IUnitTestResult {
    name: string;
    passed: boolean;
    duration?: string;      // e.g., "1.234ms"
    error?: string;         // Error message if failed
    location?: string;      // File:line location
}

/**
 * Policy unit tests list response
 */
export interface IPolicyUnitTests {
    policyId: string;
    packageName: string;
    tests: IUnitTest[];
    testFiles: string[];    // List of test file paths
    totalTests: number;
}

/**
 * OPA test run result
 */
export interface IOPATestRunResult {
    policyId: string;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;       // Total execution time
    results: IUnitTestResult[];
    timestamp: string;
}
