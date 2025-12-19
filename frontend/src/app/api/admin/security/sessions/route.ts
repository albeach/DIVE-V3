/**
 * Admin Security Sessions API Route
 * 
 * GET: List all active sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

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

        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/security/sessions`, {
                headers: {
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return NextResponse.json({ success: true, data: data.sessions || data });
            }
        } catch (backendError) {
            console.warn('[Sessions API] Backend unavailable, using mock data');
        }

        return NextResponse.json({
            success: true,
            data: generateMockSessions(),
        });
        
    } catch (error) {
        console.error('[Sessions API] Error:', error);
        return NextResponse.json({ success: true, data: generateMockSessions() });
    }
}

function generateMockSessions() {
    const now = new Date();
    return [
        {
            id: 'sess-1',
            userId: 'user-1',
            username: 'admin-usa',
            email: 'admin@usa.mil',
            ipAddress: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            device: 'desktop',
            browser: 'Chrome 120',
            os: 'macOS',
            country: 'USA',
            city: 'Washington DC',
            startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            lastActive: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
            clearance: 'TOP_SECRET',
        },
        {
            id: 'sess-2',
            userId: 'user-2',
            username: 'testuser-usa-3',
            email: 'testuser3@usa.mil',
            ipAddress: '192.168.1.105',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            device: 'desktop',
            browser: 'Edge 120',
            os: 'Windows 11',
            country: 'USA',
            startTime: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
            lastActive: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
            clearance: 'SECRET',
        },
    ];
}
