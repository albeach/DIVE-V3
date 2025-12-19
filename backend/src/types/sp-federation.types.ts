/**
 * DIVE V3 SP Federation Types
 * Phase 1: Service Provider Federation Foundation
 */

import { Request } from 'express';

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
  clientSecret?: string;  // Only for confidential clients
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
    validUntil: Date;
  }>;

  // Status
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  approvedBy?: string;
  approvedAt?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastActivity?: Date;
}

/**
 * OAuth authorization code
 */
export interface IAuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
  expiresAt: Date;
  usedAt?: Date;
}

/**
 * OAuth token response
 */
export interface ITokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * SP context (attached to request after validation)
 */
export interface ISPContext {
  clientId: string;
  scopes: string[];
  sp: IExternalSP;
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
 * SCIM User resource (DIVE V3 extension)
 */
export interface ISCIMUser {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"];
  id: string;
  externalId?: string;
  userName: string;
  name: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  emails: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active: boolean;

  // DIVE V3 extensions
  "urn:dive:params:scim:schemas:extension:2.0:User": {
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
    dutyOrg?: string;
  };

  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    version: string;
  };
}

/**
 * SCIM List response
 */
export interface ISCIMListResponse<T> {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
  totalResults: number;
  itemsPerPage: number;
  startIndex: number;
  Resources: T[];
}

/**
 * SCIM Error response
 */
export interface ISCIMError {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"];
  status: string;
  scimType?: string;
  detail: string;
}

/**
 * Extended request with SP context
 */
export interface IRequestWithSP extends Request {
  sp?: ISPContext;
  user?: any;  // Existing user context
}

/**
 * Federation metadata
 */
export interface IFederationMetadata {
  entity: {
    id: string;
    type: 'service_provider' | 'identity_provider';
    name: string;
    country: string;
  };
  endpoints: {
    resources: string;
    search: string;
    policies: string;
  };
  capabilities: {
    protocols: string[];
    classifications: string[];
    countries: string[];
    coi: string[];
  };
  security: {
    tokenEndpoint: string;
    jwksUri: string;
    supportedAlgorithms: string[];
  };
}

/**
 * Federated search query
 */
export interface IFederatedSearchQuery {
  classification?: string;
  country?: string;
  keywords?: string;
  coi?: string[];
  limit?: number;
  offset?: number;
}

/**
 * OAuth client credentials
 */
export interface IOAuthClient {
  clientId: string;
  clientSecret?: string;
  enabled: boolean;
  clientAuthenticatorType: string;
  redirectUris: string[];
  webOrigins: string[];
  standardFlowEnabled: boolean;
  implicitFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  authorizationServicesEnabled: boolean;
  publicClient: boolean;
  protocol: string;
  attributes: Record<string, string>;
  defaultClientScopes: string[];
  optionalClientScopes: string[];
}
