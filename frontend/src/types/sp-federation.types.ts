/**
 * DIVE V3 SP Federation Types (Frontend)
 * Phase 1: Service Provider Federation Foundation
 * 
 * Frontend TypeScript interfaces for SP Registry Management
 */

/**
 * External SP configuration
 */
export interface IExternalSP {
  spId: string;
  name: string;
  description?: string;
  organizationType: 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC';
  country: string;  // ISO 3166-1 alpha-3

  // Technical configuration
  technicalContact: {
    name: string;
    email: string;
    phone?: string;
  };

  // OAuth/OIDC configuration
  clientId: string;
  clientSecret?: string;  // Only for confidential clients (only returned on creation/regeneration)
  clientType: 'confidential' | 'public';
  redirectUris: string[];
  postLogoutRedirectUris?: string[];

  // Security configuration
  jwksUri?: string;              // For JWT validation
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  requirePKCE: boolean;

  // Authorization configuration
  allowedScopes: string[];
  allowedGrantTypes: string[];
  attributeRequirements: {
    clearance: boolean;
    country: boolean;
    coi?: boolean;
    customAttributes?: string[];
  };

  // Operational limits
  rateLimit: {
    requestsPerMinute: number;
    burstSize: number;
    quotaPerDay?: number;
  };

  // Federation agreements
  federationAgreements: Array<{
    agreementId: string;
    countries: string[];
    classifications: string[];
    validUntil: Date | string;
  }>;

  // Status
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  approvedBy?: string;
  approvedAt?: Date | string;

  // Metadata
  createdAt: Date | string;
  updatedAt: Date | string;
  lastActivity?: Date | string;
}

/**
 * SP registration request
 */
export interface ISPRegistrationRequest {
  name: string;
  description?: string;
  organizationType: 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC';
  country: string;
  technicalContact: {
    name: string;
    email: string;
    phone?: string;
  };
  clientType: 'confidential' | 'public';
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  jwksUri?: string;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  requirePKCE?: boolean;
  allowedScopes: string[];
  allowedGrantTypes: string[];
  attributeRequirements: {
    clearance: boolean;
    country: boolean;
    coi?: boolean;
    customAttributes?: string[];
  };
  rateLimit?: {
    requestsPerMinute: number;
    burstSize: number;
    quotaPerDay?: number;
  };
}

/**
 * SP update request
 */
export interface ISPUpdateRequest {
  name?: string;
  description?: string;
  technicalContact?: {
    name: string;
    email: string;
    phone?: string;
  };
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  jwksUri?: string;
  allowedScopes?: string[];
  allowedGrantTypes?: string[];
  attributeRequirements?: {
    clearance: boolean;
    country: boolean;
    coi?: boolean;
    customAttributes?: string[];
  };
  rateLimit?: {
    requestsPerMinute: number;
    burstSize: number;
    quotaPerDay?: number;
  };
}

/**
 * Federation agreement
 */
export interface IFederationAgreement {
  agreementId: string;
  countries: string[];
  classifications: string[];
  validUntil: Date | string;
}

/**
 * SP activity log entry
 */
export interface ISPActivityLog {
  timestamp: Date | string;
  action: string;
  actorId: string;
  actorName: string;
  details: Record<string, any>;
  ipAddress?: string;
}

/**
 * SP list filter options
 */
export interface ISPListFilter {
  status?: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  country?: string;
  organizationType?: 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC';
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * SP list response
 */
export interface ISPListResponse {
  sps: IExternalSP[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Client credential regeneration response
 */
export interface IClientCredentialResponse {
  clientId: string;
  clientSecret: string;
  message: string;
}

/**
 * SP approval request
 */
export interface ISPApprovalRequest {
  action: 'approve' | 'reject';
  reason?: string;
}

/**
 * SP suspension request
 */
export interface ISPSuspensionRequest {
  reason: string;
}

/**
 * Available scopes
 */
export const AVAILABLE_SCOPES = [
  { value: 'openid', label: 'OpenID Connect', description: 'Access to OIDC user info' },
  { value: 'profile', label: 'Profile', description: 'User profile information' },
  { value: 'email', label: 'Email', description: 'User email address' },
  { value: 'offline_access', label: 'Offline Access', description: 'Refresh token support' },
  { value: 'resource:read', label: 'Resource Read', description: 'Read access to resources' },
  { value: 'resource:write', label: 'Resource Write', description: 'Write access to resources' },
  { value: 'resource:search', label: 'Resource Search', description: 'Search federated resources' },
  { value: 'scim:read', label: 'SCIM Read', description: 'Read user provisioning data' },
  { value: 'scim:write', label: 'SCIM Write', description: 'Write user provisioning data' }
] as const;

/**
 * Available grant types
 */
export const AVAILABLE_GRANT_TYPES = [
  { value: 'authorization_code', label: 'Authorization Code', description: 'OAuth 2.0 authorization code flow with PKCE' },
  { value: 'refresh_token', label: 'Refresh Token', description: 'Refresh token grant for long-lived access' },
  { value: 'client_credentials', label: 'Client Credentials', description: 'Machine-to-machine authentication' }
] as const;

/**
 * Available classifications
 */
export const AVAILABLE_CLASSIFICATIONS = [
  { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED', color: 'green' },
  { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL', color: 'blue' },
  { value: 'SECRET', label: 'SECRET', color: 'orange' },
  { value: 'TOP_SECRET', label: 'TOP SECRET', color: 'red' }
] as const;

/**
 * NATO countries (ISO 3166-1 alpha-3)
 */
export const NATO_COUNTRIES = [
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'FRA', name: 'France' },
  { code: 'DEU', name: 'Germany' },
  { code: 'ITA', name: 'Italy' },
  { code: 'CAN', name: 'Canada' },
  { code: 'ESP', name: 'Spain' },
  { code: 'POL', name: 'Poland' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'TUR', name: 'Turkey' }
] as const;

/**
 * Organization types
 */
export const ORGANIZATION_TYPES = [
  { value: 'GOVERNMENT', label: 'Government', description: 'Government agency' },
  { value: 'MILITARY', label: 'Military', description: 'Military organization' },
  { value: 'CONTRACTOR', label: 'Contractor', description: 'Defense contractor' },
  { value: 'ACADEMIC', label: 'Academic', description: 'Academic institution' }
] as const;

