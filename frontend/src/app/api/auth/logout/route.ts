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
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const headerStore = await headers();
        const host = headerStore.get('host');
        const xForwardedHost = headerStore.get('x-forwarded-host');
        const xForwardedProto = headerStore.get('x-forwarded-proto');
        const referer = headerStore.get('referer');

        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run1',hypothesisId:'H2',location:'api/auth/logout/route.ts:POST',message:'Server logout endpoint called (env vs request host)',data:{host,xForwardedHost,xForwardedProto,referer,envNextAuthUrl:process.env.NEXTAUTH_URL??null,envBaseUrl:process.env.NEXT_PUBLIC_BASE_URL??null,envPublicRealm:process.env.NEXT_PUBLIC_KEYCLOAK_REALM??null,envServerRealm:process.env.KEYCLOAK_REALM??null,envPublicKeycloakUrl:process.env.NEXT_PUBLIC_KEYCLOAK_URL??null,envKeycloakUrl:process.env.KEYCLOAK_URL??null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

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
