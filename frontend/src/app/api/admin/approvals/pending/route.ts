/**
 * Admin Pending Approvals API Route
 *
 * Proxies requests to the backend pending approvals endpoint
 * GET - Retrieve list of pending approval requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
    try {
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

        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();

        const backendUrl = `${BACKEND_URL}/api/admin/approvals/pending${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[Admin Approvals API] Backend error:', response.status, error);
            return NextResponse.json(
                { success: false, error: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Admin Approvals API] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
