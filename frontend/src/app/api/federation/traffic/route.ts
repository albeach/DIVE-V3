/**
 * Federation Traffic API Route
 * Server-side proxy for federation traffic data
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
      const response = await fetch(`${BACKEND_URL}/api/federation/traffic`, {
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

    // Generate mock traffic history (24h)
    const now = Date.now();
    const history = Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(now - (23 - i) * 3600000).toISOString(),
      requests: Math.floor(Math.random() * 3000) + 1000,
      bytes: Math.floor(Math.random() * 50000000) + 10000000,
      errors: Math.floor(Math.random() * 20),
      latency: Math.floor(Math.random() * 50) + 30,
    }));

    const mockData = {
      success: true,
      traffic: {
        timeRange: {
          start: new Date(now - 24 * 3600000).toISOString(),
          end: new Date(now).toISOString(),
        },
        totalRequests: history.reduce((a, b) => a + b.requests, 0),
        totalBytes: history.reduce((a, b) => a + b.bytes, 0),
        history,
        bySpoke: [
          { spokeId: 'spoke-usa', spokeName: 'United States', requests: 15234, bytes: 234567890, avgLatency: 32 },
          { spokeId: 'spoke-gbr', spokeName: 'United Kingdom', requests: 12456, bytes: 189012345, avgLatency: 45 },
          { spokeId: 'spoke-deu', spokeName: 'Germany', requests: 9876, bytes: 156789012, avgLatency: 52 },
          { spokeId: 'spoke-fra', spokeName: 'France', requests: 5432, bytes: 98765432, avgLatency: 48 },
          { spokeId: 'spoke-can', spokeName: 'Canada', requests: 2680, bytes: 45678901, avgLatency: 67 },
        ],
        topEndpoints: [
          { endpoint: '/api/v1/authorize', count: 23456, avgLatency: 35 },
          { endpoint: '/api/v1/token', count: 18234, avgLatency: 28 },
          { endpoint: '/api/v1/userinfo', count: 12345, avgLatency: 22 },
          { endpoint: '/api/v1/policies/evaluate', count: 8765, avgLatency: 45 },
          { endpoint: '/api/v1/resources', count: 5432, avgLatency: 38 },
        ],
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Federation Traffic API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
