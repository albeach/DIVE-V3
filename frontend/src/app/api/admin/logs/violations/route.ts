/**
 * Admin Logs Violations API Route
 * 
 * Returns security violations (ACCESS_DENIED events)
 * Proxies to backend or returns mock data for development
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
        const limit = searchParams.get('limit') || '50';
        
        const backendUrl = `${BACKEND_URL}/api/admin/logs/violations?limit=${limit}`;
        
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
            // Return mock violations for development
            console.warn('[Admin Violations] Backend returned error, using mock data:', response.status);
            return NextResponse.json({
                success: true,
                data: {
                    violations: generateMockViolations(parseInt(limit)),
                    total: parseInt(limit)
                },
                requestId: `mock-${Date.now()}`
            });
        }

        const data = await response.json();
        return NextResponse.json(data);
        
    } catch (error) {
        console.error('[Admin Violations] Error fetching violations:', error);
        
        // Return mock data for development when backend is unavailable
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        
        return NextResponse.json({
            success: true,
            data: {
                violations: generateMockViolations(limit),
                total: limit
            },
            requestId: `mock-${Date.now()}`
        });
    }
}

// Generate mock security violations for development/demo
function generateMockViolations(count: number) {
    const users = [
        'testuser-usa-1', 'testuser-usa-2', 'testuser-fra-1', 
        'testuser-gbr-1', 'testuser-bel-1', 'unknown-user'
    ];
    const resources = Array.from({ length: 30 }, (_, i) => `doc-${String(i + 1).padStart(3, '0')}`);
    const reasons = [
        'Insufficient clearance level: User has CONFIDENTIAL, resource requires SECRET',
        'Country not in releasability list: FRA not in [USA, GBR, CAN]',
        'COI membership required: User lacks NATO-COSMIC clearance',
        'Resource embargo active: Cannot access before 2025-01-01',
        'Authentication failed: Invalid or expired token',
        'Rate limit exceeded: Too many requests from IP',
        'Clearance level insufficient: UNCLASSIFIED user accessing SECRET resource',
        'Country restriction: User country DEU not authorized for this resource',
    ];
    
    const clearanceLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    const resourceClassifications = ['CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    const countries = ['USA', 'FRA', 'GBR', 'CAN', 'DEU', 'BEL'];

    const violations = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const userCountry = countries[Math.floor(Math.random() * countries.length)];
        const userClearance = clearanceLevels[Math.floor(Math.random() * 2)]; // Lower clearances
        const resourceClass = resourceClassifications[Math.floor(Math.random() * resourceClassifications.length)];
        
        violations.push({
            timestamp: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            eventType: 'ACCESS_DENIED',
            requestId: `req-${Math.random().toString(36).substring(2, 10)}`,
            subject: users[Math.floor(Math.random() * users.length)],
            action: 'read',
            resourceId: resources[Math.floor(Math.random() * resources.length)],
            outcome: 'DENY' as const,
            reason: reasons[Math.floor(Math.random() * reasons.length)],
            latencyMs: Math.floor(Math.random() * 50) + 5,
            severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
            subjectAttributes: {
                clearance: userClearance,
                countryOfAffiliation: userCountry,
                acpCOI: Math.random() > 0.5 ? ['NATO'] : [],
            },
            resourceAttributes: {
                classification: resourceClass,
                releasabilityTo: ['USA', 'GBR', 'CAN'].slice(0, Math.floor(Math.random() * 3) + 1),
                COI: Math.random() > 0.7 ? ['NATO-COSMIC'] : [],
            },
            policyEvaluation: {
                clearanceCheck: userClearance < resourceClass ? 'FAIL' : 'PASS',
                countryCheck: ['USA', 'GBR', 'CAN'].includes(userCountry) ? 'PASS' : 'FAIL',
                coiCheck: Math.random() > 0.5 ? 'PASS' : 'FAIL',
            },
            context: {
                ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                sourceInstance: ['USA', 'FRA', 'GBR'][Math.floor(Math.random() * 3)],
            }
        });
    }

    // Sort by timestamp descending (most recent first)
    return violations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
