/**
 * Admin User by ID API Route
 * 
 * GET: Get user details
 * PUT: Update user
 * DELETE: Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

interface RouteContext {
    params: Promise<{ userId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { userId } = await context.params;
        
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const data = await response.json();
        return NextResponse.json({ success: true, data });
        
    } catch (error) {
        console.error('[Users API] Get error:', error);
        return NextResponse.json({ success: false, error: 'Failed to get user' }, { status: 500 });
    }
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

        const { userId } = await context.params;
        const body = await request.json();
        
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json({ success: false, error: error.message || 'Failed to update user' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json({ success: true, data });
        
    } catch (error) {
        console.error('[Users API] Update error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
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

        const { userId } = await context.params;
        
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json({ success: false, error: error.message || 'Failed to delete user' }, { status: response.status });
        }

        return NextResponse.json({ success: true, message: 'User deleted' });
        
    } catch (error) {
        console.error('[Users API] Delete error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
    }
}
