import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

/**
 * Admin OPA Status API Route
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

        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/admin/opa/status`, {
            headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('OPA status error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}






