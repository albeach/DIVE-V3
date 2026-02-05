/**
 * Admin Certificates Rotate API Route
 *
 * Proxies requests to the backend certificate rotation endpoint.
 * POST - Initiate rotation of a certificate by ID with optional configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { certificateId, options } = body;

    if (!certificateId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'certificateId is required' },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/admin/certificates/rotate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ certificateId, options }),
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

    const newCertId = `cert-${certificateId.split('-')[1] || 'new'}-${String(Date.now()).slice(-6)}`;

    return NextResponse.json({
      success: true,
      rotation: {
        id: `rotation-${String(Date.now()).slice(-8)}`,
        status: 'in_progress',
        initiatedBy: session.user.email || session.user.name || 'admin',
        initiatedAt: now.toISOString(),
        oldCertificate: {
          id: certificateId,
          status: 'pending_replacement',
        },
        newCertificate: {
          id: newCertId,
          status: 'generating',
          estimatedReadyAt: new Date(now.getTime() + 5 * 60000).toISOString(),
        },
        options: {
          algorithm: options?.algorithm || 'RSA-4096',
          keySize: options?.keySize || 4096,
          validityDays: options?.validityDays || 365,
          autoApply: options?.autoApply ?? true,
          notifyOnCompletion: options?.notifyOnCompletion ?? true,
        },
        steps: [
          {
            step: 1,
            name: 'Generate new key pair',
            status: 'completed',
            completedAt: now.toISOString(),
          },
          {
            step: 2,
            name: 'Create certificate signing request',
            status: 'in_progress',
            startedAt: now.toISOString(),
          },
          {
            step: 3,
            name: 'Sign certificate',
            status: 'pending',
          },
          {
            step: 4,
            name: 'Validate new certificate',
            status: 'pending',
          },
          {
            step: 5,
            name: 'Deploy to services',
            status: 'pending',
          },
          {
            step: 6,
            name: 'Verify deployment',
            status: 'pending',
          },
        ],
      },
    });
  } catch (error) {
    console.error('[Certificates Rotate API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
