/**
 * DIVE V3 - Audit Service
 * 
 * Provides ACP-240 compliant authorization decision audit logging.
 * 
 * Features:
 * - Structured JSON logging for all authorization decisions
 * - Correlation ID tracking for request tracing
 * - ACP-240/STANAG 4774 field compliance
 * - Separate audit log file for compliance review
 * - Decision replay support (stores full input/output)
 * - Retention policy support (90 days minimum per ACP-240)
 * 
 * Log Fields (ACP-240 Section 5.2):
 * - timestamp: ISO 8601 UTC
 * - eventType: ACCESS_GRANT | ACCESS_DENY | DECRYPT | KEY_RELEASE
 * - subject: User identifier (PII minimized)
 * - resource: Resource identifier and classification
 * - decision: Allow/Deny with reason
 * - policyVersion: Version of policy that made decision
 * - correlationId: Request tracking ID
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type AuditEventType = 
  | 'ACCESS_GRANT'
  | 'ACCESS_DENY'
  | 'ACCESS_CHECK'
  | 'DECRYPT'
  | 'KEY_RELEASE'
  | 'KEY_DENY'
  | 'POLICY_VIOLATION'
  | 'FEDERATION_AUTH'
  | 'TOKEN_REVOKED'
  | 'CACHE_INVALIDATION';

export interface IAuditSubject {
  /** User unique identifier (NOT full name/email for PII minimization) */
  uniqueID: string;
  /** ISO 3166-1 alpha-3 country code */
  countryOfAffiliation?: string;
  /** Clearance level (DIVE canonical) */
  clearance?: string;
  /** Original national clearance (for equivalency audit) */
  clearanceOriginal?: string;
  /** Country that issued clearance */
  clearanceCountry?: string;
  /** Community of Interest memberships */
  acpCOI?: string[];
  /** Organization type (government/industry) */
  organizationType?: string;
  /** Tenant ID */
  tenant?: string;
  /** Token issuer (for federated auth) */
  issuer?: string;
}

export interface IAuditResource {
  /** Resource unique identifier */
  resourceId: string;
  /** Classification level */
  classification?: string;
  /** Original national classification */
  originalClassification?: string;
  /** Country that created resource */
  originalCountry?: string;
  /** Countries resource is releasable to */
  releasabilityTo?: string[];
  /** Community of Interest requirements */
  COI?: string[];
  /** Whether resource is encrypted (ZTDF) */
  encrypted?: boolean;
}

export interface IAuditDecision {
  /** Allow or deny */
  allow: boolean;
  /** Human-readable reason */
  reason: string;
  /** Detailed evaluation breakdown */
  evaluationDetails?: Record<string, unknown>;
  /** Obligations required (e.g., KAS) */
  obligations?: Array<{
    type: string;
    resourceId?: string;
  }>;
}

export interface IAuditContext {
  /** Request correlation ID */
  correlationId: string;
  /** Request ID from header */
  requestId?: string;
  /** Source IP address */
  sourceIP?: string;
  /** ACR (Authentication Context Class Reference) */
  acr?: string;
  /** AMR (Authentication Methods Reference) */
  amr?: string[];
  /** Device compliance status */
  deviceCompliant?: boolean;
  /** Was request federated? */
  federated?: boolean;
  /** Source of federated request */
  federatedFrom?: string;
}

export interface IAuditEntry {
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Event type */
  eventType: AuditEventType;
  /** Subject (user) information */
  subject: IAuditSubject;
  /** Resource information */
  resource: IAuditResource;
  /** Decision details */
  decision: IAuditDecision;
  /** Request context */
  context: IAuditContext;
  /** Policy version used for decision */
  policyVersion?: string;
  /** Processing latency in milliseconds */
  latencyMs?: number;
  /** Service identifier */
  service: string;
  /** Environment (dev/staging/prod) */
  environment: string;
}

export interface IAuditServiceConfig {
  /** Log file path */
  logPath: string;
  /** Maximum log file size (bytes) */
  maxSize: number;
  /** Maximum number of log files to retain */
  maxFiles: number;
  /** Minimum retention period (days) */
  retentionDays: number;
  /** Service identifier */
  serviceName: string;
  /** Enable console output */
  consoleOutput: boolean;
}

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG: IAuditServiceConfig = {
  logPath: process.env.AUDIT_LOG_PATH || path.join(process.cwd(), 'logs', 'audit.log'),
  maxSize: parseInt(process.env.AUDIT_LOG_MAX_SIZE || '104857600', 10), // 100MB
  maxFiles: parseInt(process.env.AUDIT_LOG_MAX_FILES || '90', 10), // 90 files
  retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10), // ACP-240: 90 days min
  serviceName: process.env.SERVICE_NAME || 'dive-v3-backend',
  consoleOutput: process.env.AUDIT_CONSOLE_OUTPUT === 'true'
};

// ============================================
// AUDIT SERVICE
// ============================================

class AuditService {
  private auditLogger: winston.Logger;
  private config: IAuditServiceConfig;
  private environment: string;
  private policyVersion: string;
  private entriesLogged: number = 0;

  constructor(config: Partial<IAuditServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.environment = process.env.NODE_ENV || 'development';
    this.policyVersion = process.env.POLICY_VERSION || '2.0.0';

    // Ensure log directory exists
    const logDir = path.dirname(this.config.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create dedicated audit logger
    const transports: winston.transport[] = [
      // Primary audit log file
      new winston.transports.File({
        filename: this.config.logPath,
        maxsize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        tailable: true,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
          winston.format.json()
        )
      })
    ];

    // Optional console output for development
    if (this.config.consoleOutput) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, eventType, subject, decision }) => {
              const subj = subject as IAuditSubject;
              const dec = decision as IAuditDecision;
              const result = dec.allow ? '✓ ALLOW' : '✗ DENY';
              return `${timestamp} [AUDIT:${eventType}] ${subj.uniqueID} → ${result}: ${dec.reason}`;
            })
          )
        })
      );
    }

    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        winston.format.json()
      ),
      defaultMeta: {
        service: this.config.serviceName,
        environment: this.environment,
        policyVersion: this.policyVersion
      },
      transports
    });

    logger.info('Audit service initialized', {
      logPath: this.config.logPath,
      maxSize: this.config.maxSize,
      maxFiles: this.config.maxFiles,
      retentionDays: this.config.retentionDays
    });
  }

  /**
   * Generate correlation ID if not provided
   */
  private generateCorrelationId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Log an audit entry
   */
  private log(entry: IAuditEntry): void {
    this.auditLogger.info('', entry);
    this.entriesLogged++;
  }

  /**
   * Log an access grant decision
   */
  logAccessGrant(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    decision: IAuditDecision;
    context: Partial<IAuditContext>;
    latencyMs?: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'ACCESS_GRANT',
      subject: params.subject,
      resource: params.resource,
      decision: params.decision,
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      latencyMs: params.latencyMs,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Log an access deny decision
   */
  logAccessDeny(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    decision: IAuditDecision;
    context: Partial<IAuditContext>;
    latencyMs?: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'ACCESS_DENY',
      subject: params.subject,
      resource: params.resource,
      decision: params.decision,
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      latencyMs: params.latencyMs,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);

    // Also log to main error log for alerting
    logger.warn('Access denied', {
      eventType: 'ACCESS_DENY',
      subject: entry.subject.uniqueID,
      resource: entry.resource.resourceId,
      reason: entry.decision.reason,
      correlationId: entry.context.correlationId
    });
  }

  /**
   * Log a decrypt event (successful resource decryption)
   */
  logDecrypt(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    context: Partial<IAuditContext>;
    latencyMs?: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'DECRYPT',
      subject: params.subject,
      resource: params.resource,
      decision: {
        allow: true,
        reason: 'Decryption authorized'
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      latencyMs: params.latencyMs,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Log a key release event (KAS key release)
   */
  logKeyRelease(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    context: Partial<IAuditContext>;
    latencyMs?: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'KEY_RELEASE',
      subject: params.subject,
      resource: params.resource,
      decision: {
        allow: true,
        reason: 'Key release authorized'
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      latencyMs: params.latencyMs,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Log a key deny event (KAS key denial)
   */
  logKeyDeny(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    reason: string;
    context: Partial<IAuditContext>;
    latencyMs?: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'KEY_DENY',
      subject: params.subject,
      resource: params.resource,
      decision: {
        allow: false,
        reason: params.reason
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      latencyMs: params.latencyMs,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);

    // Also log to main error log for security alerting
    logger.warn('Key release denied', {
      eventType: 'KEY_DENY',
      subject: entry.subject.uniqueID,
      resource: entry.resource.resourceId,
      reason: entry.decision.reason,
      correlationId: entry.context.correlationId
    });
  }

  /**
   * Log a policy violation event
   */
  logPolicyViolation(params: {
    subject: IAuditSubject;
    resource: IAuditResource;
    violationType: string;
    details: Record<string, unknown>;
    context: Partial<IAuditContext>;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'POLICY_VIOLATION',
      subject: params.subject,
      resource: params.resource,
      decision: {
        allow: false,
        reason: params.violationType,
        evaluationDetails: params.details
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);

    // Alert on policy violations
    logger.error('Policy violation detected', {
      eventType: 'POLICY_VIOLATION',
      violationType: params.violationType,
      subject: entry.subject.uniqueID,
      resource: entry.resource.resourceId,
      correlationId: entry.context.correlationId
    });
  }

  /**
   * Log a federation authentication event
   */
  logFederationAuth(params: {
    subject: IAuditSubject;
    federatedFrom: string;
    success: boolean;
    reason?: string;
    context: Partial<IAuditContext>;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'FEDERATION_AUTH',
      subject: params.subject,
      resource: {
        resourceId: 'federation_endpoint'
      },
      decision: {
        allow: params.success,
        reason: params.reason || (params.success ? 'Federation authentication successful' : 'Federation authentication failed')
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        federated: true,
        federatedFrom: params.federatedFrom,
        ...params.context
      },
      policyVersion: this.policyVersion,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Log a token revocation event
   */
  logTokenRevoked(params: {
    subject: IAuditSubject;
    reason: string;
    context: Partial<IAuditContext>;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'TOKEN_REVOKED',
      subject: params.subject,
      resource: {
        resourceId: 'token'
      },
      decision: {
        allow: false,
        reason: params.reason
      },
      context: {
        correlationId: params.context.correlationId || this.generateCorrelationId(),
        ...params.context
      },
      policyVersion: this.policyVersion,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Log a cache invalidation event
   */
  logCacheInvalidation(params: {
    scope: 'all' | 'tenant' | 'user' | 'resource';
    target?: string;
    reason: string;
    keysInvalidated: number;
  }): void {
    const entry: IAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'CACHE_INVALIDATION',
      subject: {
        uniqueID: 'system'
      },
      resource: {
        resourceId: params.target || 'all'
      },
      decision: {
        allow: true,
        reason: params.reason,
        evaluationDetails: {
          scope: params.scope,
          keysInvalidated: params.keysInvalidated
        }
      },
      context: {
        correlationId: this.generateCorrelationId()
      },
      policyVersion: this.policyVersion,
      service: this.config.serviceName,
      environment: this.environment
    };

    this.log(entry);
  }

  /**
   * Get audit statistics
   */
  getStats(): {
    entriesLogged: number;
    logPath: string;
    retentionDays: number;
  } {
    return {
      entriesLogged: this.entriesLogged,
      logPath: this.config.logPath,
      retentionDays: this.config.retentionDays
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<IAuditServiceConfig> {
    return { ...this.config };
  }

  /**
   * Update policy version (e.g., after OPAL update)
   */
  setPolicyVersion(version: string): void {
    this.policyVersion = version;
    logger.info('Audit service policy version updated', { version });
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const auditService = new AuditService();

export default AuditService;





