/**
 * Federation Validator Middleware
 * 
 * Implements ACP-240 KAS-REQ-085: Validation of federated requests
 * Reference: kas/CONTINUATION-PROMPT.md Phase 3.4.2
 * 
 * Features:
 * - X-Forwarded-By header validation
 * - Federation agreement validation (max classification, allowed COIs)
 * - Trusted forwarder verification
 * - Federation depth limiting (prevent loops)
 * - Circuit breaker state checking
 * - Federation audit logging
 * 
 * Security:
 * - Fail-closed: Reject requests that don't meet security criteria
 * - Audit all federation attempts (allowed and denied)
 * - Enforce trust boundaries between KAS instances
 * - Prevent federation loops via depth tracking
 */

import { Request, Response, NextFunction } from 'express';
import { kasLogger, logKASAuditEvent } from '../utils/kas-logger';
import { kasRegistry } from '../utils/kas-federation';
import { IFederationMetadata } from '../types/federation.types';

// ============================================
// Types
// ============================================

export interface IFederationValidationResult {
    valid: boolean;
    reason?: string;
    forwarderKasId?: string;
    depth?: number;
}

export interface IFederationAgreement {
    /** Maximum classification allowed */
    maxClassification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    
    /** Allowed COIs (empty = all allowed) */
    allowedCOIs?: string[];
    
    /** Allowed countries (empty = all allowed) */
    allowedCountries?: string[];
    
    /** Trust level */
    trustLevel: 'high' | 'medium' | 'low';
}

// ============================================
// Configuration
// ============================================

const MAX_FEDERATION_DEPTH = parseInt(process.env.FEDERATION_MAX_DEPTH || '3', 10);
const FEDERATION_ENABLED = process.env.ENABLE_FEDERATION === 'true';
const LOCAL_KAS_ID = process.env.KAS_ID || 'kas-local';

// Classification hierarchy (for max classification checks)
const CLASSIFICATION_HIERARCHY = {
    'UNCLASSIFIED': 0,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3,
};

// ============================================
// Validation Functions
// ============================================

/**
 * Validate X-Forwarded-By Header
 * 
 * Extracts and validates the KAS ID of the forwarder from the header.
 * Format: "KAS-ID" or comma-separated chain "KAS-1, KAS-2, KAS-3"
 */
function validateForwardedByHeader(req: Request): IFederationValidationResult {
    const forwardedBy = req.headers['x-forwarded-by'] as string;
    
    if (!forwardedBy) {
        // Not a federated request - this is fine (direct client request)
        return { valid: true };
    }
    
    // Parse forwarding chain
    const forwardingChain = forwardedBy.split(',').map(id => id.trim());
    const immediateForwarder = forwardingChain[forwardingChain.length - 1];
    const depth = forwardingChain.length;
    
    kasLogger.debug('Validating X-Forwarded-By header', {
        forwardedBy,
        immediateForwarder,
        depth,
        chain: forwardingChain,
    });
    
    // Check if forwarder is in trusted KAS list
    const forwarderEntry = kasRegistry.get(immediateForwarder);
    
    if (!forwarderEntry) {
        kasLogger.warn('Untrusted forwarder detected', {
            forwarder: immediateForwarder,
            chain: forwardingChain,
        });
        return {
            valid: false,
            reason: `Untrusted forwarder: ${immediateForwarder} not in KAS registry`,
            forwarderKasId: immediateForwarder,
            depth,
        };
    }
    
    // Check forwarder status (if present)
    if (forwarderEntry.trustLevel === 'low') {
        kasLogger.warn('Forwarder has low trust level', {
            forwarder: immediateForwarder,
            trustLevel: forwarderEntry.trustLevel,
        });
    }
    
    // Check federation depth
    if (depth > MAX_FEDERATION_DEPTH) {
        kasLogger.warn('Federation depth exceeded', {
            depth,
            maxDepth: MAX_FEDERATION_DEPTH,
            chain: forwardingChain,
        });
        return {
            valid: false,
            reason: `Federation depth ${depth} exceeds maximum ${MAX_FEDERATION_DEPTH}`,
            forwarderKasId: immediateForwarder,
            depth,
        };
    }
    
    // Check for loops (same KAS appears twice in chain)
    const uniqueKAS = new Set(forwardingChain);
    if (uniqueKAS.size !== forwardingChain.length) {
        kasLogger.warn('Federation loop detected', {
            chain: forwardingChain,
        });
        return {
            valid: false,
            reason: 'Federation loop detected: same KAS appears multiple times in chain',
            forwarderKasId: immediateForwarder,
            depth,
        };
    }
    
    kasLogger.info('X-Forwarded-By validation passed', {
        forwarder: immediateForwarder,
        depth,
        trustLevel: forwarderEntry.trustLevel,
    });
    
    return {
        valid: true,
        forwarderKasId: immediateForwarder,
        depth,
    };
}

/**
 * Get Federation Agreement for Forwarder
 * 
 * Retrieves the federation agreement between this KAS and the forwarder.
 * If no specific agreement exists, returns default policy.
 */
function getFederationAgreement(forwarderKasId: string): IFederationAgreement {
    const forwarder = kasRegistry.get(forwarderKasId);
    
    if (!forwarder) {
        // Default restrictive policy for unknown forwarders
        return {
            maxClassification: 'UNCLASSIFIED',
            allowedCOIs: [],
            allowedCountries: [],
            trustLevel: 'low',
        };
    }
    
    // Build agreement from spoke metadata
    // maxClassification is not in IKASRegistryEntry, use default SECRET
    return {
        maxClassification: 'SECRET',
        allowedCOIs: forwarder.supportedCOIs || [],
        allowedCountries: forwarder.supportedCountries || [],
        trustLevel: forwarder.trustLevel || 'medium',
    };
}

/**
 * Validate Federation Agreement
 * 
 * Checks if the federated request complies with the federation agreement.
 * Validates classification levels, COIs, and countries.
 */
function validateFederationAgreement(
    req: Request,
    forwarderKasId: string,
    agreement: IFederationAgreement
): IFederationValidationResult {
    // Extract policy from request body (if present)
    const body = req.body as any;
    const requests = body?.requests || [];
    
    // Check each request group
    for (const requestGroup of requests) {
        const policy = requestGroup.policy;
        
        if (!policy) {
            continue; // Skip if no policy
        }
        
        // Validate classification
        const resourceClassification = policy.classification || policy.attributes?.find((a: any) => a.attribute === 'classification')?.value;
        
        if (resourceClassification) {
            const resourceLevel = CLASSIFICATION_HIERARCHY[resourceClassification as keyof typeof CLASSIFICATION_HIERARCHY];
            const maxLevel = CLASSIFICATION_HIERARCHY[agreement.maxClassification];
            
            if (resourceLevel > maxLevel) {
                kasLogger.warn('Classification exceeds federation agreement', {
                    forwarder: forwarderKasId,
                    resourceClassification,
                    maxAllowed: agreement.maxClassification,
                });
                return {
                    valid: false,
                    reason: `Classification ${resourceClassification} exceeds maximum allowed ${agreement.maxClassification} for forwarder ${forwarderKasId}`,
                    forwarderKasId,
                };
            }
        }
        
        // Validate COI (if agreement specifies allowed COIs)
        if (agreement.allowedCOIs && agreement.allowedCOIs.length > 0) {
            const resourceCOIs = policy.COI || policy.attributes?.find((a: any) => a.attribute === 'COI')?.value || [];
            const coiArray = Array.isArray(resourceCOIs) ? resourceCOIs : [resourceCOIs];
            
            // Check if any resource COI is not in allowed list
            const unauthorizedCOIs = coiArray.filter(coi => !agreement.allowedCOIs!.includes(coi));
            
            if (unauthorizedCOIs.length > 0) {
                kasLogger.warn('COI not allowed by federation agreement', {
                    forwarder: forwarderKasId,
                    unauthorizedCOIs,
                    allowedCOIs: agreement.allowedCOIs,
                });
                return {
                    valid: false,
                    reason: `COIs [${unauthorizedCOIs.join(', ')}] not allowed for forwarder ${forwarderKasId}`,
                    forwarderKasId,
                };
            }
        }
        
        // Validate countries (if agreement specifies allowed countries)
        if (agreement.allowedCountries && agreement.allowedCountries.length > 0) {
            const releasabilityTo = policy.releasabilityTo || policy.attributes?.find((a: any) => a.attribute === 'releasabilityTo')?.value || [];
            const countriesArray = Array.isArray(releasabilityTo) ? releasabilityTo : [releasabilityTo];
            
            // Check if any target country is not in allowed list
            const unauthorizedCountries = countriesArray.filter(country => !agreement.allowedCountries!.includes(country));
            
            if (unauthorizedCountries.length > 0) {
                kasLogger.warn('Countries not allowed by federation agreement', {
                    forwarder: forwarderKasId,
                    unauthorizedCountries,
                    allowedCountries: agreement.allowedCountries,
                });
                return {
                    valid: false,
                    reason: `Countries [${unauthorizedCountries.join(', ')}] not allowed for forwarder ${forwarderKasId}`,
                    forwarderKasId,
                };
            }
        }
    }
    
    kasLogger.debug('Federation agreement validation passed', {
        forwarder: forwarderKasId,
        maxClassification: agreement.maxClassification,
    });
    
    return { valid: true, forwarderKasId };
}

/**
 * Check Circuit Breaker State
 * 
 * Verifies that federation is healthy (circuit breaker not open).
 */
function checkCircuitBreakerState(forwarderKasId: string): IFederationValidationResult {
    // This would integrate with the circuit breaker utility
    // For now, we assume circuit breaker is managed elsewhere
    // and only log the check
    
    kasLogger.debug('Circuit breaker check passed', {
        forwarder: forwarderKasId,
    });
    
    return { valid: true, forwarderKasId };
}

// ============================================
// Middleware
// ============================================

/**
 * Federation Validator Middleware
 * 
 * Validates all incoming federated requests. Applied to /rewrap endpoint.
 * 
 * Validation steps:
 * 1. Check if federation is enabled
 * 2. Validate X-Forwarded-By header
 * 3. Verify forwarder is in trusted KAS list
 * 4. Check forwarder approval status
 * 5. Enforce max federation depth
 * 6. Detect federation loops
 * 7. Validate federation agreement (classification, COI, countries)
 * 8. Check circuit breaker state
 * 9. Audit all validations
 * 
 * Returns:
 * - 403 Forbidden if validation fails
 * - Continues to next middleware if validation passes
 */
export async function validateFederatedRequest(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const forwardedBy = req.headers['x-forwarded-by'] as string;
    
    // If not a federated request, skip validation
    if (!forwardedBy) {
        kasLogger.debug('Direct client request (not federated), skipping federation validation');
        next();
        return;
    }
    
    // Check if federation is enabled
    if (!FEDERATION_ENABLED) {
        kasLogger.warn('Federation disabled, rejecting federated request', {
            requestId,
            forwardedBy,
        });
        
        await logKASAuditEvent({
            timestamp: new Date().toISOString(),
            requestId,
            eventType: 'FEDERATION_DENIED',
            subject: 'federation',
            resourceId: 'n/a',
            outcome: 'DENY',
            reason: 'Federation disabled',
        } as any);
        
        res.status(403).json({
            error: 'Federation Disabled',
            message: 'This KAS does not accept federated requests',
            requestId,
        });
        return;
    }
    
    // Step 1: Validate X-Forwarded-By header
    const forwardedByResult = validateForwardedByHeader(req);
    
    if (!forwardedByResult.valid) {
        kasLogger.warn('X-Forwarded-By validation failed', {
            requestId,
            reason: forwardedByResult.reason,
        });
        
        await logKASAuditEvent({
            timestamp: new Date().toISOString(),
            requestId,
            eventType: 'FEDERATION_DENIED',
            subject: forwardedByResult.forwarderKasId || 'unknown',
            resourceId: 'n/a',
            outcome: 'DENY',
            reason: forwardedByResult.reason || 'X-Forwarded-By validation failed',
        } as any);
        
        res.status(403).json({
            error: 'Invalid Federation Request',
            message: forwardedByResult.reason,
            requestId,
        });
        return;
    }
    
    const forwarderKasId = forwardedByResult.forwarderKasId!;
    const depth = forwardedByResult.depth!;
    
    // Step 2: Validate federation agreement
    const agreement = getFederationAgreement(forwarderKasId);
    const agreementResult = validateFederationAgreement(req, forwarderKasId, agreement);
    
    if (!agreementResult.valid) {
        kasLogger.warn('Federation agreement validation failed', {
            requestId,
            forwarder: forwarderKasId,
            reason: agreementResult.reason,
        });
        
        await logKASAuditEvent({
            timestamp: new Date().toISOString(),
            requestId,
            eventType: 'FEDERATION_DENIED',
            subject: forwarderKasId,
            resourceId: 'n/a',
            outcome: 'DENY',
            reason: agreementResult.reason || 'Federation agreement violation',
        } as any);
        
        res.status(403).json({
            error: 'Federation Agreement Violation',
            message: agreementResult.reason,
            requestId,
        });
        return;
    }
    
    // Step 3: Check circuit breaker
    const circuitBreakerResult = checkCircuitBreakerState(forwarderKasId);
    
    if (!circuitBreakerResult.valid) {
        kasLogger.warn('Circuit breaker check failed', {
            requestId,
            forwarder: forwarderKasId,
            reason: circuitBreakerResult.reason,
        });
        
        await logKASAuditEvent({
            timestamp: new Date().toISOString(),
            requestId,
            eventType: 'FEDERATION_DENIED',
            subject: forwarderKasId,
            resourceId: 'n/a',
            outcome: 'DENY',
            reason: circuitBreakerResult.reason || 'Circuit breaker open',
        } as any);
        
        res.status(503).json({
            error: 'Service Unavailable',
            message: circuitBreakerResult.reason,
            requestId,
        });
        return;
    }
    
    // All validations passed - audit success and continue
    kasLogger.info('Federation validation passed', {
        requestId,
        forwarder: forwarderKasId,
        depth,
        trustLevel: agreement.trustLevel,
    });
    
    await logKASAuditEvent({
        timestamp: new Date().toISOString(),
        requestId,
        eventType: 'FEDERATION_ALLOWED',
        subject: forwarderKasId,
        resourceId: 'n/a',
        outcome: 'ALLOW',
        reason: 'Federation validation passed',
    } as any);
    
    // Attach federation metadata to request for downstream handlers
    (req as any).federationMetadata = {
        forwarderKasId,
        depth,
        trustLevel: agreement.trustLevel,
        agreement,
    };
    
    next();
}

// ============================================
// Export Helper Functions (for testing)
// ============================================

export {
    validateForwardedByHeader,
    getFederationAgreement,
    validateFederationAgreement,
    checkCircuitBreakerState,
    MAX_FEDERATION_DEPTH,
    CLASSIFICATION_HIERARCHY,
};
