import { NextResponse } from 'next/server';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Admin Analytics Risk Distribution API Route
 * Server-side proxy for IdP governance analytics
 * 
 * Security: Keeps access tokens server-side only
 */
export async function GET() {
    try {
        // Validate session server-side
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Session validation failed' },
                { status: 401 }
            );
        }

        // Get tokens server-side only
        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token available' },
                { status: 401 }
            );
        }

        // Call backend API with server-side token
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/admin/analytics/risk-distribution`, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`
            }
        });

        // Forward response data (but NOT tokens!)
        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);

    } catch (error) {
        console.error('Analytics risk-distribution error:', error);
        return NextResponse.json(
            { 
                error: 'Internal Server Error', 
                message: error instanceof Error ? error.message : 'Unknown error' 
            },
            { status: 500 }
        );
    }
}
