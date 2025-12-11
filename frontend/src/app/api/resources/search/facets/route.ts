/**
 * Facets API Proxy Route
 * 
 * Phase 1: Performance Foundation
 * Proxies facet aggregation requests to backend
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/resources/search/facets
 * Get facet counts for filter UI
 */
export async function GET(request: NextRequest) {
    try {
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

        // Proxy request to backend
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/resources/search/facets`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[FacetsAPI] Backend error:', {
                status: response.status,
                error,
            });

            return NextResponse.json(
                {
                    error: 'BackendError',
                    message: error.message || `Backend returned ${response.status}`,
                    details: error,
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[FacetsAPI] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}










