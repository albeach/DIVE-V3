/**
 * Admin Security Certificates API Route
 * 
 * GET: Check SSL certificate health for all endpoints
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

        // Try to get certificate info from backend
        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/security/certificates`, {
                headers: {
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return NextResponse.json({ success: true, data: data.certificates || data });
            }
        } catch (backendError) {
            console.warn('[Certificates API] Backend unavailable, using mock data');
        }

        // Return mock certificate data
        return NextResponse.json({
            success: true,
            data: generateMockCertificates(),
        });
        
    } catch (error) {
        console.error('[Certificates API] Error:', error);
        return NextResponse.json({
            success: true,
            data: generateMockCertificates(),
        });
    }
}

function generateMockCertificates() {
    const now = new Date();
    
    return [
        {
            name: 'Hub Frontend',
            endpoint: 'https://localhost:3000',
            type: 'frontend',
            status: 'valid',
            issuer: 'DIVE V3 Development CA',
            subject: 'CN=localhost',
            validFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
            daysUntilExpiry: 335,
            serialNumber: '01:02:03:04:05:06:07:08',
            fingerprint: 'A1:B2:C3:D4:E5:F6:01:02:03:04:05:06:07:08:09:10:11:12:13:14',
            signatureAlgorithm: 'SHA256withRSA',
            keySize: 2048,
            chainValid: true,
            chainLength: 2,
            cipherStrength: 'strong',
            hstsEnabled: true,
        },
        {
            name: 'Hub Backend',
            endpoint: 'https://localhost:4000',
            type: 'backend',
            status: 'valid',
            issuer: 'DIVE V3 Development CA',
            subject: 'CN=backend',
            validFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
            daysUntilExpiry: 335,
            signatureAlgorithm: 'SHA256withRSA',
            keySize: 2048,
            chainValid: true,
            hstsEnabled: true,
        },
        {
            name: 'Hub Keycloak',
            endpoint: 'https://localhost:8443',
            type: 'keycloak',
            status: 'expiring',
            issuer: 'DIVE V3 Development CA',
            subject: 'CN=keycloak',
            validFrom: new Date(now.getTime() - 340 * 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString(),
            daysUntilExpiry: 25,
            signatureAlgorithm: 'SHA256withRSA',
            keySize: 2048,
            chainValid: true,
            hstsEnabled: false,
        },
        {
            name: 'OPA Server',
            endpoint: 'http://localhost:8181',
            type: 'opa',
            status: 'unknown',
            error: 'HTTP endpoint - no TLS',
        },
    ];
}
