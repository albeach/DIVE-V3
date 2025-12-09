/**
 * Admin IdP List API Route
 * 
 * Proxy for backend IdP list endpoint
 * GET - List all Identity Providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();

        const response = await fetch(`${BACKEND_URL}/api/admin/idps`, {
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
        console.error('[AdminIdPsAPI] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/idps
 * Create a new Identity Provider (server-side proxy)
 *
 * Best practice: keep tokens server-side so client UI never needs bearer tokens.
 * This also survives container restarts because sessions/tokens live in the DB.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();
        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/admin/idps`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        // Pass through backend response (including any validation details)
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return NextResponse.json(
                { error: 'BackendError', message: data.message || `Backend returned ${response.status}`, data },
                { status: response.status }
            );
        }

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[AdminIdPsAPI] POST Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}




