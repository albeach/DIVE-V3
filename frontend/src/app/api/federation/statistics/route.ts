/**
 * Federation Statistics API Route
 * Server-side proxy for federation statistics
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
      const response = await fetch(`${BACKEND_URL}/api/federation/statistics`, {
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
    const mockData = {
      success: true,
      statistics: {
        totalSpokes: 5,
        activeSpokes: 4,
        totalRequests24h: 45678,
        successRate: 99.7,
        averageLatency: 45,
        peakLatency: 234,
        requestsBySpoke: {
          'spoke-usa': 15234,
          'spoke-gbr': 12456,
          'spoke-deu': 9876,
          'spoke-fra': 5432,
          'spoke-can': 2680,
        },
        latencyBySpoke: {
          'spoke-usa': 32,
          'spoke-gbr': 45,
          'spoke-deu': 52,
          'spoke-fra': 48,
          'spoke-can': 67,
        },
        errorsBySpoke: {
          'spoke-usa': 12,
          'spoke-gbr': 8,
          'spoke-deu': 23,
          'spoke-fra': 5,
          'spoke-can': 15,
        },
        trends: {
          requestsChange7d: 12.5,
          latencyChange7d: -8.3,
          errorRateChange7d: -15.2,
        },
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Federation Statistics API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
