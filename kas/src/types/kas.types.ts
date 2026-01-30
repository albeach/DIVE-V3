/**
 * KAS (Key Access Service) Type Definitions
 *
 * Implements NATO ACP-240 Key Access Service requirements
 * Reference: ACP240-llms.txt section 5.2 (Hybrid Encryption & Key Management)
 */

// Classification level type (duplicated to avoid cross-project imports)
export type ClassificationLevel =
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'CONFIDENTIAL'
    | 'SECRET'
    | 'TOP_SECRET';

// ============================================
// KAS Request/Response Types
// ============================================

/**
 * KAS Key Request
 * Requester provides proof of identity and resource reference
 */
export interface IKASKeyRequest {
    /** Resource ID (ZTDF object ID) */
    resourceId: string;

    /** KAO ID to unwrap */
    kaoId: string;

    /** Wrapped DEK (plaintext in pilot mode) - CRITICAL for decryption */
    wrappedKey?: string;

    /** JWT bearer token (for identity/attributes) */
    bearerToken: string;

    /** Original user identity when using service account token (Issue B fix) */
    userIdentity?: {
        uniqueID: string;
        clearance: string;
        countryOfAffiliation: string;
        acpCOI?: string[];
        dutyOrg?: string;
        orgUnit?: string;
    };

    /** Request timestamp */
    requestTimestamp: string;

    /** Request ID (for audit trail) */
    requestId: string;

    /** Resource metadata for authorization (passed from backend) */
    resourceMetadata?: {
        classification: ClassificationLevel;
        releasabilityTo: string[];
        COI: string[];
        creationDate?: string;
    };
}

/**
 * KAS Key Response
 * Returns unwrapped DEK if authorized
 */
export interface IKASKeyResponse {
    /** Success indicator */
    success: boolean;

    /** Unwrapped DEK (Base64) if authorized */
    dek?: string;

    /** KAO ID (for confirmation) */
    kaoId?: string;

    /** Error message if denied */
    error?: string;

    /** Denial reason (for audit) */
    denialReason?: string;

    /** OPA decision details (legacy field) */
    authzDecision?: {
        allow: boolean;
        reason: string;
        evaluation_details?: Record<string, unknown>;
    };

    /** Enhanced KAS decision details (Week 3.4.3) */
    kasDecision?: {
        allow: boolean;
        reason: string;
        timestamp: string;
        evaluationDetails?: {
            clearanceCheck: 'PASS' | 'FAIL';
            releasabilityCheck: 'PASS' | 'FAIL';
            coiCheck: 'PASS' | 'FAIL';
            policyBinding: {
                required: {
                    clearance: string;
                    countries: string[];
                    coi: string[];
                };
                provided: {
                    clearance: string;
                    country: string;
                    coi: string[];
                };
            };
        };
    };

    /** Audit event ID (for correlation) */
    auditEventId?: string;

    /** Execution time in milliseconds */
    executionTimeMs?: number;

    /** Response timestamp */
    responseTimestamp: string;
}

// ============================================
// KAS Audit Event Types (ACP-240 Section 6)
// ============================================

export type KASAuditEventType =
    | 'KEY_REQUESTED'      // Key unwrap requested
    | 'KEY_RELEASED'       // Key successfully released (DECRYPT event)
    | 'KEY_DENIED'         // Key release denied (ACCESS_DENIED event)
    | 'KEY_WRAPPED'        // New key wrapped (ENCRYPT event)
    | 'INTEGRITY_FAILURE'  // ZTDF integrity check failed
    | 'POLICY_MISMATCH'    // KAS denied but PDP allowed (security event)
    | 'FEDERATION_ALLOWED' // Federation request allowed (Phase 3.4)
    | 'FEDERATION_DENIED'  // Federation request denied (Phase 3.4)
    | 'FEDERATION_SUCCESS' // Federation request successful (Phase 3.4)
    | 'FEDERATION_FAILURE'; // Federation request failed (Phase 3.4)

/**
 * KAS Audit Event
 * Mandatory logging per ACP-240 section 6
 */
export interface IKASAuditEvent {
    /** Event type */
    eventType: KASAuditEventType;

    /** Timestamp (ISO 8601) */
    timestamp: string;

    /** Request ID (correlation) */
    requestId: string;

    /** Subject (user/service ID) */
    subject: string;

    /** Resource ID */
    resourceId: string;

    /** KAO ID */
    kaoId?: string;

    /** Outcome (ALLOW/DENY) */
    outcome: 'ALLOW' | 'DENY';

    /** Reason/details */
    reason: string;

    /** Subject attributes used in decision */
    subjectAttributes?: {
        clearance?: ClassificationLevel;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };

    /** Resource attributes used in decision */
    resourceAttributes?: {
        classification?: ClassificationLevel;
        releasabilityTo?: string[];
        COI?: string[];
    };

    /** OPA evaluation details */
    opaEvaluation?: Record<string, unknown>;

    /** Latency (milliseconds) */
    latencyMs?: number;
}

// ============================================
// DEK Store (In-Memory Cache)
// ============================================

/**
 * DEK Cache Entry
 * Stores wrapped DEKs for KAO creation
 * NOTE: In production, use HSM for key custody
 */
export interface IDEKCacheEntry {
    /** Resource ID */
    resourceId: string;

    /** DEK (plaintext, Base64) - CRITICAL: Protect in HSM in production */
    dek: string;

    /** KEK ID used to wrap this DEK */
    kekId: string;

    /** Wrapped DEK (Base64) */
    wrappedDEK: string;

    /** Wrapping algorithm */
    wrappingAlgorithm: string;

    /** Creation timestamp */
    createdAt: string;

    /** Expiration timestamp (for cache eviction) */
    expiresAt: string;
}
