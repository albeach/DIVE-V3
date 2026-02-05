import { NextResponse } from 'next/server';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Admin Analytics Authorization Metrics API Route
 */
export async function GET() {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/admin/analytics/authz-metrics`, {
            headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Analytics authz error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
