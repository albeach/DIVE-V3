/**
 * Drift Events API Route
 *
 * Proxies requests to the backend drift events endpoint
 * GET - Retrieve list of drift events
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();

        const backendUrl = `${BACKEND_URL}/api/drift/events${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[Drift API] Events backend error:', response.status, error);
            return NextResponse.json(
                { success: false, error: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Drift API] Events error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
