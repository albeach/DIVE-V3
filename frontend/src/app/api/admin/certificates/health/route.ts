/**
 * Admin Certificates Health API Route
 *
 * Proxies requests to the backend certificate health dashboard endpoint.
 * GET - Retrieve overall certificate health status, counts, alerts, and recommendations
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.roles?.some((r: string) =>
      ['super_admin', 'admin', 'dive-admin'].includes(r)
    );
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/admin/certificates/health`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          cache: 'no-store',
        }
      );

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }

      // Forward backend error responses instead of masking them
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(errorData, { status: response.status });
    } catch {
      // Backend not available, fall through to mock data
    }

    // Mock data for development / demo when backend is unavailable
    const now = new Date();
    const DAY = 86400000;

    return NextResponse.json({
      success: true,
      overallStatus: 'warning',
      lastCheck: now.toISOString(),
      certificates: {
        total: 7,
        valid: 4,
        expiringSoon: 1,
        expired: 1,
        revoked: 1,
      },
      nextExpiry: {
        certificateId: 'cert-tls-002',
        subject: 'CN=api.dive.example.com, O=DIVE Platform, C=US',
        type: 'tls',
        validTo: new Date(now.getTime() + 15 * DAY).toISOString(),
        daysUntilExpiry: 15,
      },
      alerts: [
        {
          id: 'alert-001',
          severity: 'warning',
          message: 'TLS certificate for api.dive.example.com expires in 15 days',
          certificateId: 'cert-tls-002',
          createdAt: new Date(now.getTime() - 2 * DAY).toISOString(),
        },
        {
          id: 'alert-002',
          severity: 'critical',
          message: 'TLS certificate for old.dive.example.com has expired',
          certificateId: 'cert-tls-003',
          createdAt: new Date(now.getTime() - 35 * DAY).toISOString(),
        },
        {
          id: 'alert-003',
          severity: 'info',
          message: 'Legacy signing key cert-sign-002 was revoked and should be removed from configuration',
          certificateId: 'cert-sign-002',
          createdAt: new Date(now.getTime() - 60 * DAY).toISOString(),
        },
      ],
      recommendations: [
        {
          id: 'rec-001',
          priority: 'high',
          title: 'Rotate expiring TLS certificate',
          description:
            'Certificate cert-tls-002 for api.dive.example.com expires in 15 days. Initiate rotation immediately to avoid service disruption.',
          action: 'rotate',
          certificateId: 'cert-tls-002',
        },
        {
          id: 'rec-002',
          priority: 'medium',
          title: 'Remove expired certificate',
          description:
            'Certificate cert-tls-003 for old.dive.example.com expired 35 days ago. Remove it from the certificate store to reduce clutter.',
          action: 'remove',
          certificateId: 'cert-tls-003',
        },
        {
          id: 'rec-003',
          priority: 'low',
          title: 'Clean up revoked certificate',
          description:
            'Certificate cert-sign-002 (DIVE Legacy Signing Key) has been revoked. Ensure no services reference this certificate and remove it.',
          action: 'remove',
          certificateId: 'cert-sign-002',
        },
        {
          id: 'rec-004',
          priority: 'low',
          title: 'Consider upgrading key sizes',
          description:
            'Some TLS certificates use RSA-2048. Consider upgrading to RSA-4096 or ECDSA-P384 for improved security posture.',
          action: 'upgrade',
          certificateId: null,
        },
      ],
    });
  } catch (error) {
    console.error('[Certificates Health API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
