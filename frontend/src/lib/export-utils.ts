/**
 * DIVE V3 Export Utilities
 *
 * Provides standardized export functionality for admin data:
 * - CSV export
 * - JSON export
 * - PDF export (placeholder)
 *
 * Usage:
 *   import { exportToCSV, exportToJSON, downloadBlob } from '@/lib/export-utils';
 *
 *   exportToCSV(users, 'users-export', ['id', 'username', 'email', 'clearance']);
 *   exportToJSON(logs, 'audit-logs');
 */

import type { IAdminUser } from '@/types/admin.types';

// ============================================
// Types
// ============================================

export type ExportFormat = 'csv' | 'json' | 'pdf';

export interface ExportOptions {
  filename?: string;
  columns?: string[];
  headers?: Record<string, string>;
  dateFormat?: 'iso' | 'locale' | 'unix';
  includeTimestamp?: boolean;
}

// ============================================
// Core Export Functions
// ============================================

/**
 * Export data to CSV format
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  options: ExportOptions = {}
): void {
  const {
    columns,
    headers = {},
    dateFormat = 'iso',
    includeTimestamp = true,
  } = options;

  if (data.length === 0) {
    console.warn('[Export] No data to export');
    return;
  }

  // Determine columns from first row if not specified
  const cols = columns || Object.keys(data[0]);

  // Build header row
  const headerRow = cols.map(col => headers[col] || formatColumnHeader(col)).join(',');

  // Build data rows
  const rows = data.map(row => {
    return cols.map(col => {
      const value = getNestedValue(row, col);
      return formatCSVValue(value, dateFormat);
    }).join(',');
  });

  // Combine header and rows
  const csv = [headerRow, ...rows].join('\n');

  // Generate filename with timestamp
  const finalFilename = includeTimestamp
    ? `${filename}-${getTimestamp()}.csv`
    : `${filename}.csv`;

  // Download
  downloadBlob(csv, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * Export data to JSON format
 */
export function exportToJSON<T>(
  data: T,
  filename: string,
  options: ExportOptions = {}
): void {
  const { includeTimestamp = true } = options;

  const json = JSON.stringify(data, null, 2);

  const finalFilename = includeTimestamp
    ? `${filename}-${getTimestamp()}.json`
    : `${filename}.json`;

  downloadBlob(json, finalFilename, 'application/json');
}

/**
 * Download a blob as a file
 */
export function downloadBlob(
  content: string | Blob,
  filename: string,
  mimeType: string
): void {
  const blob = typeof content === 'string'
    ? new Blob([content], { type: mimeType })
    : content;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// Domain-Specific Export Functions
// ============================================

/**
 * Export audit logs
 */
export function exportAuditLogs(
  logs: AuditLogEntry[],
  filename = 'audit-logs'
): void {
  exportToCSV(logs, filename, {
    columns: [
      'timestamp',
      'eventType',
      'subject',
      'action',
      'resourceId',
      'outcome',
      'reason',
      'latencyMs',
    ],
    headers: {
      timestamp: 'Timestamp',
      eventType: 'Event Type',
      subject: 'Subject',
      action: 'Action',
      resourceId: 'Resource ID',
      outcome: 'Outcome',
      reason: 'Reason',
      latencyMs: 'Latency (ms)',
    },
  });
}

/**
 * Export users
 */
export function exportUsers(
  users: IAdminUser[],
  filename = 'users'
): void {
  // Flatten nested attributes for export
  const flattenedUsers = users.map(user => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    enabled: user.enabled,
    emailVerified: user.emailVerified,
    clearance: user.clearance || '',
    countryOfAffiliation: user.countryOfAffiliation || '',
    roles: (user.realmRoles || []).join('; '),
    createdAt: user.createdAt || new Date().toISOString(),
  }));

  exportToCSV(flattenedUsers, filename, {
    columns: [
      'id',
      'username',
      'firstName',
      'lastName',
      'email',
      'enabled',
      'clearance',
      'countryOfAffiliation',
      'roles',
      'createdAt',
    ],
    headers: {
      id: 'User ID',
      username: 'Username',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      enabled: 'Enabled',
      clearance: 'Clearance',
      countryOfAffiliation: 'Country',
      roles: 'Roles',
      createdAt: 'Created At',
    },
  });
}

/**
 * Export analytics data
 */
export function exportAnalytics(
  data: AnalyticsData,
  filename = 'analytics'
): void {
  exportToJSON(data, filename);
}

/**
 * Export IdP configurations
 */
export function exportIdPs(
  idps: IdPEntry[],
  filename = 'identity-providers'
): void {
  const flattenedIdPs = idps.map(idp => ({
    alias: idp.alias,
    displayName: idp.displayName,
    providerId: idp.providerId,
    enabled: idp.enabled,
    trustEmail: idp.trustEmail,
    firstBrokerLoginFlowAlias: idp.firstBrokerLoginFlowAlias,
    authorizationUrl: idp.config?.authorizationUrl || '',
    tokenUrl: idp.config?.tokenUrl || '',
    clientId: idp.config?.clientId || '',
  }));

  exportToCSV(flattenedIdPs, filename, {
    columns: [
      'alias',
      'displayName',
      'providerId',
      'enabled',
      'trustEmail',
      'authorizationUrl',
      'tokenUrl',
      'clientId',
    ],
    headers: {
      alias: 'Alias',
      displayName: 'Display Name',
      providerId: 'Provider Type',
      enabled: 'Enabled',
      trustEmail: 'Trust Email',
      authorizationUrl: 'Authorization URL',
      tokenUrl: 'Token URL',
      clientId: 'Client ID',
    },
  });
}

/**
 * Export security violations
 */
export function exportViolations(
  violations: SecurityViolation[],
  filename = 'security-violations'
): void {
  const flattenedViolations = violations.map(v => ({
    timestamp: v.timestamp,
    subject: v.subject,
    resourceId: v.resourceId,
    reason: v.reason,
    severity: v.severity,
    userClearance: v.subjectAttributes?.clearance || '',
    resourceClassification: v.resourceAttributes?.classification || '',
    ipAddress: v.context?.ipAddress || '',
  }));

  exportToCSV(flattenedViolations, filename, {
    columns: [
      'timestamp',
      'subject',
      'resourceId',
      'reason',
      'severity',
      'userClearance',
      'resourceClassification',
      'ipAddress',
    ],
    headers: {
      timestamp: 'Timestamp',
      subject: 'Subject',
      resourceId: 'Resource ID',
      reason: 'Reason',
      severity: 'Severity',
      userClearance: 'User Clearance',
      resourceClassification: 'Resource Classification',
      ipAddress: 'IP Address',
    },
  });
}

// ============================================
// Helper Functions
// ============================================

function formatColumnHeader(col: string): string {
  return col
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCSVValue(value: unknown, dateFormat: 'iso' | 'locale' | 'unix'): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    switch (dateFormat) {
      case 'unix': return value.getTime().toString();
      case 'locale': return value.toLocaleString();
      default: return value.toISOString();
    }
  }

  if (Array.isArray(value)) {
    return `"${value.join('; ')}"`;
  }

  if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  }

  const strValue = String(value);

  // Escape values containing commas, quotes, or newlines
  if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// ============================================
// Type Definitions
// ============================================

interface AuditLogEntry {
  timestamp: string;
  eventType: string;
  subject: string;
  action: string;
  resourceId: string;
  outcome: string;
  reason?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

interface UserEntry {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number;
  attributes?: {
    clearance?: string[];
    countryOfAffiliation?: string[];
    [key: string]: string[] | undefined;
  };
  realmRoles?: string[];
  [key: string]: unknown;
}

interface AnalyticsData {
  [key: string]: unknown;
}

interface IdPEntry {
  alias: string;
  displayName?: string;
  providerId: string;
  enabled: boolean;
  trustEmail?: boolean;
  firstBrokerLoginFlowAlias?: string;
  config?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
}

interface SecurityViolation {
  timestamp: string;
  subject: string;
  resourceId: string;
  reason: string;
  severity: string;
  subjectAttributes?: {
    clearance?: string;
    [key: string]: unknown;
  };
  resourceAttributes?: {
    classification?: string;
    [key: string]: unknown;
  };
  context?: {
    ipAddress?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type {
  AuditLogEntry,
  UserEntry,
  AnalyticsData,
  IdPEntry,
  SecurityViolation,
};
