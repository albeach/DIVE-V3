/**
 * Session Tokens API - Fallback for Keycloak Logout
 * 
 * This endpoint retrieves the idToken from the server-side session
 * when it's not available in the client-side session object.
 * 
 * Required for proper Keycloak SSO logout.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('[DIVE] Session tokens API called');

        // Get current session
        const session = await auth();

        if (!session?.user?.id) {
            console.warn('[DIVE] No active session found');
            return NextResponse.json({ error: 'No active session' }, { status: 401 });
        }

        const userId = session.user.id;
        console.log('[DIVE] Fetching tokens for user:', userId);

        // Fetch account tokens from database
        const accountResults = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, userId))
            .limit(1);

        if (!accountResults || accountResults.length === 0) {
            console.error('[DIVE] No account found for user:', userId);
            return NextResponse.json({ error: 'No account found' }, { status: 404 });
        }

        const account = accountResults[0];

        console.log('[DIVE] Account found:', {
            hasIdToken: !!account.id_token,
            hasAccessToken: !!account.access_token,
            idTokenLength: account.id_token?.length || 0
        });

        return NextResponse.json({
            idToken: account.id_token || null,
            accessToken: account.access_token || null,
            hasIdToken: !!account.id_token,
            hasAccessToken: !!account.access_token
        });

    } catch (error) {
        console.error('[DIVE] Session tokens API error:', error);
        return NextResponse.json(
            { error: 'Failed to retrieve tokens' },
            { status: 500 }
        );
    }
}

