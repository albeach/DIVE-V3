/**
 * Authentication Types
 * 
 * Shared authentication types for DIVE V3 backend.
 * Used across controllers and middleware for type-safe request handling.
 */

import { Request } from 'express';

/**
 * Authenticated user payload extracted from JWT token
 * SSOT for user authentication across all backend controllers/middleware
 */
export interface IUserPayload {
    sub: string;
    uniqueID: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    email?: string;
    preferred_username?: string;
    roles?: string[];
    role?: string;  // Primary role for RBAC (role.middleware.ts)
    tenant?: string;  // Tenant/instance isolation
    auth_time?: number;  // Authentication timestamp
    user_acr?: string;  // Authentication Context Class Reference (AAL testing)
    user_amr?: string[];  // Authentication Methods Reference (AAL testing)
}

/**
 * Alias for backward compatibility
 * All files should use IUserPayload but IAuthenticatedUser is still used in many places
 */
export type IAuthenticatedUser = IUserPayload;

/**
 * Extended Express Request with authenticated user info
 * Used after JWT authentication middleware has validated the token
 */
export interface IAuthenticatedRequest extends Request {
    user?: IUserPayload;
}

/**
 * JWT Token payload structure from Keycloak
 */
export interface IKeycloakToken {
    sub: string;
    iss: string;
    aud: string | string[];
    exp: number;
    iat: number;
    jti?: string;
    
    // Standard OIDC claims
    preferred_username?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    
    // DIVE-specific claims
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    
    // Keycloak role structure
    realm_access?: {
        roles: string[];
    };
    resource_access?: {
        [client: string]: {
            roles: string[];
        };
    };
    roles?: string[];
}

/**
 * Authentication error response
 */
export interface IAuthError {
    error: 'Unauthorized' | 'Forbidden' | 'TokenExpired' | 'InvalidToken';
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
}

/**
 * Session information for authenticated users
 */
export interface ISessionInfo {
    userId: string;
    sessionId: string;
    issuedAt: number;
    expiresAt: number;
    issuer: string;
    idpAlias?: string;
    countryOfAffiliation?: string;
    clearance?: string;
}
