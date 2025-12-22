/**
 * KAS Flow API Proxy Route
 * 
 * GET /api/resources/[id]/kas-flow
 * 
 * This route handles federation-aware KAS flow requests by:
 * 1. Validating the user's session server-side
 * 2. Proxying the request to the local backend with proper auth
 * 3. The backend handles federation if the resource is on another instance
 * 
 * Modern 2025 pattern: Server-side token handling only
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

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

        // Get tokens server-side
        const tokens = await getSessionTokens();

        // Proxy request to local backend (backend handles federation)
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/resources/${resourceId}/kas-flow`, {
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

            return NextResponse.json(error, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[KASFlowAPI] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}

