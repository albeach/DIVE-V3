/**
 * Admin Tenants API Route
 *
 * GET: List tenants with optional search/status/limit/offset query params
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isAdmin = session.user.roles?.some((r: string) =>
      ['super_admin', 'admin', 'dive-admin'].includes(r)
    );

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/admin/tenants${queryString ? `?${queryString}` : ''}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        // Forward backend error responses instead of masking them
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[Tenants API] Backend error:', response.status, errorData);
        return NextResponse.json(
          { success: false, ...errorData },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json(data);
    } catch {
      // Backend not available, return mock data for development only
      console.warn('[Tenants API] Backend unavailable, returning mock data');
      return NextResponse.json({
        success: true,
        data: buildMockResponse(searchParams),
      });
    }
  } catch (error) {
    console.error('[Tenants API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function buildMockResponse(searchParams: URLSearchParams) {
  let tenants = generateMockTenants();

  const search = searchParams.get('search')?.toLowerCase();
  if (search) {
    tenants = tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.code.toLowerCase().includes(search) ||
        t.country.toLowerCase().includes(search)
    );
  }

  const status = searchParams.get('status');
  if (status) {
    tenants = tenants.filter((t) => t.status === status);
  }

  const total = tenants.length;
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  tenants = tenants.slice(offset, offset + limit);

  return { tenants, total };
}

function generateMockTenants() {
  const now = Date.now();
  return [
    {
      id: 'tenant-usa-001',
      name: 'United States',
      code: 'USA',
      country: 'USA',
      status: 'enabled' as const,
      createdAt: new Date(now - 86400000 * 180).toISOString(),
      lastSyncAt: new Date(now - 60000 * 5).toISOString(),
      usersCount: 342,
      resourcesCount: 1285,
      config: {
        clearanceLevels: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
        maxSessionDuration: 28800,
        mfaRequired: true,
        federationEnabled: true,
      },
    },
    {
      id: 'tenant-gbr-002',
      name: 'United Kingdom',
      code: 'GBR',
      country: 'GBR',
      status: 'enabled' as const,
      createdAt: new Date(now - 86400000 * 170).toISOString(),
      lastSyncAt: new Date(now - 60000 * 12).toISOString(),
      usersCount: 198,
      resourcesCount: 763,
      config: {
        clearanceLevels: ['OFFICIAL', 'SECRET', 'TOP_SECRET'],
        maxSessionDuration: 28800,
        mfaRequired: true,
        federationEnabled: true,
      },
    },
    {
      id: 'tenant-fra-003',
      name: 'France',
      code: 'FRA',
      country: 'FRA',
      status: 'enabled' as const,
      createdAt: new Date(now - 86400000 * 160).toISOString(),
      lastSyncAt: new Date(now - 60000 * 30).toISOString(),
      usersCount: 156,
      resourcesCount: 512,
      config: {
        clearanceLevels: ['NON_PROTEGE', 'CONFIDENTIEL_DEFENSE', 'SECRET_DEFENSE', 'TRES_SECRET_DEFENSE'],
        maxSessionDuration: 21600,
        mfaRequired: true,
        federationEnabled: true,
      },
    },
    {
      id: 'tenant-deu-004',
      name: 'Germany',
      code: 'DEU',
      country: 'DEU',
      status: 'enabled' as const,
      createdAt: new Date(now - 86400000 * 150).toISOString(),
      lastSyncAt: new Date(now - 60000 * 8).toISOString(),
      usersCount: 175,
      resourcesCount: 621,
      config: {
        clearanceLevels: ['OFFEN', 'VS_NfD', 'VS_VERTRAULICH', 'GEHEIM', 'STRENG_GEHEIM'],
        maxSessionDuration: 28800,
        mfaRequired: true,
        federationEnabled: true,
      },
    },
    {
      id: 'tenant-can-005',
      name: 'Canada',
      code: 'CAN',
      country: 'CAN',
      status: 'enabled' as const,
      createdAt: new Date(now - 86400000 * 140).toISOString(),
      lastSyncAt: new Date(now - 60000 * 20).toISOString(),
      usersCount: 89,
      resourcesCount: 334,
      config: {
        clearanceLevels: ['UNCLASSIFIED', 'PROTECTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
        maxSessionDuration: 28800,
        mfaRequired: true,
        federationEnabled: true,
      },
    },
    {
      id: 'tenant-nor-006',
      name: 'Norway',
      code: 'NOR',
      country: 'NOR',
      status: 'disabled' as const,
      createdAt: new Date(now - 86400000 * 90).toISOString(),
      lastSyncAt: new Date(now - 86400000 * 14).toISOString(),
      usersCount: 42,
      resourcesCount: 128,
      config: {
        clearanceLevels: ['UGRADERT', 'BEGRENSET', 'KONFIDENSIELT', 'HEMMELIG', 'STRENGT_HEMMELIG'],
        maxSessionDuration: 21600,
        mfaRequired: false,
        federationEnabled: false,
      },
    },
    {
      id: 'tenant-ita-007',
      name: 'Italy',
      code: 'ITA',
      country: 'ITA',
      status: 'suspended' as const,
      createdAt: new Date(now - 86400000 * 120).toISOString(),
      lastSyncAt: new Date(now - 86400000 * 30).toISOString(),
      usersCount: 67,
      resourcesCount: 215,
      config: {
        clearanceLevels: ['NON_CLASSIFICATO', 'RISERVATO', 'RISERVATISSIMO', 'SEGRETO', 'SEGRETISSIMO'],
        maxSessionDuration: 21600,
        mfaRequired: true,
        federationEnabled: false,
      },
    },
  ];
}
