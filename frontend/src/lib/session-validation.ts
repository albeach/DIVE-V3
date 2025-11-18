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
 * Get session tokens (SERVER-SIDE ONLY)
 * 
 * ⚠️ WARNING: NEVER expose these tokens to client!
 * Only use in server-side API routes for Keycloak API calls.
 * 
 * @throws Error if session invalid or tokens unavailable
 */
export async function getSessionTokens(): Promise<SessionTokens> {
    const validation = await validateSession();

    if (!validation.isValid || !validation.userId) {
        throw new Error(
            `Cannot get tokens: ${validation.error || 'Session invalid'}`
        );
    }

    // Fetch account to get tokens
    const accountResults = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, validation.userId))
        .limit(1);

    const account = accountResults[0];

    if (!account || !account.access_token || !account.id_token) {
        throw new Error('Tokens not available');
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



