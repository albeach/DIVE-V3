/**
 * Resources API Proxy Route
 *
 * Modern 2025 pattern: Client never touches tokens
 * - Client makes simple fetch('/api/resources')
 * - Server validates session and handles tokens
 * - Server proxies request to backend with proper auth
 *
 * Security: Tokens accessed server-side only via session validation utilities
 * 
 * RESILIENCE FIX (Jan 2026):
 * - Automatic token refresh if expired
 * - Clear error messages for debugging
 * - Graceful handling of Keycloak failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getSecureHttpsAgent } from '@/lib/https-agent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Validate session server-side (includes automatic token refresh)
        const validation = await validateSession();

        if (!validation.isValid) {
            console.error('[ResourcesAPI] Session validation failed:', {
                error: validation.error,
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
            console.error('[ResourcesAPI] Failed to get tokens:', {
                error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
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
        
        console.log('[ResourcesAPI] Proxying to backend', {
            backendUrl,
            userId: validation.userId?.substring(0, 8) + '...',
            tokenExpiresIn: tokens.expiresAt - Math.floor(Date.now() / 1000),
        });
        
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
                statusText: response.statusText,
                error,
                userId: validation.userId?.substring(0, 8) + '...',
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
        
        console.log('[ResourcesAPI] Success', {
            resourceCount: Array.isArray(data) ? data.length : data.resources?.length || 0,
            userId: validation.userId?.substring(0, 8) + '...',
        });
        
        return NextResponse.json(data);

    } catch (error) {
        console.error('[ResourcesAPI] Unexpected error:', {
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
