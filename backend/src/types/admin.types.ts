/**
 * Admin API Type Definitions
 * 
 * Types for super admin operations: IdP management, user management, audit logs
 */

import { IdPProtocol, IdPStatus } from './keycloak.types';
import { IValidationResults, IPreliminaryScore } from './validation.types';
import {
    IComprehensiveRiskScore,
    IComplianceCheckResult,
    IApprovalDecision,
    IOperationalData,
    IComplianceDocuments,
    SLAStatus,
} from './risk-scoring.types';

// ============================================
// Admin Role Types
// ============================================

export const SUPER_ADMIN_ROLE = 'super_admin';

/**
 * All roles that grant admin access
 * Must match frontend admin layout role check
 */
export const ADMIN_ROLES = ['super_admin', 'admin', 'dive-admin'] as const;

/**
 * Check if user has any admin role
 */
export const hasAdminRole = (roles: string[]): boolean => {
    return ADMIN_ROLES.some(adminRole => roles.includes(adminRole));
};

export interface ISuperAdminUser {
    uniqueID: string;
    roles: string[];
    clearance?: string;
    countryOfAffiliation?: string;
}

// ============================================
// IdP Approval Types
// ============================================

export interface IIdPSubmission {
    submissionId: string;
    alias: string;
    displayName: string;
    description?: string;
    protocol: IdPProtocol;
    status: IdPStatus;
    config: Record<string, any>;
    attributeMappings: Record<string, any>;
    submittedBy: string;
    submittedAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    rejectionReason?: string;
    // Auth0 Integration (Week 3.4.6)
    useAuth0?: boolean;
    auth0ClientId?: string;
    auth0ClientSecret?: string;
    // Phase 1: Validation Results (Automated Security Checks)
    validationResults?: IValidationResults;
    preliminaryScore?: IPreliminaryScore;

    // Phase 2: Comprehensive Risk Scoring & Compliance (NEW)
    /** Comprehensive risk score (100-point system) */
    comprehensiveRiskScore?: IComprehensiveRiskScore;

    /** Compliance validation results (ACP-240, STANAG, NIST) */
    complianceCheck?: IComplianceCheckResult;

    /** Approval decision (auto-approve, fast-track, standard, reject) */
    approvalDecision?: IApprovalDecision;

    /** SLA deadline for review (ISO 8601) */
    slaDeadline?: string;

    /** Current SLA status */
    slaStatus?: SLAStatus;

    /** Whether submission was auto-approved */
    autoApproved?: boolean;

    /** Whether submission is in fast-track queue */
    fastTrack?: boolean;

    /** Operational data provided by partner */
    operationalData?: IOperationalData;

    /** Compliance documents uploaded by partner */
    complianceDocuments?: IComplianceDocuments;
}

export interface IApprovalRequest {
    action: 'approve' | 'reject';
    reviewedBy: string;
    reason?: string;
}

export interface IApprovalResponse {
    success: boolean;
    alias: string;
    status: IdPStatus;
    message: string;
}

// ============================================
// Audit Log Types
// ============================================

export interface IAuditLogQuery {
    eventType?: string;
    subject?: string;
    resourceId?: string;
    outcome?: 'ALLOW' | 'DENY';
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
}

export interface IAuditLogEntry {
    timestamp: string;
    eventType: string;
    requestId: string;
    subject: string;
    action: string;
    resourceId: string;
    outcome: 'ALLOW' | 'DENY';
    reason: string;
    subjectAttributes?: Record<string, any>;
    resourceAttributes?: Record<string, any>;
    policyEvaluation?: Record<string, any>;
    context?: Record<string, any>;
    latencyMs?: number;
}

export interface IAuditLogResponse {
    logs: IAuditLogEntry[];
    total: number;
    page: number;
    limit: number;
}

export interface IAuditLogStats {
    totalEvents: number;
    eventsByType: Record<string, number>;
    deniedAccess: number;
    successfulAccess: number;
    topDeniedResources: Array<{ resourceId: string; count: number }>;
    topUsers: Array<{ subject: string; count: number }>;
    violationTrend: Array<{ date: string; count: number }>;
}

// ============================================
// User Management Types
// ============================================

export interface IAdminUserQuery {
    search?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    limit?: number;
    offset?: number;
}

export interface IAdminUserInfo {
    id: string;
    username: string;
    uniqueID: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled: boolean;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    roles: string[];
    federatedIdentities: Array<{
        identityProvider: string;
        userId: string;
        userName: string;
    }>;
    createdTimestamp?: number;
    lastLogin?: string;
}

export interface IUserSessionInfo {
    sessionId: string;
    userId: string;
    username: string;
    ipAddress: string;
    start: number;
    lastAccess: number;
    clients: Array<{
        clientId: string;
        clientName: string;
    }>;
}

// ============================================
// System Health Types
// ============================================

export interface ISystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    services: {
        keycloak: IServiceStatus;
        mongodb: IServiceStatus;
        opa: IServiceStatus;
        kas?: IServiceStatus;
    };
    metrics: {
        activeUsers: number;
        activeSessions: number;
        totalIdPs: number;
        pendingApprovals: number;
        recentViolations: number;
    };
}

export interface IServiceStatus {
    status: 'up' | 'down' | 'unknown';
    responseTime?: number;
    message?: string;
}

// ============================================
// Admin Action Types
// ============================================

export type AdminAction =
    | 'view_logs'
    | 'export_logs'
    | 'approve_idp'
    | 'reject_idp'
    | 'create_idp'
    | 'update_idp'
    | 'delete_idp'
    | 'manage_users'
    | 'view_violations'
    | 'view_system_health';

export interface IAdminActionLog {
    timestamp: string;
    admin: string;
    action: AdminAction;
    target?: string;
    details?: Record<string, any>;
    outcome: 'success' | 'failure';
    reason?: string;
}

// ============================================
// API Response Types
// ============================================

export interface IAdminAPIResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    requestId?: string;
}

export interface IPaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
