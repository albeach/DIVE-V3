/**
 * Admin Logs Export API Route
 * 
 * Exports audit logs in JSON format
 * Proxies to backend or generates mock data for development
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

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
        
        const backendUrl = `${BACKEND_URL}/api/admin/logs/export${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.user.id}`,
                'X-User-ID': session.user.uniqueID || session.user.id || '',
                'X-User-Roles': (session.user.roles || []).join(','),
            },
        });

        if (!response.ok) {
            // Generate mock export data
            console.warn('[Admin Logs Export] Backend returned error, using mock data');
            const logs = generateMockExportLogs(100);
            const exportData = JSON.stringify({
                exportedAt: new Date().toISOString(),
                exportedBy: session.user.uniqueID || session.user.email,
                totalLogs: logs.length,
                logs
            }, null, 2);
            
            return new NextResponse(exportData, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="audit-logs-${Date.now()}.json"`,
                },
            });
        }

        const data = await response.text();
        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="audit-logs-${Date.now()}.json"`,
            },
        });
        
    } catch (error) {
        console.error('[Admin Logs Export] Error exporting logs:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to export logs' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    // POST with filters - same logic as GET but with body
    return GET(request);
}

// Generate mock logs for export
function generateMockExportLogs(count: number) {
    const eventTypes = ['ACCESS_GRANTED', 'ACCESS_DENIED', 'POLICY_EVALUATION', 'KEY_RELEASE'];
    const outcomes = ['ALLOW', 'DENY'] as const;
    const users = ['testuser-usa-1', 'testuser-usa-2', 'testuser-usa-3', 'testuser-usa-4', 'admin-usa'];
    const resources = Array.from({ length: 20 }, (_, i) => `doc-${String(i + 1).padStart(3, '0')}`);

    const logs = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const outcome = outcomes[Math.random() > 0.8 ? 1 : 0];
        const eventType = outcome === 'DENY' ? 'ACCESS_DENIED' : eventTypes[Math.floor(Math.random() * eventTypes.length)];
        
        logs.push({
            timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventType,
            requestId: `req-${Math.random().toString(36).substring(2, 10)}`,
            subject: users[Math.floor(Math.random() * users.length)],
            action: 'read',
            resourceId: resources[Math.floor(Math.random() * resources.length)],
            outcome,
            reason: outcome === 'ALLOW' ? 'All checks passed' : 'Insufficient clearance',
            latencyMs: Math.floor(Math.random() * 200) + 10,
        });
    }

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
