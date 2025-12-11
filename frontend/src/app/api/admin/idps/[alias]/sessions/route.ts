/**
 * Admin IdP Sessions API Route
 * 
 * Proxy for backend IdP sessions endpoint
 * GET - Get active sessions for IdP
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ alias: string }> }
): Promise<NextResponse> {
    try {
        const { alias } = await params;
        
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();
        
        // Forward query parameters
        const queryString = request.nextUrl.searchParams.toString();
        const url = queryString 
            ? `${BACKEND_URL}/api/admin/idps/${alias}/sessions?${queryString}`
            : `${BACKEND_URL}/api/admin/idps/${alias}/sessions`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: 'BackendError', message: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[AdminIdPSessionsAPI] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}





