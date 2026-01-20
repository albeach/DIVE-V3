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

        // Determine target backend based on resourceId prefix (cross-instance routing)
        // Resource IDs are formatted as: doc-{INSTANCE}-seed-{timestamp}-{number}
        // Examples: doc-USA-seed-..., doc-FRA-seed-..., doc-GBR-seed-...
        const instanceMatch = resourceId.match(/^doc-([A-Z]{2,3})-/);
        const targetInstance = instanceMatch ? instanceMatch[1] : null;
        const currentInstance = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
        
        let backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        let isCrossInstance = false;
        
        // Cross-instance routing: If resource is from another instance, use federated endpoint
        if (targetInstance && targetInstance !== currentInstance) {
            isCrossInstance = true;
            console.log('[ResourceAPI] Cross-instance resource detected', {
                resourceId,
                targetInstance,
                currentInstance
            });
            
            // Instead of routing to different backend, use federated resource endpoint
            // The backend will handle cross-instance queries via federated-resource.service
            // This approach:
            // 1. Keeps authentication with current instance
            // 2. Backend handles cross-instance MongoDB queries
            // 3. Maintains consistent authorization flow
        }
        
        console.log('[ResourceAPI] Fetching resource', {
            resourceId,
            backendUrl,
            targetInstance: targetInstance || currentInstance,
            crossInstance: targetInstance !== currentInstance,
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
