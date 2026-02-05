/**
 * ZTDF Details API Proxy Route
 *
 * GET /api/resources/[id]/ztdf
 *
 * Fetches ZTDF details including Key Access Objects (KAOs) for decryption
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Allow self-signed certs in local/dev (backend uses mkcert)
if (process.env.NODE_ENV !== 'production') {
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

        // Proxy request to backend ZTDF endpoint with access token
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/resources/${resourceId}/ztdf`, {
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

            console.error('[ZTDF API] Backend error:', {
                resourceId,
                status: response.status,
                error,
            });

            // Forward backend error status
            return NextResponse.json(error, { status: response.status });
        }

        // Forward backend response to client
        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[ZTDF API] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}
