import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

/**
 * Admin OPA Policy API Route
 */
export async function GET(request: Request) {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const file = searchParams.get('file') || 'entrypoints/authz.rego';

        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/admin/opa/policy?file=${file}`, {
            headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('OPA policy error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
