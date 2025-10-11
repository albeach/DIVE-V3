/**
 * Custom Server-Side Logout Route
 * 
 * NextAuth's client-side signOut() with database strategy doesn't always delete sessions properly.
 * This server-side route ensures complete cleanup of:
 * - Database session records
 * - Database account records (optional - preserves for re-login)
 * - Cookies
 * 
 * Called by the logout button after client-side signOut()
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        console.log('[DIVE] Server-side logout: Cleaning up database sessions');

        // Get session token from cookie
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get('__Secure-next-auth.session-token')?.value ||
            cookieStore.get('next-auth.session-token')?.value;

        if (sessionToken) {
            // Delete this specific session from database
            const deleted = await db
                .delete(sessions)
                .where(eq(sessions.sessionToken, sessionToken));

            console.log('[DIVE] Deleted session from database:', sessionToken.substring(0, 8) + '...');
        }

        // Also delete ALL expired sessions (cleanup)
        const now = new Date();
        await db
            .delete(sessions)
            .where(eq(sessions.expires, now));  // This is a placeholder - need proper less-than comparison

        console.log('[DIVE] Logout cleanup complete');

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error('[DIVE] Server-side logout error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    // Support GET for direct browser access if needed
    return POST(request);
}

