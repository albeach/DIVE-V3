/**
 * Policies Hierarchy API Proxy Route
 *
 * Proxies requests to the backend /api/policies/hierarchy endpoint.
 * This endpoint is public and does not require authentication.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/policies/hierarchy
 * Proxy to backend policies hierarchy endpoint
 */
export async function GET(request: NextRequest) {
    try {
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

        const backendResponse = await fetch(`${backendUrl}/api/policies/hierarchy`, {
            cache: 'no-store',
            headers: {
                // Forward any relevant headers if needed
            },
        });

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text();
            console.error('[PoliciesHierarchyAPI] Backend error:', backendResponse.status, errorText);
            return NextResponse.json(
                { error: 'BackendError', message: `Backend returned ${backendResponse.status}` },
                { status: backendResponse.status }
            );
        }

        const data = await backendResponse.json();

        return NextResponse.json(data);

    } catch (error) {
        console.error('[PoliciesHierarchyAPI] Error:', error);
        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}