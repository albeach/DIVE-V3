import { NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Upload API Route
 * Server-side proxy for uploading classified documents
 * 
 * Security: Keeps access tokens server-side only
 */
export async function POST(request: Request) {
    try {
        // Validate session server-side
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Session validation failed' },
                { status: 401 }
            );
        }

        // Get tokens server-side only
        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token available' },
                { status: 401 }
            );
        }

        // Get form data from request
        const formData = await request.formData();

        // Call backend API with server-side token
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`
                // Don't set Content-Type - let fetch handle it for FormData
            },
            body: formData
        });

        // Forward response data (but NOT tokens!)
        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { 
                error: 'Internal Server Error', 
                message: error instanceof Error ? error.message : 'Unknown error' 
            },
            { status: 500 }
        );
    }
}
