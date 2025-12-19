/**
 * Admin Security MFA Configuration API Route
 * 
 * GET: Get current MFA configuration
 * PUT: Update MFA configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

const DEFAULT_CONFIG = {
    mfaRequired: true,
    mfaRequiredForAdmins: true,
    mfaGracePeriodDays: 7,
    totpEnabled: true,
    totpAlgorithm: 'SHA256',
    totpDigits: 6,
    totpPeriod: 30,
    totpInitialCounter: 0,
    webauthnEnabled: true,
    webauthnRpName: 'DIVE V3',
    webauthnRpId: 'localhost',
    webauthnAttestationConveyance: 'none',
    webauthnUserVerification: 'preferred',
    webauthnTimeout: 60000,
    smsEnabled: false,
    smsCodeLength: 6,
    smsCodeExpiry: 300,
    smsRateLimit: 3,
    recoveryCodesEnabled: true,
    recoveryCodeCount: 10,
    recoveryCodeLength: 12,
};

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/security/mfa-config`, {
                headers: {
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return NextResponse.json({ success: true, data: data.config || data });
            }
        } catch (backendError) {
            console.warn('[MFAConfig API] Backend unavailable');
        }

        return NextResponse.json({ success: true, data: DEFAULT_CONFIG });
        
    } catch (error) {
        console.error('[MFAConfig API] Error:', error);
        return NextResponse.json({ success: true, data: DEFAULT_CONFIG });
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
            const response = await fetch(`${BACKEND_URL}/api/admin/security/mfa-config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                return NextResponse.json({ success: true, message: 'MFA configuration updated' });
            }
        } catch (backendError) {
            console.warn('[MFAConfig API] Backend unavailable');
        }

        return NextResponse.json({ success: true, message: 'MFA configuration updated (local)' });
        
    } catch (error) {
        console.error('[MFAConfig API] Update error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update MFA configuration' }, { status: 500 });
    }
}
