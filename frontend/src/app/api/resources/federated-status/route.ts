/**
 * Federated Status API Proxy Route
 *
 * Checks which federation instances are online/available.
 * Used to dynamically filter the federation selector UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/resources/federated-status
 * Returns online/offline status for all federation instances
 */
export async function GET(request: NextRequest) {
    try {
        // Step 1: Get session
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No session' },
                { status: 401 }
            );
        }

        // Step 2: Get access token from database
        const accountResults = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, session.user.id))
            .limit(1);

        const account = accountResults[0];
        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token' },
                { status: 401 }
            );
        }

        const backendUrl = getBackendUrl();

        // Step 3: Call backend federated-status endpoint
        const backendResponse = await fetch(`${backendUrl}/api/resources/federated-status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!backendResponse.ok) {
            const error = await backendResponse.json().catch(() => ({}));
            return NextResponse.json(
                {
                    error: 'BackendError',
                    message: error.message || `Backend returned ${backendResponse.status}`,
                    details: error,
                },
                { status: backendResponse.status }
            );
        }

        const data = await backendResponse.json();

        return NextResponse.json(data);

    } catch (error) {
        console.error('[FederatedStatusAPI] Error:', error);
        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}


