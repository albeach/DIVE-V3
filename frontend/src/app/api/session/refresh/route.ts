/**
 * Session Refresh API Route
 *
 * Allows clients to manually trigger a session refresh
 * This extends the session by refreshing tokens with Keycloak
 *
 * Week 3.4: Enhanced Session Management
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { updateAccountTokensByUserId } from '@/lib/db/operations';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // Get current session
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Unauthorized',
                    message: 'No active session found'
                },
                { status: 401 }
            );
        }

        console.log('[SessionRefresh] Manual refresh requested for user:', session.user.id);

        // Get account to retrieve refresh token
        const accountResults = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, session.user.id))
            .limit(1);

        const account = accountResults[0];

        if (!account || !account.refresh_token) {
            console.error('[SessionRefresh] No account or refresh token found');
            return NextResponse.json(
                {
                    success: false,
                    error: 'NoRefreshToken',
                    message: 'Unable to refresh session. Please login again.'
                },
                { status: 400 }
            );
        }

        // Attempt to refresh tokens with Keycloak
        try {
            const response = await fetch(
                `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
                {
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
                }
            );

            const tokens = await response.json();

            if (!response.ok) {
                console.error('[SessionRefresh] Token refresh failed:', {
                    status: response.status,
                    error: tokens.error,
                    error_description: tokens.error_description,
                });

                // If refresh token is invalid/expired
                if (tokens.error === 'invalid_grant') {
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'RefreshTokenExpired',
                            message: 'Your session has expired. Please login again.'
                        },
                        { status: 401 }
                    );
                }

                return NextResponse.json(
                    {
                        success: false,
                        error: tokens.error || 'RefreshFailed',
                        message: 'Failed to refresh session'
                    },
                    { status: 500 }
                );
            }

            // Validate refresh token rotation - Keycloak must return new refresh token
            if (!tokens.refresh_token) {
                console.error('[SessionRefresh] No new refresh token received from Keycloak');
                return NextResponse.json(
                    {
                        success: false,
                        error: 'MissingRefreshToken',
                        message: 'Token rotation failed - no refresh token received'
                    },
                    { status: 500 }
                );
            }

            // Update account with new tokens (refresh token rotation enforced)
            await updateAccountTokensByUserId(session.user.id, {
                access_token: tokens.access_token,
                id_token: tokens.id_token,
                expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
                refresh_token: tokens.refresh_token,  // Always use new token from rotation
            });

            // Extend database session by 8 hours to align with NextAuth maxAge
            // This prevents premature NextAuth session expiration
            const newSessionExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);  // +8 hours
            await db.update(sessions)
                .set({ expires: newSessionExpiry })
                .where(eq(sessions.userId, session.user.id));

            console.log('[SessionRefresh] Session refreshed successfully', {
                userId: session.user.id,
                newExpiry: new Date((Math.floor(Date.now() / 1000) + tokens.expires_in) * 1000).toISOString(),
                expiresIn: tokens.expires_in,
                sessionExpiry: newSessionExpiry.toISOString(),
            });

            return NextResponse.json({
                success: true,
                message: 'Session refreshed successfully',
                expiresIn: tokens.expires_in,
                expiresAt: new Date((Math.floor(Date.now() / 1000) + tokens.expires_in) * 1000).toISOString(),
            });

        } catch (error) {
            console.error('[SessionRefresh] Error calling Keycloak:', error);
            return NextResponse.json(
                {
                    success: false,
                    error: 'NetworkError',
                    message: 'Network error while refreshing session'
                },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('[SessionRefresh] Unexpected error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'InternalError',
                message: 'An unexpected error occurred'
            },
            { status: 500 }
        );
    }
}

// Health check endpoint - returns session status with server time
export async function GET(request: NextRequest) {
    const serverTime = Math.floor(Date.now() / 1000); // Server time in seconds

    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json(
            {
                authenticated: false,
                message: 'No active session',
                serverTime, // Include server time even for unauthenticated
            },
            { status: 401 }
        );
    }

    // Get account to check token expiry
    const accountResults = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, session.user.id))
        .limit(1);

    const account = accountResults[0];

    if (!account) {
        return NextResponse.json(
            {
                authenticated: false,
                message: 'No account found',
                serverTime,
            },
            { status: 404 }
        );
    }

    const timeUntilExpiry = (account.expires_at || 0) - serverTime;
    const isExpired = timeUntilExpiry <= 0;

    // Include session metadata
    const response = {
        authenticated: true,
        expiresAt: account.expires_at ? new Date(account.expires_at * 1000).toISOString() : null,
        timeUntilExpiry,
        isExpired,
        needsRefresh: timeUntilExpiry < 480, // Less than 8 minutes (aligned with proactive refresh)
        serverTime, // Server time for clock skew detection
        userId: session.user.id,
        provider: account.provider,
    };

    return NextResponse.json(response);
}
