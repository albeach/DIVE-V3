import { NextResponse } from 'next/server';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Admin Analytics Compliance Trends API Route
 * Server-side proxy for IdP governance analytics
 */
export async function GET() {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Session validation failed' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token available' },
                { status: 401 }
            );
        }

        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/admin/analytics/compliance-trends`, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Analytics compliance-trends error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
