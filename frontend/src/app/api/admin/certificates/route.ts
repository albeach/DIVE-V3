/**
 * Admin Certificates API Route
 *
 * Proxies requests to the backend certificates endpoint.
 * GET - List all certificates with status and metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/admin/certificates${queryString ? `?${queryString}` : ''}`,
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
    const now = Date.now();
    const DAY = 86400000;

    const mockCertificates = [
      {
        id: 'cert-root-001',
        type: 'root' as const,
        subject: 'CN=DIVE Root CA, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Root CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:01',
        validFrom: new Date(now - 365 * DAY).toISOString(),
        validTo: new Date(now + 3650 * DAY).toISOString(),
        status: 'valid' as const,
        daysUntilExpiry: 3650,
        keySize: 4096,
        algorithm: 'RSA-4096',
        fingerprint: 'SHA256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        usages: ['digitalSignature', 'keyCertSign', 'cRLSign'],
      },
      {
        id: 'cert-int-001',
        type: 'intermediate' as const,
        subject: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Root CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:02',
        validFrom: new Date(now - 180 * DAY).toISOString(),
        validTo: new Date(now + 1825 * DAY).toISOString(),
        status: 'valid' as const,
        daysUntilExpiry: 1825,
        keySize: 4096,
        algorithm: 'RSA-4096',
        fingerprint: 'SHA256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        usages: ['digitalSignature', 'keyCertSign', 'cRLSign'],
      },
      {
        id: 'cert-tls-001',
        type: 'tls' as const,
        subject: 'CN=dive.example.com, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:03',
        validFrom: new Date(now - 60 * DAY).toISOString(),
        validTo: new Date(now + 305 * DAY).toISOString(),
        status: 'valid' as const,
        daysUntilExpiry: 305,
        keySize: 2048,
        algorithm: 'RSA-2048',
        fingerprint: 'SHA256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        usages: ['digitalSignature', 'keyEncipherment', 'serverAuth'],
      },
      {
        id: 'cert-tls-002',
        type: 'tls' as const,
        subject: 'CN=api.dive.example.com, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:04',
        validFrom: new Date(now - 350 * DAY).toISOString(),
        validTo: new Date(now + 15 * DAY).toISOString(),
        status: 'expiring_soon' as const,
        daysUntilExpiry: 15,
        keySize: 2048,
        algorithm: 'RSA-2048',
        fingerprint: 'SHA256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
        usages: ['digitalSignature', 'keyEncipherment', 'serverAuth'],
      },
      {
        id: 'cert-sign-001',
        type: 'signing' as const,
        subject: 'CN=DIVE Signing Key, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:05',
        validFrom: new Date(now - 90 * DAY).toISOString(),
        validTo: new Date(now + 275 * DAY).toISOString(),
        status: 'valid' as const,
        daysUntilExpiry: 275,
        keySize: 256,
        algorithm: 'ECDSA-P256',
        fingerprint: 'SHA256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        usages: ['digitalSignature', 'contentCommitment'],
      },
      {
        id: 'cert-tls-003',
        type: 'tls' as const,
        subject: 'CN=old.dive.example.com, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:06',
        validFrom: new Date(now - 400 * DAY).toISOString(),
        validTo: new Date(now - 35 * DAY).toISOString(),
        status: 'expired' as const,
        daysUntilExpiry: -35,
        keySize: 2048,
        algorithm: 'RSA-2048',
        fingerprint: 'SHA256:f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
        usages: ['digitalSignature', 'keyEncipherment', 'serverAuth'],
      },
      {
        id: 'cert-sign-002',
        type: 'signing' as const,
        subject: 'CN=DIVE Legacy Signing Key, O=DIVE Platform, C=US',
        issuer: 'CN=DIVE Intermediate CA, O=DIVE Platform, C=US',
        serialNumber: 'A1:B2:C3:D4:E5:F6:00:07',
        validFrom: new Date(now - 500 * DAY).toISOString(),
        validTo: new Date(now - 135 * DAY).toISOString(),
        status: 'revoked' as const,
        daysUntilExpiry: -135,
        keySize: 256,
        algorithm: 'ECDSA-P256',
        fingerprint: 'SHA256:a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3',
        usages: ['digitalSignature', 'contentCommitment'],
      },
    ];

    // Apply filters from search params
    let filtered = [...mockCertificates];

    const typeFilter = searchParams.get('type');
    if (typeFilter) {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }

    const statusFilter = searchParams.get('status');
    if (statusFilter) {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    return NextResponse.json({
      success: true,
      certificates: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('[Certificates API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
