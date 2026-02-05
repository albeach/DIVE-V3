import { NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getSecureFetchOptions } from '@/lib/https-agent';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Health Detailed API Route
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
        const response = await fetch(`${backendUrl}/api/health/detailed`, {
            headers: { 'Authorization': `Bearer ${tokens.accessToken}` },
            ...getSecureFetchOptions(),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            return NextResponse.json(
                {
                    error: 'InvalidResponse',
                    message: 'Expected JSON from backend health endpoint',
                    details: text.slice(0, 500),
                },
                { status: response.status || 502 }
            );
        }

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Health detailed error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
