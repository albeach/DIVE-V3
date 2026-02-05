/**
 * Activity API Route
 *
 * Server-side API route to fetch user activity from backend
 * This proxies requests to the backend API with proper authentication
 *
 * Modern 2025 pattern: Client never touches tokens
 * - Client makes simple fetch('/api/activity')
 * - Server validates session and handles tokens
 * - Server proxies request to backend with proper auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Allow self-signed certs in local/dev (backend uses mkcert)
if (process.env.NODE_ENV !== 'production') {
}

/**
 * GET /api/activity
 * Get current user's activity logs
 * Query params:
 * - limit: Maximum number of logs (default: 50)
 * - offset: Pagination offset (default: 0)
 * - timeRange: 24h | 7d | 30d | all (default: 7d)
 * - type: view | download | upload | access_granted | access_denied | all (default: all)
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

        // Extract query parameters
        const searchParams = request.nextUrl.searchParams;
        const limit = searchParams.get('limit') || '50';
        const offset = searchParams.get('offset') || '0';
        const timeRange = searchParams.get('timeRange') || '7d';
        const type = searchParams.get('type') || 'all';

        // Build backend URL with query params
        // Use NEXT_PUBLIC_BACKEND_URL for consistency with other routes
        const backendUrl = getBackendUrl();
        const backendUrlWithParams = new URL(`${backendUrl}/api/activity`);
        backendUrlWithParams.searchParams.set('limit', limit);
        backendUrlWithParams.searchParams.set('offset', offset);
        backendUrlWithParams.searchParams.set('timeRange', timeRange);
        backendUrlWithParams.searchParams.set('type', type);

        // Proxy request to backend with access token
        const backendResponse = await fetch(backendUrlWithParams.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
                'X-Request-ID': `req-${Date.now()}-${Math.random().toString(36).substring(7)}`
            },
            cache: 'no-store',
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json().catch(() => ({}));
            console.error('[ActivityAPI] Backend error:', {
                status: backendResponse.status,
                error: errorData,
            });

            return NextResponse.json(
                {
                    error: 'BackendError',
                    message: errorData.message || `Backend returned ${backendResponse.status}`,
                    details: errorData
                },
                { status: backendResponse.status }
            );
        }

        // Forward backend response to client
        const data = await backendResponse.json();
        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        console.error('[ActivityAPI] Error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'https://localhost:4000'
        });
        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
                details: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                } : undefined
            },
            { status: 500 }
        );
    }
}

