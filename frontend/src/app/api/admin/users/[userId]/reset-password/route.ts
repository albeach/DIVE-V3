/**
 * Admin User Reset Password API Route
 * 
 * POST: Reset user password
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

interface RouteContext {
    params: Promise<{ userId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
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
        
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
            body: JSON.stringify({
                password: body.password,
                temporary: body.temporary ?? false,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json({ success: false, error: error.message || 'Failed to reset password' }, { status: response.status });
        }

        return NextResponse.json({ success: true, message: 'Password reset successfully' });
        
    } catch (error) {
        console.error('[Users API] Reset password error:', error);
        return NextResponse.json({ success: false, error: 'Failed to reset password' }, { status: 500 });
    }
}
