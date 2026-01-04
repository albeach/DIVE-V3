/**
 * Individual Resource API Proxy Route
 *
 * GET /api/resources/[id]
 *
 * Modern 2025 pattern: Server-side token handling only
 * - Client requests resource by ID
 * - Server validates session and handles backend auth
 * - Includes authorization decision from OPA
 * 
 * RESILIENCE FIX (Jan 2026):
 * - Automatic token refresh if expired
 * - Clear error messages for debugging
 * - Graceful handling of authorization failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

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

        // Validate session server-side (includes automatic token refresh)
        const validation = await validateSession();

        if (!validation.isValid) {
            console.error('[ResourceAPI] Session validation failed:', {
                error: validation.error,
                resourceId,
                userId: validation.userId?.substring(0, 8) + '...',
            });
            
            return NextResponse.json(
                {
                    error: 'Unauthorized',
                    message: 'Invalid or expired JWT token',
                },
                { status: 401 }
            );
        }

        // Get tokens server-side (NEVER expose to client)
        // This now includes automatic token refresh if expired
        let tokens;
        try {
            tokens = await getSessionTokens();
        } catch (tokenError) {
            console.error('[ResourceAPI] Failed to get tokens:', {
                error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
                resourceId,
                userId: validation.userId?.substring(0, 8) + '...',
            });
            
            return NextResponse.json(
                {
                    error: 'Unauthorized',
                    message: 'Invalid or expired JWT token',
                },
                { status: 401 }
            );
        }

        // Proxy request to backend with access token
        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        
        console.log('[ResourceAPI] Fetching resource', {
            resourceId,
            backendUrl,
            userId: validation.userId?.substring(0, 8) + '...',
            tokenExpiresIn: tokens.expiresAt - Math.floor(Date.now() / 1000),
        });
        
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
                statusText: response.statusText,
                error,
                userId: validation.userId?.substring(0, 8) + '...',
            });

            // Forward backend error status (403 for authz denial, etc.)
            return NextResponse.json(error, { status: response.status });
        }

        // Forward backend response to client
        const data = await response.json();
        
        console.log('[ResourceAPI] Success', {
            resourceId,
            userId: validation.userId?.substring(0, 8) + '...',
        });
        
        return NextResponse.json(data);

    } catch (error) {
        console.error('[ResourceAPI] Unexpected error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}
