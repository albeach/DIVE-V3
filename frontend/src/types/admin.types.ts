/**
 * DIVE V3 Admin Type Definitions
 * 
 * Consolidated types for admin section components and APIs.
 */

// ============================================
// User Types
// ============================================

export interface IAdminUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified?: boolean;
  createdAt: string;
  lastLogin?: string | null;

  // DIVE-specific attributes
  uniqueID?: string;
  clearance?: ClearanceLevel;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  organization?: string;
  organizationType?: string;

  // Roles
  roles?: string[];
  adminRoles?: AdminRole[];
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;
}

export type ClearanceLevel =
  | 'UNCLASSIFIED'
  | 'CONFIDENTIAL'
  | 'SECRET'
  | 'TOP_SECRET';

export type AdminRole =
  | 'super_admin'
  | 'admin'
  | 'security_admin'
  | 'policy_admin'
  | 'user_admin'
  | 'idp_admin'
  | 'auditor'
  | 'operator';

export interface IUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  enabled?: boolean;
  role?: string;
  clearance?: ClearanceLevel;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IUserListResponse {
  users: IAdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================
// Audit Log Types
// ============================================

export type AuditEventType =
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'POLICY_CHANGE'
  | 'RESOURCE_ACCESS'
  | 'ADMIN_ACTION'
  | 'SECURITY_VIOLATION'
  | 'CONFIG_CHANGE';

export type AuditOutcome = 'success' | 'failure';

export interface IAuditLog {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  subject: string;
  subjectId?: string;
  resourceId?: string;
  outcome: AuditOutcome;
  reason?: string;
  sourceIp?: string;
  userAgent?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IAuditLogParams {
  eventType?: AuditEventType;
  subject?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface IAuditLogResponse {
  logs: IAuditLog[];
  total: number;
  hasMore: boolean;
}

export interface IAuditStats {
  totalEvents: number;
  deniedAccess: number;
  successfulLogins: number;
  failedLogins: number;
  policyChanges: number;
  securityViolations: number;
  eventsByType: Record<AuditEventType, number>;
  eventsByDay: { date: string; count: number }[];
}

// ============================================
// IdP Types
// ============================================

export type IdPType = 'oidc' | 'saml';
export type IdPProtocol = IdPType; // Alias for backward compatibility
export type IdPStatus = 'enabled' | 'disabled';
export type TrustLevel = 'national' | 'bilateral' | 'partner' | 'development';

export interface IIdentityProvider {
  alias: string;
  displayName: string;
  providerId: IdPType;
  enabled: boolean;
  trustLevel?: TrustLevel;
  firstBrokerLoginFlowAlias?: string;

  config: IIdPConfig;

  createdAt?: string;
  lastSync?: string;

  // Health metrics
  healthy?: boolean;
  lastHealthCheck?: string;
  avgResponseTime?: number;

  // Validation results
  validationResults?: any[];
  criticalFailures?: number;
  preliminaryScore?: number;
}

export interface IIdPConfig {
  // OIDC
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  logoutUrl?: string;
  jwksUri?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  defaultScope?: string;

  // SAML
  singleSignOnServiceUrl?: string;
  singleLogoutServiceUrl?: string;
  signingCertificate?: string;
  entityId?: string;
  nameIDPolicyFormat?: string;
  signatureAlgorithm?: string;
  wantAssertionsSigned?: boolean;
  wantAuthnRequestsSigned?: boolean;

  // Common
  syncMode?: string;
  validateSignature?: string;
  useJwksUrl?: string;
}

export type IOIDCConfig = IIdPConfig; // Alias for backward compatibility
export type ISAMLConfig = IIdPConfig; // Alias for backward compatibility

export interface IIdPHealthStatus {
  alias: string;
  healthy: boolean;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  latency?: number;
  lastChecked: string;
  error?: string;
}

export interface IIdPListItem {
  alias: string;
  displayName: string;
  providerId: IdPType;
  enabled: boolean;
  trustLevel?: TrustLevel;
  healthy?: boolean;
  lastHealthCheck?: string;
  createdAt?: string;
  protocol: IdPType;
}

export interface IAttributeMapping {
  source: string;
  target: string;
  required: boolean;
  description?: string;
}

export interface IIdPTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export type IAdminAPIResponse<T> = IApiResponse<T>; // Alias for backward compatibility

// ============================================
// Session Types
// ============================================

export interface ISession {
  id: string;
  userId: string;
  username: string;
  ipAddress: string;
  userAgent?: string;
  startedAt: string;
  lastActivity: string;
  expiresAt: string;
  clients?: string[];
}

export interface ISessionListResponse {
  sessions: ISession[];
  total: number;
}

// ============================================
// Security Types
// ============================================

export interface ICertificate {
  id: string;
  name: string;
  type: 'root' | 'intermediate' | 'server' | 'client';
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  expiresAt: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'revoked';
  fingerprint?: string;
}

export interface IPasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  historyCount: number;
  maxAgeDays: number;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
}

export interface IMfaConfig {
  totpEnabled: boolean;
  webauthnEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  recoveryCodesEnabled: boolean;
  requiredForAdmins: boolean;
  requiredForAllUsers: boolean;
  gracePeriodDays: number;
}

export interface ISecurityHeader {
  name: string;
  currentValue: string | null;
  recommendedValue: string;
  status: 'configured' | 'missing' | 'misconfigured';
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================
// Analytics Types
// ============================================

export interface IRiskDistribution {
  gold: number;
  silver: number;
  bronze: number;
  fail: number;
}

export interface IComplianceTrends {
  dates: string[];
  acp240: number[];
  stanag4774: number[];
  nist80063: number[];
}

export interface IAuthzMetrics {
  totalDecisions: number;
  allowRate: number;
  denyRate: number;
  averageLatency: number;
  cacheHitRate: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
}

export interface ISecurityPosture {
  averageRiskScore: number;
  complianceRate: number;
  mfaAdoptionRate: number;
  tls13AdoptionRate: number;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ============================================
// Policy Types
// ============================================

export interface IPolicyRule {
  name: string;
  enabled: boolean;
  impact: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  category?: string;
  lastModified?: string;
  modifiedBy?: string;
}

export interface IPolicy {
  id: string;
  name: string;
  version: string;
  description: string;
  rules: IPolicyRule[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  status: 'draft' | 'published' | 'archived';
}

export interface IPolicyTestResult {
  allow: boolean;
  reason: string;
  evaluationTime: number;
  rulesEvaluated: string[];
  violations?: string[];
  obligations?: string[];
}

// ============================================
// Notification Types
// ============================================

export type NotificationType =
  | 'access_granted'
  | 'access_denied'
  | 'document_shared'
  | 'upload_complete'
  | 'system'
  | 'security'
  | 'admin_action';

export interface INotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  resourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// API Response Types
// ============================================

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface IPaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface IBulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
}

// ============================================
// Form Types
// ============================================

export interface IUserFormData {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  password?: string;
  roles?: string[];
  clearance?: ClearanceLevel;
  countryOfAffiliation?: string;
  acpCOI?: string[];
}

export interface IIdPFormData {
  alias: string;
  displayName: string;
  providerId: IdPType;
  enabled: boolean;
  trustLevel: TrustLevel;
  config?: Partial<IIdPConfig>;

  // Additional properties for form management
  protocol?: IdPType;
  oidcConfig?: Partial<IIdPConfig>;
  samlConfig?: Partial<IIdPConfig>;
  attributeMappings?: IAttributeMapping[];
  description?: string;
  operationalData?: Record<string, unknown>;
  complianceDocuments?: {
    mfaPolicy?: string;
    acp240Certificate?: string;
    stanag4774Certification?: string;
    auditPlan?: string;
  };
  metadata?: Record<string, unknown>;
  useAuth0?: boolean;

  // Auth0-specific properties
  auth0Protocol?: string;
  auth0AppType?: string;
}

// ============================================
// Export All
// ============================================

export type {
  IAdminUser as AdminUser,
  IAuditLog as AuditLog,
  IIdentityProvider as IdentityProvider,
  ISession as Session,
  ICertificate as Certificate,
  IPolicy as Policy,
  INotification as Notification,
};
