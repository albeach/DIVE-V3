import { NextResponse } from 'next/server';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Admin Certificates Revoke API Route
 */
export async function POST(request: Request) {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/admin/certificates/revoke`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Certificates revoke error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
