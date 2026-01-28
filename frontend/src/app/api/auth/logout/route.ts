/**
 * Complete Server-Side Logout Endpoint
 *
 * This endpoint ensures complete session termination by:
 * 1. Deleting ALL database sessions for the user
 * 2. Clearing account tokens (prevents session recreation)
 * 3. Invalidating any cached session state
 *
 * Called by SecureLogoutButton before client-side cleanup
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteSessionsByUserId, clearAccountTokensByUserId } from '@/lib/db/operations';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const headerStore = await headers();
        const host = headerStore.get('host');
        const xForwardedHost = headerStore.get('x-forwarded-host');
        const xForwardedProto = headerStore.get('x-forwarded-proto');
        const referer = headerStore.get('referer');

        console.log('[DIVE] Complete server-side logout initiated');

        // Get current session to identify user
        const session = await auth();

        if (!session?.user?.id) {
            console.warn('[DIVE] No active session found during logout');

            // Still clear cookies even if no session
            const response = NextResponse.json({ success: true, message: 'No session to logout' }, { status: 200 });

            // Clear all NextAuth cookies (httpOnly cookies MUST be cleared server-side)
            const cookiesToClear = [
                'authjs.session-token',
                '__Secure-authjs.session-token',
                'next-auth.session-token',
                '__Secure-next-auth.session-token',
                'authjs.callback-url',
                '__Secure-authjs.callback-url',
                'authjs.csrf-token',
                '__Secure-authjs.csrf-token',
            ];

            cookiesToClear.forEach(cookieName => {
                // Set cookie to empty with immediate expiration
                response.cookies.set(cookieName, '', {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'lax',
                    path: '/',
                    expires: new Date(0), // Jan 1, 1970
                    maxAge: 0
                });
            });

            console.log('[DIVE] Cleared all NextAuth cookies (no session case)');
            return response;
        }

        const userId = session.user.id;
        console.log('[DIVE] Logging out user:', userId);

        // Step 1: Delete ALL sessions for this user
        // This ensures no lingering sessions across devices/tabs
        await deleteSessionsByUserId(userId);

        console.log('[DIVE] Deleted all sessions for user:', userId);

        // Step 2: Clear account tokens
        // CRITICAL: This prevents session recreation by the session callback
        // Without this, the session callback would find the account and recreate the session!
        await clearAccountTokensByUserId(userId);

        console.log('[DIVE] Cleared account tokens for user:', userId);
        console.log('[DIVE] Complete logout successful');

        const response = NextResponse.json({
            success: true,
            message: 'User logged out successfully',
            userId
        }, { status: 200 });

        // CRITICAL: Clear all NextAuth cookies (httpOnly cookies MUST be cleared server-side)
        // Client-side JavaScript cannot delete httpOnly cookies, so this MUST be done here
        const cookiesToClear = [
            'authjs.session-token',
            '__Secure-authjs.session-token',
            'next-auth.session-token',
            '__Secure-next-auth.session-token',
            'authjs.callback-url',
            '__Secure-authjs.callback-url',
            'authjs.csrf-token',
            '__Secure-authjs.csrf-token',
        ];

        cookiesToClear.forEach(cookieName => {
            // Set cookie to empty with immediate expiration
            response.cookies.set(cookieName, '', {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/',
                expires: new Date(0), // Jan 1, 1970
                maxAge: 0
            });
        });

        console.log('[DIVE] Cleared all NextAuth cookies');

        return response;

    } catch (error) {
        console.error('[DIVE] Complete logout error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    // Support GET for compatibility
    return POST();
}
