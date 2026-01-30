/**
 * ACP-240 SUPP-5(A) AMDT 1 Rewrap Protocol Type Definitions
 * 
 * Implements the spec-compliant /rewrap endpoint request/response structures
 * per ACP-240 dated 08 MAY 2025
 * 
 * Reference: kas/ACP240-KAS.md (50 requirements)
 * Reference: kas/IMPLEMENTATION-HANDOFF.md Phase 1
 */

import { ClassificationLevel } from './kas.types';

// ============================================
// A. Policy Object (embedded in request)
// ============================================

/**
 * Access Control Policy
 * Governs authorization for one or more keyAccessObjects
 */
export interface IPolicy {
    /** Unique policy identifier (client-provided or derived from policy hash) */
    policyId?: string;

    /** Policy body (implementation-specific structure) */
    body?: Record<string, unknown>;

    /** Dissemination controls */
    dissem?: IDisseminationControls;

    /** Additional policy metadata */
    [key: string]: unknown;
}

/**
 * Dissemination Controls (ACP-240 attributes)
 */
export interface IDisseminationControls {
    /** Classification level */
    classification?: ClassificationLevel;

    /** Country releasability (ISO 3166-1 alpha-3) */
    releasabilityTo?: string[];

    /** Communities of Interest */
    COI?: string[];

    /** Creation date for embargo enforcement */
    creationDate?: string;

    /** Additional dissemination attributes */
    [key: string]: unknown;
}

// ============================================
// B. Key Access Object (KAO)
// ============================================

/**
 * Key Access Object
 * Represents encrypted key material bound to a policy
 * 
 * Trace: KAS-REQ-012, KAS-REQ-013
 */
export interface IKeyAccessObject {
    /** Unique identifier (must be unique across entire rewrap request) */
    keyAccessObjectId: string;

    /** Encrypted key material (Base64) */
    wrappedKey: string;

    /** KAS endpoint URL (for federation/brokering) */
    url: string;

    /** Key identifier (selects which KAS private key to use for unwrap) */
    kid: string;

    /** Policy integrity binding (Base64 HMAC-SHA256 of policy using key split) */
    policyBinding: string;

    /** Session identifier (optional, for correlation) */
    sid?: string;

    /** Encrypted metadata (optional, decrypted with key split and returned) */
    encryptedMetadata?: string;

    /** Digital signature over this KAO (excluding signature field) */
    signature: ISignature;

    /** ZTDF metadata fields (optional, for interoperability) */
    type?: string;       // e.g., 'wrapped'
    protocol?: string;   // e.g., 'kas'

    /** Additional KAO fields */
    [key: string]: unknown;
}

/**
 * Digital Signature
 */
export interface ISignature {
    /** Algorithm identifier (e.g., RS256, ES256, PS256) */
    alg: string;

    /** Signature value (Base64) */
    sig: string;
}

// ============================================
// C. Rewrap Request Structure
// ============================================

/**
 * Rewrap Request (POST /rewrap body)
 * 
 * Trace: KAS-REQ-010, KAS-REQ-023
 */
export interface IRewrapRequest {
    /** Client's ephemeral public key (JWK or PEM format) for rewrapping */
    clientPublicKey: string | IJsonWebKey;

    /** Array of policy-grouped request entries */
    requests: IRequestGroup[];
}

/**
 * Request Group
 * Associates one policy with multiple keyAccessObjects
 * 
 * Trace: KAS-REQ-010
 */
export interface IRequestGroup {
    /** Policy governing the keyAccessObjects in this group */
    policy: IPolicy;

    /** Key Access Objects governed by this policy */
    keyAccessObjects: IKeyAccessObject[];
}

/**
 * JSON Web Key (JWK) format for clientPublicKey
 */
export interface IJsonWebKey {
    kty: string;           // Key Type (e.g., RSA, EC)
    use?: string;          // Public Key Use (e.g., enc)
    alg?: string;          // Algorithm (e.g., RSA-OAEP, ECDH-ES+A256KW)
    kid?: string;          // Key ID
    n?: string;            // RSA modulus (Base64url)
    e?: string;            // RSA exponent (Base64url)
    crv?: string;          // EC curve (e.g., P-256)
    x?: string;            // EC x coordinate (Base64url)
    y?: string;            // EC y coordinate (Base64url)
    [key: string]: unknown;
}

// ============================================
// D. Rewrap Response Structure
// ============================================

/**
 * Rewrap Response
 * 
 * Trace: KAS-REQ-090, KAS-REQ-091
 */
export interface IRewrapResponse {
    /** Array of policy-grouped response entries */
    responses: IPolicyGroupResponse[];
}

/**
 * Policy Group Response
 * Groups results for all keyAccessObjects under one policy
 * 
 * Trace: KAS-REQ-090
 */
export interface IPolicyGroupResponse {
    /** Policy identifier (from request or computed) */
    policyId: string;

    /** Per-keyAccessObject results */
    results: IKeyAccessObjectResult[];
}

/**
 * Key Access Object Result
 * Per-KAO outcome (success or error)
 * 
 * Trace: KAS-REQ-091, KAS-REQ-092, KAS-REQ-093
 */
export interface IKeyAccessObjectResult {
    /** Correlation ID from request */
    keyAccessObjectId: string;

    /** Outcome status */
    status: 'success' | 'error';

    /** Rewrapped key material (Base64, present if status=success) */
    kasWrappedKey?: string;

    /** Decrypted metadata (present if encryptedMetadata was provided and status=success) */
    metadata?: Record<string, unknown>;

    /** Error description (present if status=error) */
    error?: string;

    /** Digital signature over this result (signed by processing KAS) */
    signature: ISignature;

    /** Session identifier (copied from request KAO) */
    sid?: string;

    /** Additional result fields */
    [key: string]: unknown;
}

// ============================================
// E. DPoP (Demonstrable Proof-of-Possession)
// ============================================

/**
 * DPoP JWT Header
 * RFC 9449
 */
export interface IDPoPHeader {
    /** Algorithm (must match jwk.alg) */
    alg: string;

    /** Type (must be 'dpop+jwt') */
    typ: 'dpop+jwt';

    /** Client's public key (used to verify DPoP proof signature) */
    jwk: IJsonWebKey;
}

/**
 * DPoP JWT Payload
 * RFC 9449
 */
export interface IDPoPPayload {
    /** JWT ID (must be unique, for replay prevention) */
    jti: string;

    /** HTTP method (must be 'POST' for /rewrap) */
    htm: string;

    /** HTTP target URI (must match /rewrap endpoint URL) */
    htu: string;

    /** Issued at (Unix timestamp) */
    iat: number;

    /** Access token hash (Base64url SHA-256 of access token) */
    ath: string;

    /** Additional claims */
    [key: string]: unknown;
}

// ============================================
// F. Validation Errors
// ============================================

/**
 * Validation Error
 */
export interface IValidationError {
    /** Error code */
    code: string;

    /** Error message */
    message: string;

    /** Field that failed validation */
    field?: string;

    /** Additional context */
    details?: Record<string, unknown>;
}

// ============================================
// G. Internal Processing Types
// ============================================

/**
 * Unwrapped Key Material
 * Internal representation after unwrapping
 */
export interface IUnwrappedKeyMaterial {
    /** Decrypted key split or full DEK */
    keySplit: Buffer;

    /** Algorithm used for unwrapping */
    algorithm: string;

    /** KAS kid used */
    kid: string;
}

/**
 * Policy Binding Verification Result
 */
export interface IPolicyBindingResult {
    /** Verification passed */
    valid: boolean;

    /** Expected binding value (computed) */
    expectedBinding?: string;

    /** Provided binding value (from KAO) */
    providedBinding?: string;

    /** Error message if invalid */
    reason?: string;
}

/**
 * KAO Signature Verification Result
 */
export interface IKAOSignatureResult {
    /** Verification passed */
    valid: boolean;

    /** Trusted public key used for verification */
    publicKeyKid?: string;

    /** Error message if invalid */
    reason?: string;
}

/**
 * Authorization Decision (from OPA)
 */
export interface IAuthorizationDecision {
    /** Authorization allowed */
    allow: boolean;

    /** Decision reason */
    reason: string;

    /** Evaluation details */
    evaluation_details?: Record<string, unknown>;

    /** Policy violations (if any) */
    violations?: string[];
}

/**
 * Key Routing Decision
 */
export interface IKeyRoutingDecision {
    /** Target KAS identifier */
    target: 'local' | string;

    /** KAS instance (for federation) */
    kasInstance?: {
        kasId: string;
        kasUrl: string;
        authMethod: string;
    };
}

// ============================================
// H. Configuration Types
// ============================================

/**
 * Rewrap Protocol Configuration
 */
export interface IRewrapConfig {
    /** Enable /rewrap endpoint */
    enabled: boolean;

    /** Enable DPoP verification */
    dpopEnabled: boolean;

    /** Enable signature verification */
    signatureVerificationEnabled: boolean;

    /** Enable policyBinding verification */
    policyBindingEnabled: boolean;

    /** Supported wrap algorithms */
    supportedWrapAlgorithms: string[];

    /** Supported signing algorithms */
    supportedSigningAlgorithms: string[];

    /** DPoP proof max age (seconds) */
    dpopMaxAge: number;

    /** Policy binding algorithm */
    policyBindingAlgorithm: string;
}

/**
 * Metrics for rewrap operations
 */
export interface IRewrapMetrics {
    /** Total requests */
    requestsTotal: number;

    /** Successful responses */
    successTotal: number;

    /** Failed responses */
    errorTotal: number;

    /** DPoP verification failures */
    dpopFailures: number;

    /** Signature verification failures */
    signatureFailures: number;

    /** PolicyBinding verification failures */
    policyBindingFailures: number;

    /** Authorization denials */
    authzDenials: number;

    /** Latency histogram */
    latencyMs: {
        p50: number;
        p95: number;
        p99: number;
    };
}
