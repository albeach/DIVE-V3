/**
 * Server-Side Session Validation Utilities
 * 
 * Modern 2025 security patterns:
 * - All session validation happens server-side
 * - Never expose raw tokens to client
 * - Use database as source of truth for session state
 * - Provide clean abstraction for API routes
 * 
 * Usage in API routes:
 * ```typescript
 * import { validateSession, getSessionTokens } from '@/lib/session-validation';
 * 
 * export async function GET() {
 *   const validation = await validateSession();
 *   if (!validation.isValid) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   
 *   // Use validation.session.user for user data
 *   // Use getSessionTokens() for token operations (server-side only)
 * }
 * ```
 */

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';

/**
 * Session validation result
 */
export interface SessionValidationResult {
    isValid: boolean;
    session: Session | null;
    error?: SessionValidationError;
    userId?: string;
    expiresAt?: number; // Unix timestamp in milliseconds
}

/**
 * Session validation error types
 */
export type SessionValidationError =
    | 'NO_SESSION'
    | 'NO_USER_ID'
    | 'NO_ACCOUNT'
    | 'EXPIRED'
    | 'INVALID_TOKENS'
    | 'DATABASE_ERROR';

/**
 * Server-side token access (NEVER expose to client)
 */
export interface SessionTokens {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresAt: number; // Unix timestamp in seconds
}

/**
 * Validates current session server-side
 * 
 * Returns validation result with session data if valid.
 * All token access happens server-side only.
 */
export async function validateSession(): Promise<SessionValidationResult> {
    try {
        // Get session from NextAuth (database strategy)
        const session = await auth();

        if (!session) {
            return {
                isValid: false,
                session: null,
                error: 'NO_SESSION',
            };
        }

        if (!session.user?.id) {
            return {
                isValid: false,
                session,
                error: 'NO_USER_ID',
            };
        }

        // Verify account exists and has valid tokens
        const accountResults = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, session.user.id))
            .limit(1);

        const account = accountResults[0];

        if (!account) {
            return {
                isValid: false,
                session,
                error: 'NO_ACCOUNT',
                userId: session.user.id,
            };
        }

        // Check if tokens exist
        if (!account.access_token || !account.id_token) {
            return {
                isValid: false,
                session,
                error: 'INVALID_TOKENS',
                userId: session.user.id,
            };
        }

        // Check if token is expired
        const currentTime = Math.floor(Date.now() / 1000);
        const expiresAt = account.expires_at || 0;
        const isExpired = expiresAt <= currentTime;

        if (isExpired) {
            return {
                isValid: false,
                session,
                error: 'EXPIRED',
                userId: session.user.id,
                expiresAt: expiresAt * 1000,
            };
        }

        // Session is valid
        return {
            isValid: true,
            session,
            userId: session.user.id,
            expiresAt: expiresAt * 1000,
        };

    } catch (error) {
        console.error('[SessionValidation] Error validating session:', error);
        return {
            isValid: false,
            session: null,
            error: 'DATABASE_ERROR',
        };
    }
}

/**
 * Refresh access token using refresh token
 * 
 * CRITICAL FIX (Jan 2026): Handle token expiration at API route level
 * This prevents race conditions where session callback hasn't run yet
 * 
 * @param userId - User ID to refresh tokens for
 * @returns Updated account with fresh tokens
 * @throws Error if refresh fails
 */
async function refreshAccessToken(userId: string): Promise<any> {
    const refreshUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    try {
        // Get current account
        const accountResults = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, userId))
            .limit(1);
        
        const account = accountResults[0];
        if (!account || !account.refresh_token) {
            throw new Error('No refresh token available');
        }
        
        const currentTime = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = (account.expires_at || 0) - currentTime;
        
        console.log('[SessionValidation] Refreshing token', {
            userId: userId.substring(0, 8) + '...',
            timeUntilExpiry,
            expiresAt: new Date((account.expires_at || 0) * 1000).toISOString(),
        });
        
        // Call Keycloak token endpoint
        const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: process.env.KEYCLOAK_CLIENT_ID!,
                client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
                grant_type: 'refresh_token',
                refresh_token: account.refresh_token,
            }),
        });
        
        const tokens = await response.json();
        
        if (!response.ok) {
            console.error('[SessionValidation] Token refresh failed', {
                status: response.status,
                error: tokens.error,
                error_description: tokens.error_description,
            });
            
            // If refresh token is invalid, session is truly expired
            if (tokens.error === 'invalid_grant' || tokens.error_description?.includes('Session not active')) {
                console.warn('[SessionValidation] Refresh token expired - user needs to re-login');
                throw new Error('RefreshTokenExpired');
            }
            
            throw new Error(`Token refresh failed: ${tokens.error || 'Unknown error'}`);
        }
        
        // Update account with new tokens
        const newExpiresAt = currentTime + tokens.expires_in;
        await db.update(accounts)
            .set({
                access_token: tokens.access_token,
                id_token: tokens.id_token,
                expires_at: newExpiresAt,
                refresh_token: tokens.refresh_token || account.refresh_token, // Handle rotation
            })
            .where(eq(accounts.userId, userId));
        
        console.log('[SessionValidation] Token refreshed successfully', {
            userId: userId.substring(0, 8) + '...',
            newExpiresAt: new Date(newExpiresAt * 1000).toISOString(),
        });
        
        return {
            ...account,
            access_token: tokens.access_token,
            id_token: tokens.id_token,
            expires_at: newExpiresAt,
            refresh_token: tokens.refresh_token || account.refresh_token,
        };
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[SessionValidation] Token refresh error', {
            userId: userId.substring(0, 8) + '...',
            error: errorMsg,
        });
        throw error;
    }
}

/**
 * Get session tokens (SERVER-SIDE ONLY)
 * 
 * ⚠️ WARNING: NEVER expose these tokens to client!
 * Only use in server-side API routes for Keycloak API calls.
 * 
 * RESILIENT DESIGN (Jan 2026):
 * 1. Validates session exists
 * 2. Checks token expiration
 * 3. Automatically refreshes if expired or near expiry
 * 4. Throws clear errors if refresh fails
 * 
 * This prevents "Invalid or expired JWT token" errors caused by:
 * - Race conditions (API route runs before session callback)
 * - Token expiration during request processing
 * - Session callback failures
 * 
 * @throws Error if session invalid or tokens unavailable
 */
export async function getSessionTokens(): Promise<SessionTokens> {
    const validation = await validateSession();

    if (!validation.isValid || !validation.userId) {
        throw new Error(
            `Invalid or expired JWT token`
        );
    }

    // Fetch account to get tokens
    let accountResults = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, validation.userId))
        .limit(1);

    let account = accountResults[0];

    if (!account || !account.access_token || !account.id_token) {
        throw new Error('Invalid or expired JWT token');
    }
    
    // CRITICAL FIX: Check if token is expired or near expiry
    // This handles the race condition where session callback hasn't run yet
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (account.expires_at || 0) - currentTime;
    const isExpired = timeUntilExpiry <= 0;
    const needsRefresh = isExpired || timeUntilExpiry < 60; // Less than 1 minute
    
    if (needsRefresh && account.refresh_token) {
        console.log('[SessionValidation] Token needs refresh', {
            userId: validation.userId.substring(0, 8) + '...',
            timeUntilExpiry,
            isExpired,
        });
        
        try {
            // Attempt to refresh the token
            account = await refreshAccessToken(validation.userId);
            
            // If refresh succeeded, continue with fresh tokens
            console.log('[SessionValidation] Using refreshed tokens');
            
        } catch (refreshError) {
            const errorMsg = refreshError instanceof Error ? refreshError.message : 'Unknown error';
            
            // If refresh token expired, user needs to re-authenticate
            if (errorMsg.includes('RefreshTokenExpired') || errorMsg.includes('invalid_grant')) {
                console.error('[SessionValidation] Refresh token invalid - session expired');
                throw new Error('Invalid or expired JWT token');
            }
            
            // For other refresh errors, if token is not yet expired, use existing token
            // This provides resilience against transient Keycloak failures
            if (!isExpired && timeUntilExpiry > 0) {
                console.warn('[SessionValidation] Refresh failed but token still valid, using existing token', {
                    timeUntilExpiry,
                    error: errorMsg,
                });
                // Continue with existing tokens
            } else {
                // Token is expired and refresh failed - cannot proceed
                console.error('[SessionValidation] Token expired and refresh failed');
                throw new Error('Invalid or expired JWT token');
            }
        }
    }

    return {
        accessToken: account.access_token,
        idToken: account.id_token,
        refreshToken: account.refresh_token || undefined,
        expiresAt: account.expires_at || 0,
    };
}

/**
 * Check if user has specific clearance level
 * 
 * Clearance hierarchy: UNCLASSIFIED < CONFIDENTIAL < SECRET < TOP_SECRET
 */
export function hasClearance(
    userClearance: string | undefined,
    requiredClearance: string
): boolean {
    const clearanceLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    
    const userLevel = clearanceLevels.indexOf(userClearance || 'UNCLASSIFIED');
    const requiredLevel = clearanceLevels.indexOf(requiredClearance);

    return userLevel >= requiredLevel;
}

/**
 * Check if user has access to resource based on releasability
 */
export function hasReleasability(
    userCountry: string | undefined,
    releasabilityTo: string[]
): boolean {
    if (!userCountry || releasabilityTo.length === 0) {
        return false;
    }

    return releasabilityTo.includes(userCountry);
}

/**
 * Check if user has Community of Interest access
 */
export function hasCOIAccess(
    userCOI: string[] | undefined,
    requiredCOI: string[]
): boolean {
    // If no COI required, allow access
    if (requiredCOI.length === 0) {
        return true;
    }

    // If no user COI but COI required, deny
    if (!userCOI || userCOI.length === 0) {
        return false;
    }

    // Check for any intersection
    return userCOI.some(coi => requiredCOI.includes(coi));
}

/**
 * Get error message for validation error
 */
export function getValidationErrorMessage(error: SessionValidationError): string {
    switch (error) {
        case 'NO_SESSION':
            return 'No active session found. Please login.';
        case 'NO_USER_ID':
            return 'Invalid session data. Please login again.';
        case 'NO_ACCOUNT':
            return 'Account not found. Please login again.';
        case 'EXPIRED':
            return 'Your session has expired. Please login again.';
        case 'INVALID_TOKENS':
            return 'Invalid authentication tokens. Please login again.';
        case 'DATABASE_ERROR':
            return 'Unable to validate session. Please try again.';
        default:
            return 'Session validation failed.';
    }
}
