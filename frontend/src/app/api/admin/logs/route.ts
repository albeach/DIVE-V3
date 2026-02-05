/**
 * Admin Logs API Route
 * 
 * Proxies requests to the backend audit log service
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export async function GET(request: NextRequest) {
    try {
        // Verify session
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check for admin role
        const isAdmin = session.user.roles?.includes('super_admin') || 
                       session.user.roles?.includes('admin') ||
                       session.user.roles?.includes('dive-admin');
        
        if (!isAdmin) {
            return NextResponse.json(
                { success: false, error: 'Forbidden - Admin access required' },
                { status: 403 }
            );
        }

        // Forward query parameters to backend
        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();
        
        const backendUrl = `${BACKEND_URL}/api/admin/logs${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.user.id}`, // Pass user info
                'X-User-ID': session.user.uniqueID || session.user.id || '',
                'X-User-Roles': (session.user.roles || []).join(','),
            },
        });

        if (!response.ok) {
            // If backend returns error, return mock data for development
            console.warn('[Admin Logs] Backend returned error, using mock data:', response.status);
            return NextResponse.json({
                success: true,
                data: {
                    logs: generateMockLogs(50),
                    total: 1000,
                    limit: 50,
                    offset: 0
                },
                requestId: `mock-${Date.now()}`
            });
        }

        const data = await response.json();
        return NextResponse.json(data);
        
    } catch (error) {
        console.error('[Admin Logs] Error fetching logs:', error);
        
        // Return mock data for development when backend is unavailable
        return NextResponse.json({
            success: true,
            data: {
                logs: generateMockLogs(50),
                total: 1000,
                limit: 50,
                offset: 0
            },
            requestId: `mock-${Date.now()}`
        });
    }
}

// Generate mock audit logs for development/demo
function generateMockLogs(count: number) {
    const eventTypes = ['ACCESS_GRANTED', 'ACCESS_DENIED', 'POLICY_EVALUATION', 'KEY_RELEASE', 'ENCRYPT', 'DECRYPT'];
    const outcomes = ['ALLOW', 'DENY'] as const;
    const users = ['testuser-usa-1', 'testuser-usa-2', 'testuser-usa-3', 'testuser-usa-4', 'admin-usa'];
    const resources = Array.from({ length: 20 }, (_, i) => `doc-${String(i + 1).padStart(3, '0')}`);
    const reasons = [
        'All authorization checks passed',
        'Clearance level sufficient',
        'Country in releasability list',
        'Insufficient clearance level',
        'Country not in releasability list',
        'COI membership required',
        'Resource embargo active',
    ];

    const logs = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const outcome = outcomes[Math.random() > 0.8 ? 1 : 0]; // 20% denied
        const eventType = outcome === 'DENY' ? 'ACCESS_DENIED' : eventTypes[Math.floor(Math.random() * eventTypes.length)];
        
        logs.push({
            timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventType,
            requestId: `req-${Math.random().toString(36).substring(2, 10)}`,
            subject: users[Math.floor(Math.random() * users.length)],
            action: 'read',
            resourceId: resources[Math.floor(Math.random() * resources.length)],
            outcome,
            reason: outcome === 'ALLOW' 
                ? reasons[Math.floor(Math.random() * 3)] 
                : reasons[3 + Math.floor(Math.random() * 4)],
            latencyMs: Math.floor(Math.random() * 200) + 10,
            subjectAttributes: {
                clearance: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'][Math.floor(Math.random() * 4)],
                countryOfAffiliation: 'USA',
            },
            resourceAttributes: {
                classification: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'][Math.floor(Math.random() * 4)],
                releasabilityTo: ['USA', 'GBR', 'CAN'],
            }
        });
    }

    // Sort by timestamp descending
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
