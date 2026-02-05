/**
 * Create Notification API Route
 * 
 * POST: Create a new persistent notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = getBackendUrl();

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate required fields
        if (!body.type || !body.title || !body.message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: type, title, message' },
                { status: 400 }
            );
        }

        // Try to forward to backend
        try {
            // Get access token from database
            const { db } = await import('@/lib/db');
            const { accounts } = await import('@/lib/db/schema');
            const { eq } = await import('drizzle-orm');
import { getBackendUrl } from '@/lib/api-utils';

            const accountResults = await db
                .select()
                .from(accounts)
                .where(eq(accounts.userId, session.user.id))
                .limit(1);

            const account = accountResults[0];
            if (!account?.access_token) {
                // Log locally if no token
                console.log('[Notification] Created (local):', body);
                return NextResponse.json({ success: true, stored: 'local' });
            }

            const response = await fetch(`${BACKEND_URL}/api/notifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${account.access_token}`,
                },
                body: JSON.stringify({
                    ...body,
                    userId: session.user.id,
                    createdBy: session.user.uniqueID || session.user.email,
                    timestamp: new Date().toISOString(),
                }),
            });

            if (response.ok) {
                return NextResponse.json({ success: true });
            }

            // Backend failed, log locally
            console.log('[Notification] Created (local, backend error):', body);
            return NextResponse.json({ success: true, stored: 'local' });

        } catch (backendError) {
            console.warn('[Notification] Backend unavailable, logging locally');
            console.log('[Notification]', JSON.stringify(body, null, 2));
            return NextResponse.json({ success: true, stored: 'local' });
        }

    } catch (error) {
        console.error('[Notification] Create error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create notification' },
            { status: 500 }
        );
    }
}
