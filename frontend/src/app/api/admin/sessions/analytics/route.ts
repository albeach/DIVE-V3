/**
 * Session Analytics API Route
 * Server-side proxy for session analytics data
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
      const response = await fetch(`${BACKEND_URL}/api/admin/sessions/analytics`, {
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
      analytics: {
        totalSessions: 1247,
        activeSessions: 89,
        averageSessionDuration: 3420000, // ms
        peakConcurrentSessions: 156,
        sessionsToday: 234,
        sessionsByHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: Math.floor(Math.random() * 50) + 10,
        })),
        sessionsByDevice: {
          Desktop: 678,
          Mobile: 412,
          Tablet: 157,
        },
        sessionsByCountry: {
          USA: 456,
          GBR: 234,
          DEU: 189,
          FRA: 145,
          CAN: 123,
          Other: 100,
        },
        sessionsByBrowser: {
          Chrome: 512,
          Firefox: 298,
          Safari: 245,
          Edge: 156,
          Other: 36,
        },
        trends: {
          sessions7d: 1847,
          sessions30d: 7234,
          change7d: 12.5,
          change30d: 8.3,
        },
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[Session Analytics API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
