/**
 * ACP-240 Enhanced Audit Logger
 * 
 * Implements NATO ACP-240 mandatory audit event types:
 * - ENCRYPT: Data sealed/protected
 * - DECRYPT: Data accessed
 * - ACCESS_DENIED: Policy denies access
 * - ACCESS_MODIFIED: Object content or permissions changed
 * - DATA_SHARED: Release outside original COI/domain
 * 
 * Reference: ACP240-llms.txt section 6 (Logging & Auditing)
 */

import { logger } from './logger';

// ============================================
// ACP-240 Audit Event Types
// ============================================

export type ACP240EventType =
    | 'ENCRYPT'          // When data is sealed/protected
    | 'DECRYPT'          // When data is accessed (includes KAS key release)
    | 'ACCESS_DENIED'    // Policy denies access
    | 'ACCESS_MODIFIED'  // Object content or permissions changed
    | 'DATA_SHARED';     // Release outside original COI/domain

// ============================================
// ACP-240 Audit Event Interface
// ============================================

export interface IACP240AuditEvent {
    /** ACP-240 event type */
    eventType: ACP240EventType;

    /** Timestamp (ISO 8601) */
    timestamp: string;

    /** Request ID (correlation) */
    requestId: string;

    /** Subject (user/service uniqueID, not full name per PII minimization) */
    subject: string;

    /** Action performed */
    action: string;

    /** Resource/object identifier */
    resourceId: string;

    /** Outcome (ALLOW/DENY) */
    outcome: 'ALLOW' | 'DENY';

    /** Reason/explanation */
    reason: string;

    /** Subject attributes (for policy correlation) */
    subjectAttributes?: {
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };

    /** Resource attributes (for policy correlation) */
    resourceAttributes?: {
        classification?: string;
        releasabilityTo?: string[];
        COI?: string[];
        encrypted?: boolean;
    };

    /** Policy evaluation details (OPA) */
    policyEvaluation?: {
        allow: boolean;
        reason: string;
        evaluation_details?: Record<string, unknown>;
    };

    /** Additional context */
    context?: {
        sourceIP?: string;
        deviceCompliant?: boolean;
        currentTime?: string;
    };

    /** Latency (milliseconds) */
    latencyMs?: number;
}

// ============================================
// Audit Logging Functions
// ============================================

/**
 * Log ACP-240 audit event
 * Writes to dedicated authz.log file for compliance
 */
export function logACP240Event(event: IACP240AuditEvent): void {
    const authzLogger = logger.child({ service: 'acp240-audit' });

    authzLogger.info('ACP-240 Audit Event', {
        acp240EventType: event.eventType,
        timestamp: event.timestamp,
        requestId: event.requestId,
        subject: event.subject,
        action: event.action,
        resourceId: event.resourceId,
        outcome: event.outcome,
        reason: event.reason,
        subjectAttributes: event.subjectAttributes,
        resourceAttributes: event.resourceAttributes,
        policyEvaluation: event.policyEvaluation,
        context: event.context,
        latencyMs: event.latencyMs
    });
}

/**
 * Log ENCRYPT event (data sealed/protected)
 */
export function logEncryptEvent(params: {
    requestId: string;
    subject: string;
    resourceId: string;
    classification: string;
    reason?: string;
}): void {
    const event: IACP240AuditEvent = {
        eventType: 'ENCRYPT',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        subject: params.subject,
        action: 'encrypt',
        resourceId: params.resourceId,
        outcome: 'ALLOW',
        reason: params.reason || 'Resource encrypted with ZTDF',
        resourceAttributes: {
            classification: params.classification,
            encrypted: true
        }
    };

    logACP240Event(event);
}

/**
 * Log DECRYPT event (data accessed)
 */
export function logDecryptEvent(params: {
    requestId: string;
    subject: string;
    resourceId: string;
    classification: string;
    releasabilityTo: string[];
    subjectAttributes: {
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };
    reason?: string;
    latencyMs?: number;
}): void {
    const event: IACP240AuditEvent = {
        eventType: 'DECRYPT',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        subject: params.subject,
        action: 'decrypt',
        resourceId: params.resourceId,
        outcome: 'ALLOW',
        reason: params.reason || 'Access granted by policy',
        subjectAttributes: params.subjectAttributes,
        resourceAttributes: {
            classification: params.classification,
            releasabilityTo: params.releasabilityTo,
            encrypted: true
        },
        latencyMs: params.latencyMs
    };

    logACP240Event(event);
}

/**
 * Log ACCESS_DENIED event (policy denial)
 */
export function logAccessDeniedEvent(params: {
    requestId: string;
    subject: string;
    resourceId: string;
    reason: string;
    subjectAttributes?: {
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };
    resourceAttributes?: {
        classification?: string;
        releasabilityTo?: string[];
        COI?: string[];
    };
    policyEvaluation?: {
        allow: boolean;
        reason: string;
        evaluation_details?: Record<string, unknown>;
    };
    latencyMs?: number;
}): void {
    const event: IACP240AuditEvent = {
        eventType: 'ACCESS_DENIED',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        subject: params.subject,
        action: 'view',
        resourceId: params.resourceId,
        outcome: 'DENY',
        reason: params.reason,
        subjectAttributes: params.subjectAttributes,
        resourceAttributes: params.resourceAttributes,
        policyEvaluation: params.policyEvaluation,
        latencyMs: params.latencyMs
    };

    logACP240Event(event);
}

/**
 * Log ACCESS_MODIFIED event (object changed)
 */
export function logAccessModifiedEvent(params: {
    requestId: string;
    subject: string;
    resourceId: string;
    action: string;
    reason: string;
    resourceAttributes?: {
        classification?: string;
        releasabilityTo?: string[];
    };
}): void {
    const event: IACP240AuditEvent = {
        eventType: 'ACCESS_MODIFIED',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        subject: params.subject,
        action: params.action,
        resourceId: params.resourceId,
        outcome: 'ALLOW',
        reason: params.reason,
        resourceAttributes: params.resourceAttributes
    };

    logACP240Event(event);
}

/**
 * Log DATA_SHARED event (cross-domain release)
 */
export function logDataSharedEvent(params: {
    requestId: string;
    subject: string;
    resourceId: string;
    sharedWith: string[]; // Countries/domains
    originalReleasability: string[];
    reason: string;
}): void {
    const event: IACP240AuditEvent = {
        eventType: 'DATA_SHARED',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        subject: params.subject,
        action: 'share',
        resourceId: params.resourceId,
        outcome: 'ALLOW',
        reason: `${params.reason} (shared with: ${params.sharedWith.join(', ')})`,
        resourceAttributes: {
            releasabilityTo: params.originalReleasability
        }
    };

    logACP240Event(event);
}

