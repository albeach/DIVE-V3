/**
 * Federation Types for ACP-240 /rewrap Protocol
 * 
 * Implements Phase 3.2: Spec-Compliant Forwarding
 * 
 * Reference: kas/IMPLEMENTATION-HANDOFF.md Phase 3.2
 */

import { 
    IRewrapRequest, 
    IRewrapResponse, 
    IPolicy,
    IKeyAccessObject,
    IPolicyGroupResponse,
} from './rewrap.types';

// ============================================
// Federated Rewrap Request
// ============================================

/**
 * Federated Rewrap Request
 * Forwards a subset of KAOs to downstream KAS while preserving policy
 */
export interface IFederatedRewrapRequest extends IRewrapRequest {
    /** Federation metadata */
    federationMetadata?: IFederationMetadata;
}

/**
 * Federation Metadata
 * Tracks origin and routing of federated requests
 */
export interface IFederationMetadata {
    /** Origin KAS that initiated federation */
    originKasId: string;
    
    /** Origin country */
    originCountry: string;
    
    /** Federation request ID (for correlation) */
    federationRequestId: string;
    
    /** Routing trail (list of KAS IDs that forwarded this request) */
    routedVia: string[];
    
    /** Policy translation applied? */
    translationApplied: boolean;
    
    /** Timestamp of original request */
    originTimestamp: string;
}

// ============================================
// Federated Rewrap Response
// ============================================

/**
 * Federated Rewrap Response
 * Response from downstream KAS (same structure as IRewrapResponse)
 */
export interface IFederatedRewrapResponse extends IRewrapResponse {
    /** Federation metadata from response */
    federationMetadata?: IFederationMetadata;
}

// ============================================
// Federation Forwarding Context
// ============================================

/**
 * Federation Forwarding Context
 * Contains all info needed to forward a request to downstream KAS
 */
export interface IFederationForwardContext {
    /** Target KAS ID */
    targetKasId: string;
    
    /** Target KAS URL */
    targetKasUrl: string;
    
    /** Policy for this group */
    policy: IPolicy;
    
    /** KAOs to forward to this KAS */
    kaosToForward: IKeyAccessObject[];
    
    /** Client public key (from original request) */
    clientPublicKey: string | any;
    
    /** Authorization header (JWT) */
    authHeader: string;
    
    /** DPoP header (if present) */
    dpopHeader?: string;
    
    /** Request ID */
    requestId: string;
    
    /** Federation metadata */
    federationMetadata: IFederationMetadata;
}

// ============================================
// Response Aggregation Types
// ============================================

/**
 * Aggregated Response
 * Combines local and federated results
 */
export interface IAggregatedResponse {
    /** Policy ID */
    policyId: string;
    
    /** All results (local + federated) */
    results: any[];
    
    /** Aggregation metadata */
    aggregationMetadata: {
        /** Number of local results */
        localCount: number;
        
        /** Number of federated results */
        federatedCount: number;
        
        /** Number of downstream KAS contacted */
        downstreamKASCount: number;
        
        /** Total aggregation time (ms) */
        aggregationTimeMs: number;
        
        /** Any aggregation errors */
        errors?: string[];
    };
}

// ============================================
// Federation Request Builder
// ============================================

/**
 * Federation Request Builder Result
 */
export interface IFederationRequestBuildResult {
    /** Requests to forward to each downstream KAS */
    forwardRequests: Map<string, IFederationForwardContext>;
    
    /** Local KAOs to process */
    localKAOs: IKeyAccessObject[];
    
    /** Statistics */
    stats: {
        totalKAOs: number;
        localKAOs: number;
        remoteKAOs: number;
        targetKASCount: number;
    };
}

// ============================================
// Federation Error Types
// ============================================

/**
 * Federation Error
 */
export interface IFederationError {
    /** Target KAS ID */
    kasId: string;
    
    /** Error type */
    errorType: 'timeout' | 'circuit_open' | 'auth_failure' | 'network_error' | 'policy_violation' | 'unknown';
    
    /** Error message */
    message: string;
    
    /** Affected KAO IDs */
    affectedKAOIds: string[];
    
    /** Timestamp */
    timestamp: string;
}

/**
 * Federation Result
 * Wraps success or error outcomes for federation requests
 */
export interface IFederationResult {
    /** Success flag */
    success: boolean;
    
    /** Target KAS ID */
    kasId: string;
    
    /** Response (if successful) */
    response?: IFederatedRewrapResponse;
    
    /** Error (if failed) */
    error?: IFederationError;
    
    /** Latency (ms) */
    latencyMs: number;
}

// ============================================
// Federation Configuration
// ============================================

/**
 * Federation Configuration
 */
export interface IFederationConfig {
    /** Enable federation */
    enabled: boolean;
    
    /** Timeout for downstream requests (ms) */
    timeoutMs: number;
    
    /** Max retries for transient failures */
    maxRetries: number;
    
    /** Circuit breaker threshold */
    circuitBreakerThreshold: number;
    
    /** Circuit breaker timeout (ms) */
    circuitBreakerTimeoutMs: number;
    
    /** Enable mTLS for inter-KAS */
    mtlsEnabled: boolean;
    
    /** Forward Authorization header */
    forwardAuthHeader: boolean;
    
    /** Forward DPoP header */
    forwardDPoPHeader: boolean;
    
    /** Add X-Forwarded-By header */
    addForwardedByHeader: boolean;
    
    /** Max federation depth (prevent loops) */
    maxFederationDepth: number;
}
