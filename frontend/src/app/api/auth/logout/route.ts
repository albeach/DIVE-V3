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
import { db } from '@/lib/db';
import { sessions, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        console.log('[DIVE] Complete server-side logout initiated');

        // Get current session to identify user
        const session = await auth();

        if (!session?.user?.id) {
            console.warn('[DIVE] No active session found during logout');
            return NextResponse.json({ success: true, message: 'No session to logout' }, { status: 200 });
        }

        const userId = session.user.id;
        console.log('[DIVE] Logging out user:', userId);

        // Step 1: Delete ALL sessions for this user
        // This ensures no lingering sessions across devices/tabs
        const deletedSessions = await db
            .delete(sessions)
            .where(eq(sessions.userId, userId));

        console.log('[DIVE] Deleted all sessions for user:', userId);

        // Step 2: Clear account tokens
        // CRITICAL: This prevents session recreation by the session callback
        // Without this, the session callback would find the account and recreate the session!
        await db
            .update(accounts)
            .set({
                access_token: null,
                id_token: null,
                refresh_token: null,
                expires_at: null,
                session_state: null,
            })
            .where(eq(accounts.userId, userId));

        console.log('[DIVE] Cleared account tokens for user:', userId);
        console.log('[DIVE] Complete logout successful');

        return NextResponse.json({
            success: true,
            message: 'User logged out successfully',
            userId
        }, { status: 200 });

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

