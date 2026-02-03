/**
 * Drift Event Resolve API Route
 *
 * Proxies requests to the backend drift event resolution endpoint
 * POST - Resolve a specific drift event (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
    try {
        const { eventId } = await params;

        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = session.user.roles?.includes('super_admin') ||
                        session.user.roles?.includes('admin') ||
                        session.user.roles?.includes('dive-admin');

        if (!isAdmin) {
            return NextResponse.json(
                { success: false, error: 'Forbidden - Admin access required' },
                { status: 403 }
            );
        }

        const body = await request.json().catch(() => ({}));

        const response = await fetch(`${BACKEND_URL}/api/drift/events/${eventId}/resolve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[Drift API] Event resolve backend error:', response.status, error);
            return NextResponse.json(
                { success: false, error: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Drift API] Event resolve error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
