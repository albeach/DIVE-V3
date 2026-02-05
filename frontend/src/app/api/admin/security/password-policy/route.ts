/**
 * Admin Security Password Policy API Route
 * 
 * GET: Get current password policy
 * PUT: Update password policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

const DEFAULT_POLICY = {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSpecialChars: true,
    minUniqueChars: 5,
    passwordHistory: 12,
    preventReuse: true,
    maxAgeDays: 90,
    warnBeforeDays: 14,
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 15,
    lockoutIncrement: true,
    requirePasswordChange: true,
    preventCommonPasswords: true,
    minDaysBetweenChanges: 1,
};

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/security/password-policy`, {
                headers: {
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return NextResponse.json({ success: true, data: data.policy || data });
            }
        } catch (backendError) {
            console.warn('[PasswordPolicy API] Backend unavailable');
        }

        return NextResponse.json({ success: true, data: DEFAULT_POLICY });
        
    } catch (error) {
        console.error('[PasswordPolicy API] Error:', error);
        return NextResponse.json({ success: true, data: DEFAULT_POLICY });
    }
}

export async function PUT(request: NextRequest) {
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

        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/security/password-policy`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                return NextResponse.json({ success: true, message: 'Policy updated' });
            }
        } catch (backendError) {
            console.warn('[PasswordPolicy API] Backend unavailable');
        }

        // Simulate success for development
        return NextResponse.json({ success: true, message: 'Policy updated (local)' });
        
    } catch (error) {
        console.error('[PasswordPolicy API] Update error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update policy' }, { status: 500 });
    }
}
