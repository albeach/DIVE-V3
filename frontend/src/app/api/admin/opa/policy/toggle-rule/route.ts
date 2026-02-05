import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Admin OPA Policy Toggle Rule API Route
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
        const { ruleName, enabled, file } = body;

        if (!ruleName || enabled === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields: ruleName and enabled' },
                { status: 400 }
            );
        }

        const backendUrl = getBackendUrl();
        const url = new URL(`${backendUrl}/api/admin/opa/policy/toggle-rule`);
        if (file) {
            url.searchParams.set('file', file);
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ruleName, enabled })
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('OPA toggle rule error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
