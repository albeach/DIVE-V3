/**
 * Admin Logs Export API Route
 *
 * POST - Export audit/security/access logs in specified format (csv/json/pdf)
 * Proxies to backend or returns mock data when backend is unavailable
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
    const { format, dateRange, filters } = body;

    if (!format || !['csv', 'json', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Must be one of: csv, json, pdf' },
        { status: 400 }
      );
    }

    if (!dateRange?.start || !dateRange?.end) {
      return NextResponse.json(
        { error: 'dateRange with start and end is required' },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/logs/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ format, dateRange, filters }),
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
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const mockData = {
      success: true,
      export: {
        id: exportId,
        format,
        status: 'completed',
        dateRange,
        filters: filters || null,
        totalRecords: 1247,
        fileSize: format === 'pdf' ? '2.4 MB' : format === 'csv' ? '856 KB' : '1.1 MB',
        downloadUrl: `/api/admin/logs/export/download/${exportId}.${format}`,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdBy: session.user.email || session.user.name || 'admin',
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Logs Export API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
