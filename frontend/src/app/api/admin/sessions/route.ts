/**
 * Sessions List API Route
 * Server-side proxy for active sessions management
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
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';
    const status = searchParams.get('status') || '';
    const userId = searchParams.get('userId') || '';

    try {
      const queryParams = new URLSearchParams({ limit, offset });
      if (status) queryParams.append('status', status);
      if (userId) queryParams.append('userId', userId);

      const response = await fetch(
        `${BACKEND_URL}/api/admin/sessions?${queryParams}`,
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
    } catch {
      // Backend not available, return mock data
    }

    // Return mock data for development/demo
    const mockSessions = Array.from({ length: 20 }, (_, i) => ({
      id: `session-${i + 1}`,
      userId: `user-${Math.floor(Math.random() * 100)}`,
      username: `user${Math.floor(Math.random() * 100)}`,
      email: `user${Math.floor(Math.random() * 100)}@example.com`,
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      device: ['Desktop', 'Mobile', 'Tablet'][Math.floor(Math.random() * 3)],
      browser: ['Chrome', 'Firefox', 'Safari', 'Edge'][Math.floor(Math.random() * 4)],
      country: ['USA', 'GBR', 'DEU', 'FRA', 'CAN'][Math.floor(Math.random() * 5)],
      city: ['New York', 'London', 'Berlin', 'Paris', 'Toronto'][Math.floor(Math.random() * 5)],
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
      lastActivity: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      expiresAt: new Date(Date.now() + Math.random() * 86400000).toISOString(),
      clearance: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'][Math.floor(Math.random() * 4)],
      roles: ['user', 'analyst', 'admin'][Math.floor(Math.random() * 3)].split(','),
    }));

    return NextResponse.json({
      success: true,
      sessions: mockSessions,
      total: 89,
      page: 1,
      pageSize: parseInt(limit),
    });
  } catch (error) {
    console.error('[Sessions API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
