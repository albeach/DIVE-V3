/**
 * Resources API Proxy Route
 *
 * Modern 2025 pattern: Client never touches tokens
 * - Client makes simple fetch('/api/resources')
 * - Server validates session and handles tokens
 * - Server proxies request to backend with proper auth
 *
 * Security: Tokens accessed server-side only via session validation utilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

// Allow self-signed certs in local/dev (backend uses mkcert)
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

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

        // Proxy request to backend with access token
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/resources`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            // Disable caching for dynamic content
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[ResourcesAPI] Backend error:', {
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

        // Forward backend response to client
        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[ResourcesAPI] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}
