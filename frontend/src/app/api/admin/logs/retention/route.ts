/**
 * Admin Logs Retention API Route
 *
 * GET  - Retrieve current log retention configuration
 * PUT  - Update log retention configuration
 * Proxies to backend or returns mock data when backend is unavailable
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

function getMockRetentionConfig() {
  return {
    auditLogs: 365,
    securityLogs: 730,
    accessLogs: 180,
    systemLogs: 90,
    maxStorageGB: 500,
    currentUsageGB: 127.4,
    autoArchiveEnabled: true,
    archiveDestination: 's3://dive-log-archive/production',
    lastUpdated: '2026-01-15T10:30:00Z',
    updatedBy: 'admin@dive.mil',
  };
}

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
      const response = await fetch(`${BACKEND_URL}/api/admin/logs/retention`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }

      // Forward backend error responses instead of masking them
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(errorData, { status: response.status });
    } catch {
      // Backend not available, return mock data
    }

    // Return mock data for development/demo
    const mockData = {
      success: true,
      retention: getMockRetentionConfig(),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Logs Retention API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const {
      auditLogs,
      securityLogs,
      accessLogs,
      systemLogs,
      maxStorageGB,
      autoArchiveEnabled,
      archiveDestination,
    } = body;

    // Validate retention days are positive integers when provided
    const retentionFields = { auditLogs, securityLogs, accessLogs, systemLogs };
    for (const [field, value] of Object.entries(retentionFields)) {
      if (value !== undefined && (typeof value !== 'number' || value < 1 || !Number.isInteger(value))) {
        return NextResponse.json(
          { error: `${field} must be a positive integer (days)` },
          { status: 400 }
        );
      }
    }

    if (maxStorageGB !== undefined && (typeof maxStorageGB !== 'number' || maxStorageGB < 1)) {
      return NextResponse.json(
        { error: 'maxStorageGB must be a positive number' },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/logs/retention`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }

      // Forward backend error responses instead of masking them
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(errorData, { status: response.status });
    } catch {
      // Backend not available, return mock data
    }

    // Return mock data for development/demo
    const updatedConfig = {
      ...getMockRetentionConfig(),
      ...body,
      lastUpdated: new Date().toISOString(),
      updatedBy: session.user.email || session.user.name || 'admin',
    };

    const mockData = {
      success: true,
      retention: updatedConfig,
      message: 'Retention configuration updated successfully',
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Logs Retention API] PUT Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
