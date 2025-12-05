/**
 * Federated Search API Proxy Route
 * 
 * Proxies federated search requests to the backend API
 * Supports both GET (simple queries) and POST (complex queries with filters)
 * 
 * Phase 4: Distributed Query Federation
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/resources/federated-search
 * Simple federated search across all instances
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

        // Get tokens server-side (NEVER expose to client)
        const tokens = await getSessionTokens();

        // Forward query params to backend
        const searchParams = request.nextUrl.searchParams.toString();
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const url = searchParams 
            ? `${backendUrl}/api/resources/federated-search?${searchParams}`
            : `${backendUrl}/api/resources/federated-search`;

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
            console.error('[FederatedSearchAPI] Backend error:', {
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
        console.error('[FederatedSearchAPI] GET Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/resources/federated-search
 * Complex federated search with filters in request body
 */
export async function POST(request: NextRequest) {
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

        // Get request body
        const body = await request.json().catch(() => ({}));

        // Proxy to backend
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/resources/federated-search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[FederatedSearchAPI] Backend error:', {
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
        console.error('[FederatedSearchAPI] POST Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}






