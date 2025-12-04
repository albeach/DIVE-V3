import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

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
        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

        // Get access token from session
        const accessToken = (session as any).accessToken;
        if (!accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token found' },
                { status: 401 }
            );
        }

        // Forward request to backend
        const backendResponse = await fetch(`${backendUrl}/api/policies-lab/load-samples`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await backendResponse.json();

        // Return response with same status code
        return NextResponse.json(data, {
            status: backendResponse.status
        });

    } catch (error) {
        console.error('[Policies Lab Load Samples API] Error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'An unexpected error occurred'
            },
            { status: 500 }
        );
    }
}



