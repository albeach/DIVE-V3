/**
 * ZTDF Download API Route (Next.js API Route Handler)
 * 
 * Proxies ZTDF download requests from frontend to backend
 * Forwards session JWT token for authentication
 * 
 * Modern 2025 pattern: Server-side token handling only
 * 
 * @route GET /api/resources/:id/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';

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
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            );
        }

        // Get session tokens
        const tokens = await getSessionTokens();

        if (!tokens?.accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token found' },
                { status: 401 }
            );
        }

        // Forward request to backend with JWT token
        const backendResponse = await fetch(
            `${BACKEND_URL}/api/resources/${resourceId}/download`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`,
                    'X-Request-ID': request.headers.get('x-request-id') || `req-${Date.now()}`
                },
                // @ts-ignore - Node.js-specific option
                cache: 'no-store'
            }
        );

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json();
            return NextResponse.json(
                errorData,
                { status: backendResponse.status }
            );
        }

        // Get the ZIP buffer from backend
        const zipBuffer = await backendResponse.arrayBuffer();

        // Forward backend response headers
        const headers = new Headers();
        headers.set('Content-Type', 'application/zip');
        headers.set(
            'Content-Disposition',
            backendResponse.headers.get('content-disposition') || `attachment; filename="${resourceId}.ztdf"`
        );
        headers.set('Content-Length', zipBuffer.byteLength.toString());

        // Forward ZTDF metadata headers
        const ztdfSpecVersion = backendResponse.headers.get('x-ztdf-spec-version');
        const ztdfHash = backendResponse.headers.get('x-ztdf-hash');
        const exportTimestamp = backendResponse.headers.get('x-export-timestamp');

        if (ztdfSpecVersion) headers.set('X-ZTDF-Spec-Version', ztdfSpecVersion);
        if (ztdfHash) headers.set('X-ZTDF-Hash', ztdfHash);
        if (exportTimestamp) headers.set('X-Export-Timestamp', exportTimestamp);

        // Return ZIP file
        return new NextResponse(zipBuffer, {
            status: 200,
            headers
        });

    } catch (error) {
        console.error('ZTDF download proxy error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: 'Failed to download ZTDF file',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
}

