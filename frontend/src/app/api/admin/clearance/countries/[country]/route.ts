/**
 * Admin Clearance Country by Code API Route
 *
 * PUT: Update a country clearance configuration
 * DELETE: Remove a country clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
    params: Promise<{ country: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
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

        const { country } = await context.params;
        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/admin/clearance/countries/${country}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Failed to update country configuration' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json({ success: true, data });

    } catch (error) {
        console.error('[Clearance API] PUT country error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update clearance country configuration' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

        const { country } = await context.params;

        const response = await fetch(`${BACKEND_URL}/api/admin/clearance/countries/${country}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Failed to delete country configuration' },
                { status: response.status }
            );
        }

        return NextResponse.json({ success: true, message: 'Country configuration deleted' });

    } catch (error) {
        console.error('[Clearance API] DELETE country error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete clearance country configuration' },
            { status: 500 }
        );
    }
}
