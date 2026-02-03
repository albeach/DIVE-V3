/**
 * Admin Clearance Countries API Route
 *
 * GET: List all countries with clearance configurations
 * POST: Create a new country clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.roles?.includes('super_admin') ||
                       session.user.roles?.includes('admin') ||
                       session.user.roles?.includes('dive-admin');

        if (!isAdmin) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();
        const url = queryString
            ? `${BACKEND_URL}/api/admin/clearance/countries?${queryString}`
            : `${BACKEND_URL}/api/admin/clearance/countries`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Failed to fetch countries' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Clearance API] GET countries error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch clearance countries' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.roles?.includes('super_admin') ||
                       session.user.roles?.includes('admin') ||
                       session.user.roles?.includes('dive-admin');

        if (!isAdmin) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/admin/clearance/countries`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Failed to create country configuration' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json({ success: true, data });

    } catch (error) {
        console.error('[Clearance API] POST countries error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create clearance country configuration' },
            { status: 500 }
        );
    }
}
