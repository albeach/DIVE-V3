/**
 * Policy Lab TypeScript Types
 * Types for policy uploads, validation, execution, and results
 */

// ============================================================================
// Policy Upload & Metadata
// ============================================================================

export type PolicyType = 'rego' | 'xacml';

export type StandardsLens = '5663' | '240' | 'unified';

export interface IPolicyMetadata {
    name: string;
    description?: string;
    packageOrPolicyId: string;  // "dive.lab.clearance" or "urn:policy:123"
    rulesCount: number;
    standardsLens?: StandardsLens;
    createdAt: string;
    updatedAt: string;
}

export interface IPolicyStructure {
    // For Rego:
    package?: string;
    imports?: string[];
    rules?: Array<{ name: string; type: 'violation' | 'allow' | 'helper' }>;
    // For XACML:
    policySetId?: string;
    policyCombiningAlg?: string;
    policies?: Array<{ policyId: string; ruleCombiningAlg: string; rulesCount: number }>;
}

export interface IPolicyUpload {
    policyId: string;
    ownerId: string;
    type: PolicyType;
    filename: string;
    sizeBytes: number;
    hash: string;  // SHA-256
    validated: boolean;
    validationErrors: string[];
    metadata: IPolicyMetadata;
    structure: IPolicyStructure;
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// Unified ABAC Input
// ============================================================================

export interface IUnifiedSubject {
    uniqueID: string;
    clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    countryOfAffiliation: string;  // ISO 3166-1 alpha-3
    acpCOI?: string[];
    authenticated?: boolean;
    aal?: 'AAL1' | 'AAL2' | 'AAL3';
}

export type ActionType = 'read' | 'write' | 'delete' | 'approve';

export interface IUnifiedResource {
    resourceId: string;
    classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    releasabilityTo: string[];  // ISO 3166-1 alpha-3
    COI?: string[];
    encrypted?: boolean;
    creationDate?: string;
    sensitivity?: 'ROUTINE' | 'SENSITIVE' | 'CRITICAL';
}

export interface IUnifiedContext {
    currentTime: string;  // ISO 8601
    sourceIP?: string;
    requestId: string;
    deviceCompliant?: boolean;
}

export interface IUnifiedInput {
    subject: IUnifiedSubject;
    action: ActionType;
    resource: IUnifiedResource;
    context: IUnifiedContext;
}

// ============================================================================
// Policy Evaluation
// ============================================================================

export type DecisionType = 'ALLOW' | 'DENY' | 'PERMIT' | 'NOT_APPLICABLE' | 'INDETERMINATE';

export type EngineType = 'opa' | 'xacml';

export interface IObligation {
    type: 'LOG_ACCESS' | 'ENCRYPT_RESPONSE' | 'MFA_REQUIRED' | 'WATERMARK' | string;
    params: Record<string, unknown>;
}

export interface IAdvice {
    type: string;
    params: Record<string, unknown>;
}

export interface ITraceEntry {
    rule: string;
    result: boolean;
    reason: string;
}

export interface IEvaluationDetails {
    latency_ms: number;
    policy_version: string;
    trace: ITraceEntry[];
}

export interface INormalizedDecision {
    engine: EngineType;
    decision: DecisionType;
    reason: string;
    obligations: IObligation[];
    advice: IAdvice[];
    evaluation_details: IEvaluationDetails;
    policy_metadata: {
        id: string;
        type: PolicyType;
        packageOrPolicyId: string;
        name: string;
    };
    inputs: {
        unified: IUnifiedInput;
        rego_input: {
            input: {
                subject: IUnifiedSubject;
                action: ActionType;
                resource: IUnifiedResource;
                context: IUnifiedContext;
            };
        };
        xacml_request: string;  // XML string
    };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface IUploadPolicyRequest {
    file: Express.Multer.File;
    metadata: {
        name: string;
        description?: string;
        standardsLens?: StandardsLens;
    };
}

export interface IUploadPolicyResponse {
    policyId: string;
    type: PolicyType;
    filename: string;
    sizeBytes: number;
    validated: boolean;
    validationErrors: string[];
    metadata: IPolicyMetadata;
}

export interface IEvaluatePolicyRequest {
    unified: IUnifiedInput;
}

export interface IEvaluatePolicyResponse extends INormalizedDecision { }

export interface IGetPolicyResponse extends IPolicyUpload { }

// ============================================================================
// Validation Results
// ============================================================================

export interface IValidationResult {
    validated: boolean;
    errors: string[];
    metadata?: Partial<IPolicyMetadata>;
    structure?: Partial<IPolicyStructure>;
}

// ============================================================================
// Policy Lab Events (for logging)
// ============================================================================

export type PolicyLabEventType = 'upload' | 'validate' | 'evaluate' | 'access' | 'delete';

export interface IPolicyLabEvent {
    eventType: PolicyLabEventType;
    uniqueID: string;
    policyId: string;
    policyType?: PolicyType;
    engine?: EngineType;
    decision?: DecisionType;
    latency_ms?: number;
    validated?: boolean;
    sizeBytes?: number;
    action?: 'view' | 'download' | 'delete';
    timestamp: string;
    requestId: string;
}



