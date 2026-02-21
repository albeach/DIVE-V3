/**
 * Policies Lab Upload API Route
 * Proxy to backend API for uploading and validating policies
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // Get session
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            );
        }

        // Get backend URL
        const backendUrl = getBackendUrl();

        // Get access token from session
        const accessToken = (session as any).accessToken;
        if (!accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token found' },
                { status: 401 }
            );
        }

        // Get form data from request
        const formData = await request.formData();

        // Forward request to backend
        const backendResponse = await fetch(`${backendUrl}/api/policies-lab/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            body: formData,
        });

        const data = await backendResponse.json();

        // Return response with same status code
        return NextResponse.json(data, {
            status: backendResponse.status
        });

    } catch (error) {
        console.error('[Policies Lab Upload API] Error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'An unexpected error occurred'
            },
            { status: 500 }
        );
    }
}
