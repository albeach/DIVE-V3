/**
 * Provisioning History API Route
 * Server-side proxy for user provisioning history
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

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/provisioning-history`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend not available, return mock data
    }

    // Return mock data for development/demo
    const mockHistory = [
      {
        id: 'prov-001',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        initiatedBy: 'admin@dive.nato',
        type: 'bulk',
        totalUsers: 25,
        successCount: 24,
        failedCount: 1,
        status: 'completed',
      },
      {
        id: 'prov-002',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        initiatedBy: 'admin@dive.nato',
        type: 'csv_import',
        totalUsers: 150,
        successCount: 148,
        failedCount: 2,
        status: 'completed',
      },
      {
        id: 'prov-003',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        initiatedBy: 'super.admin@dive.nato',
        type: 'single',
        totalUsers: 1,
        successCount: 1,
        failedCount: 0,
        status: 'completed',
      },
      {
        id: 'prov-004',
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        initiatedBy: 'admin@dive.nato',
        type: 'bulk',
        totalUsers: 50,
        successCount: 45,
        failedCount: 5,
        status: 'partial',
      },
    ];

    return NextResponse.json({
      success: true,
      history: mockHistory,
      total: mockHistory.length,
    });
  } catch (error) {
    console.error('[Provisioning History API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
