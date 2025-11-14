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
import { MongoClient, Db } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from './mongodb-config';

const LOGS_COLLECTION = 'audit_logs';

// MongoDB client (singleton)
let mongoClient: MongoClient | null = null;
let db: Db | null = null;

/**
 * Initialize MongoDB connection for audit logging
 * BEST PRACTICE: Read MongoDB URL at runtime (after globalSetup configures it)
 */
async function initMongoDB(): Promise<void> {
    if (mongoClient && db) {
        return;
    }

    try {
        const MONGODB_URL = getMongoDBUrl(); // Read at runtime
        const DB_NAME = getMongoDBName();
        
        mongoClient = new MongoClient(MONGODB_URL);
        await mongoClient.connect();
        db = mongoClient.db(DB_NAME);
        logger.debug('ACP-240 logger: Connected to MongoDB for audit persistence');
    } catch (error) {
        logger.error('ACP-240 logger: Failed to connect to MongoDB', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Don't throw - allow file logging to continue even if MongoDB fails
    }
}

/**
 * Write audit event to MongoDB
 */
async function writeToMongoDB(event: IACP240AuditEvent): Promise<void> {
    try {
        await initMongoDB();

        if (!db) {
            logger.warn('MongoDB not available for audit logging - event written to file only');
            return;
        }

        const collection = db.collection(LOGS_COLLECTION);

        // Insert the event with all fields
        await collection.insertOne({
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
            latencyMs: event.latencyMs,
            _createdAt: new Date() // MongoDB timestamp for indexing
        });
    } catch (error) {
        // Log error but don't throw - file logging should still work
        logger.error('Failed to write audit event to MongoDB', {
            error: error instanceof Error ? error.message : 'Unknown error',
            eventType: event.eventType,
            requestId: event.requestId
        });
    }
}

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
        // AAL2/FAL2 attributes (NIST SP 800-63B/C)
        acr?: string;        // Authentication Context Class Reference
        amr?: string[];      // Authentication Methods Reference
        auth_time?: number;  // Time of authentication
        aal_level?: string;  // Derived AAL level (AAL1/AAL2/AAL3)
        // ADatP-5663 specific fields
        issuer?: string;     // IdP URL (§4.4)
        token_id?: string;   // JWT ID (jti claim) for revocation tracking
        token_lifetime?: number;  // Time since authentication (currentTime - auth_time)
    };

    /** Resource attributes (for policy correlation) */
    resourceAttributes?: {
        classification?: string;
        releasabilityTo?: string[];
        COI?: string[];
        encrypted?: boolean;
        // ACP-240 specific fields
        ztdf_integrity?: 'valid' | 'invalid' | 'not_checked';  // STANAG 4778 signature status
        original_classification?: string;  // National classification (e.g., "GEHEIM")
        original_country?: string;         // ISO 3166-1 alpha-3 (e.g., "DEU")
        kas_actions?: Array<{              // KAS unwrap/rewrap operations
            action: 'unwrap' | 'rewrap';
            kas_url: string;
            status: 'success' | 'failure';
            latency_ms: number;
            timestamp: string;
        }>;
    };

    /** Policy evaluation details (OPA) */
    policyEvaluation?: {
        allow: boolean;
        reason: string;
        evaluation_details?: Record<string, unknown>;
        obligations?: Array<{           // ACP-240 §5.2 KAS obligations
            type: string;
            resourceId?: string;
            status?: 'pending' | 'fulfilled' | 'failed';
        }>;
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
 * Writes to BOTH:
 * 1. Log file (authz.log) for file-based audit trail
 * 2. MongoDB (audit_logs collection) for dashboard queries
 */
export function logACP240Event(event: IACP240AuditEvent): Promise<void> {
    const authzLogger = logger.child({ service: 'acp240-audit' });

    // Write to file (synchronous)
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

    // Write to MongoDB - return promise for tests to await
    return writeToMongoDB(event);
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
}): Promise<void> {
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

    return logACP240Event(event);
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
}): Promise<void> {
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

    return logACP240Event(event);
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
}): Promise<void> {
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

    return logACP240Event(event);
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

/**
 * Close MongoDB connection (for graceful shutdown)
 */
export async function closeAuditLogConnection(): Promise<void> {
    if (mongoClient) {
        try {
            await mongoClient.close();
            mongoClient = null;
            db = null;
            logger.info('ACP-240 logger: MongoDB connection closed');
        } catch (error) {
            logger.error('Failed to close MongoDB connection', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}

