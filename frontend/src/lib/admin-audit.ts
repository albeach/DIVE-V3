/**
 * DIVE V3 Admin Audit Logging
 * 
 * Provides standardized audit logging for admin actions.
 * All admin operations should be logged for compliance.
 * 
 * Usage:
 *   import { logAdminAction } from '@/lib/admin-audit';
 *   
 *   await logAdminAction({
 *     action: 'USER_CREATED',
 *     targetType: 'user',
 *     targetId: userId,
 *     details: { username: 'john.doe' }
 *   });
 */

// ============================================
// Types
// ============================================

export type AdminAction =
  // User actions
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_ENABLED'
  | 'USER_DISABLED'
  | 'USER_PASSWORD_RESET'
  | 'USER_ROLE_ASSIGNED'
  | 'USER_ROLE_REMOVED'
  // IdP actions
  | 'IDP_CREATED'
  | 'IDP_UPDATED'
  | 'IDP_DELETED'
  | 'IDP_ENABLED'
  | 'IDP_DISABLED'
  | 'IDP_TEST_SUCCESS'
  | 'IDP_TEST_FAILED'
  // Policy actions
  | 'POLICY_UPDATED'
  | 'POLICY_PUBLISHED'
  | 'POLICY_RULE_ENABLED'
  | 'POLICY_RULE_DISABLED'
  | 'POLICY_SYNCED'
  // Federation actions
  | 'SPOKE_APPROVED'
  | 'SPOKE_REJECTED'
  | 'SPOKE_SUSPENDED'
  | 'SPOKE_TOKEN_ROTATED'
  | 'SPOKE_DEREGISTERED'
  // Certificate actions
  | 'CERTIFICATE_ROTATED'
  | 'CERTIFICATE_REVOKED'
  | 'CERTIFICATE_CREATED'
  // Audit actions
  | 'AUDIT_EXPORTED'
  | 'AUDIT_CLEARED'
  | 'AUDIT_SYNCED'
  // Session actions
  | 'SESSION_TERMINATED'
  | 'SESSION_BULK_TERMINATED'
  // Admin login
  | 'ADMIN_LOGIN'
  | 'ADMIN_LOGOUT'
  // Generic
  | 'CONFIG_UPDATED'
  | 'BULK_OPERATION';

export type TargetType = 
  | 'user'
  | 'idp'
  | 'policy'
  | 'spoke'
  | 'certificate'
  | 'audit'
  | 'session'
  | 'config'
  | 'system';

export type ActionOutcome = 'success' | 'failure' | 'partial';

export interface IAuditEntry {
  action: AdminAction;
  targetType: TargetType;
  targetId?: string;
  targetName?: string;
  outcome: ActionOutcome;
  details?: Record<string, unknown>;
  errorMessage?: string;
}

export interface IAuditLogRequest {
  timestamp: string;
  action: AdminAction;
  actor: {
    id: string;
    username: string;
    roles: string[];
    ipAddress?: string;
  };
  target: {
    type: TargetType;
    id?: string;
    name?: string;
  };
  outcome: ActionOutcome;
  details?: Record<string, unknown>;
  errorMessage?: string;
  metadata?: {
    userAgent?: string;
    requestId?: string;
    source?: 'admin_ui' | 'api' | 'cli';
  };
}

// ============================================
// Main Functions
// ============================================

/**
 * Log an admin action to the backend
 */
export async function logAdminAction(entry: IAuditEntry): Promise<boolean> {
  try {
    // Get current session info
    const sessionInfo = await getSessionInfo();
    
    if (!sessionInfo) {
      console.warn('[AdminAudit] No session info available, logging locally only');
      logToConsole(entry);
      return false;
    }

    const auditLog: IAuditLogRequest = {
      timestamp: new Date().toISOString(),
      action: entry.action,
      actor: {
        id: sessionInfo.userId,
        username: sessionInfo.username,
        roles: sessionInfo.roles,
        ipAddress: sessionInfo.ipAddress,
      },
      target: {
        type: entry.targetType,
        id: entry.targetId,
        name: entry.targetName,
      },
      outcome: entry.outcome,
      details: entry.details,
      errorMessage: entry.errorMessage,
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        requestId: generateRequestId(),
        source: 'admin_ui',
      },
    };

    // Send to backend
    const response = await fetch('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditLog),
    });

    if (!response.ok) {
      console.warn('[AdminAudit] Failed to log to backend, logging locally');
      logToConsole(entry);
      return false;
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      logToConsole(entry);
    }

    return true;

  } catch (error) {
    console.error('[AdminAudit] Error logging action:', error);
    logToConsole(entry);
    return false;
  }
}

/**
 * Log multiple admin actions (batch)
 */
export async function logAdminActions(entries: IAuditEntry[]): Promise<boolean> {
  const results = await Promise.all(entries.map(logAdminAction));
  return results.every(r => r);
}

// ============================================
// Helper Functions
// ============================================

async function getSessionInfo(): Promise<{
  userId: string;
  username: string;
  roles: string[];
  ipAddress?: string;
} | null> {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) return null;

    const session = await response.json();
    if (!session?.user) return null;

    return {
      userId: session.user.id || session.user.uniqueID || 'unknown',
      username: session.user.uniqueID || session.user.email || 'unknown',
      roles: session.user.roles || [],
      ipAddress: undefined, // Would need to get from headers
    };
  } catch {
    return null;
  }
}

function generateRequestId(): string {
  return `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function logToConsole(entry: IAuditEntry): void {
  const emoji = entry.outcome === 'success' ? '✅' : entry.outcome === 'failure' ? '❌' : '⚠️';
  console.log(
    `[AdminAudit] ${emoji} ${entry.action} | ${entry.targetType}${entry.targetId ? `:${entry.targetId}` : ''} | ${entry.outcome}`,
    entry.details || ''
  );
}

// ============================================
// Pre-built Action Loggers
// ============================================

export const auditActions = {
  // User actions
  userCreated: (userId: string, username: string) =>
    logAdminAction({
      action: 'USER_CREATED',
      targetType: 'user',
      targetId: userId,
      targetName: username,
      outcome: 'success',
      details: { username },
    }),

  userUpdated: (userId: string, username: string, changes: Record<string, unknown>) =>
    logAdminAction({
      action: 'USER_UPDATED',
      targetType: 'user',
      targetId: userId,
      targetName: username,
      outcome: 'success',
      details: { changes },
    }),

  userDeleted: (userId: string, username: string) =>
    logAdminAction({
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: userId,
      targetName: username,
      outcome: 'success',
    }),

  userPasswordReset: (userId: string, username: string) =>
    logAdminAction({
      action: 'USER_PASSWORD_RESET',
      targetType: 'user',
      targetId: userId,
      targetName: username,
      outcome: 'success',
    }),

  // IdP actions
  idpCreated: (alias: string, displayName: string) =>
    logAdminAction({
      action: 'IDP_CREATED',
      targetType: 'idp',
      targetId: alias,
      targetName: displayName,
      outcome: 'success',
    }),

  idpUpdated: (alias: string, changes: Record<string, unknown>) =>
    logAdminAction({
      action: 'IDP_UPDATED',
      targetType: 'idp',
      targetId: alias,
      outcome: 'success',
      details: { changes },
    }),

  idpDeleted: (alias: string) =>
    logAdminAction({
      action: 'IDP_DELETED',
      targetType: 'idp',
      targetId: alias,
      outcome: 'success',
    }),

  idpTestResult: (alias: string, success: boolean, errorMessage?: string) =>
    logAdminAction({
      action: success ? 'IDP_TEST_SUCCESS' : 'IDP_TEST_FAILED',
      targetType: 'idp',
      targetId: alias,
      outcome: success ? 'success' : 'failure',
      errorMessage,
    }),

  // Policy actions
  policyRuleToggled: (ruleName: string, enabled: boolean, rationale?: string) =>
    logAdminAction({
      action: enabled ? 'POLICY_RULE_ENABLED' : 'POLICY_RULE_DISABLED',
      targetType: 'policy',
      targetId: ruleName,
      outcome: 'success',
      details: { enabled, rationale },
    }),

  policySynced: (success: boolean, details?: Record<string, unknown>) =>
    logAdminAction({
      action: 'POLICY_SYNCED',
      targetType: 'policy',
      outcome: success ? 'success' : 'failure',
      details,
    }),

  // Federation actions
  spokeApproved: (spokeId: string, spokeName: string) =>
    logAdminAction({
      action: 'SPOKE_APPROVED',
      targetType: 'spoke',
      targetId: spokeId,
      targetName: spokeName,
      outcome: 'success',
    }),

  spokeRejected: (spokeId: string, spokeName: string, reason: string) =>
    logAdminAction({
      action: 'SPOKE_REJECTED',
      targetType: 'spoke',
      targetId: spokeId,
      targetName: spokeName,
      outcome: 'success',
      details: { reason },
    }),

  // Audit actions
  auditExported: (format: string, count: number) =>
    logAdminAction({
      action: 'AUDIT_EXPORTED',
      targetType: 'audit',
      outcome: 'success',
      details: { format, count },
    }),

  // Session actions
  sessionTerminated: (sessionId: string, username: string) =>
    logAdminAction({
      action: 'SESSION_TERMINATED',
      targetType: 'session',
      targetId: sessionId,
      targetName: username,
      outcome: 'success',
    }),
};

export default auditActions;
