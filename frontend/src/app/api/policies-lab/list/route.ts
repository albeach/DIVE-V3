/**
 * Policies Lab List API Route
 * Proxy to backend API for listing user's uploaded policies
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
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
        const response = await fetch(`${backendUrl}/api/policies-lab/list`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                errorData,
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Policies Lab API] Error fetching policies:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch policies' },
            { status: 500 }
        );
    }
}


