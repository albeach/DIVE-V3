/**
 * Decision Replay API Route
 *
 * Proxies requests to the backend decision replay endpoint
 * POST - Submit a decision replay request with JSON body
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/decision-replay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[DecisionReplay API] Backend error:', response.status, error);
            return NextResponse.json(
                { success: false, error: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[DecisionReplay API] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
