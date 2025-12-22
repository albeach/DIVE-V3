/**
 * Individual Resource API Proxy Route
 *
 * GET /api/resources/[id]
 *
 * Modern 2025 pattern: Server-side token handling only
 * - Client requests resource by ID
 * - Server validates session and handles backend auth
 * - Includes authorization decision from OPA
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

// Allow self-signed certs in local/dev (backend uses mkcert)
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: resourceId } = await params;

        // Validate session server-side
        const validation = await validateSession();

        if (!validation.isValid) {
            return NextResponse.json(
                {
                    error: 'Unauthorized',
                    message: validation.error || 'Session invalid',
                },
                { status: 401 }
            );
        }

        // Get tokens server-side (NEVER expose to client)
        const tokens = await getSessionTokens();

        // Proxy request to backend with access token
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/resources/${resourceId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                error: 'Unknown error',
                message: `Backend returned ${response.status}`
            }));

            console.error('[ResourceAPI] Backend error:', {
                resourceId,
                status: response.status,
                error,
            });

            // Forward backend error status (403 for authz denial, etc.)
            return NextResponse.json(error, { status: response.status });
        }

        // Forward backend response to client
        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[ResourceAPI] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}
