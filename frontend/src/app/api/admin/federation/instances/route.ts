/**
 * Federation Instances API Route
 * 
 * Phase 1: Federation Discovery & Health
 * 
 * Server-side route that DYNAMICALLY fetches federation instances
 * from the backend's federation-registry.json via the API.
 * 
 * This ensures instances are never hardcoded and new spokes
 * are automatically discovered.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Backend API URL - uses internal Docker network or localhost
const BACKEND_API_URL = process.env.BACKEND_URL || 'https://localhost:4000';

interface IFederationInstance {
  code: string;
  name: string;
  type: 'hub' | 'spoke';
  country: string;
  flag: string;
  locale?: string;
  endpoints: {
    app: string;
    api: string;
    idp: string;
  };
  federationStatus: 'approved' | 'pending' | 'suspended';
}

interface IInstanceStats {
  activeUsers: number;
  recentDecisions: number;
  resourceCount: number;
  lastActivity: string | null;
}

/**
 * Fetch federation instances dynamically from backend
 */
async function fetchFederationInstances(): Promise<IFederationInstance[]> {
  try {
    // Fetch from backend's dynamic instances endpoint
    const response = await fetch(`${BACKEND_API_URL}/api/federation/instances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`[FederationInstances] Backend returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.instances || [];
  } catch (error) {
    console.error('[FederationInstances] Failed to fetch from backend:', error);
    return [];
  }
}

/**
 * Fetch stats from an instance's backend API
 */
async function fetchInstanceStats(
  apiUrl: string,
  accessToken?: string
): Promise<IInstanceStats | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Try to fetch stats from the backend
    const response = await fetch(`${apiUrl}/api/federation/stats`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (response.ok) {
      return await response.json();
    }

    // Fallback: try health endpoint for basic info
    const healthResponse = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (healthResponse.ok) {
      return {
        activeUsers: 0,
        recentDecisions: 0,
        resourceCount: 0,
        lastActivity: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    console.error(`[FederationInstances] Failed to fetch stats from ${apiUrl}:`, error);
    return null;
  }
}

/**
 * GET /api/admin/federation/instances
 * Returns detailed information about all federation instances
 * DYNAMICALLY loaded from backend's federation-registry.json
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get access token for backend requests
    let accessToken: string | undefined;
    try {
      const accountResults = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, session.user.id))
        .limit(1);

      accessToken = accountResults[0]?.access_token || undefined;
    } catch (dbError) {
      console.warn('[FederationInstances] Could not get access token:', dbError);
    }

    // DYNAMIC: Fetch instances from backend's federation-registry
    const federationInstances = await fetchFederationInstances();

    if (federationInstances.length === 0) {
      console.warn('[FederationInstances] No instances found - check backend connectivity');
    }

    // Fetch stats for all instances in parallel
    const instancesWithStats = await Promise.all(
      federationInstances.map(async (instance) => {
        const stats = await fetchInstanceStats(instance.endpoints.api, accessToken);

        return {
          code: instance.code,
          name: instance.name,
          type: instance.type,
          country: instance.country,
          flag: instance.flag,
          endpoints: instance.endpoints,
          stats: stats || {
            activeUsers: 0,
            recentDecisions: 0,
            resourceCount: 0,
            lastActivity: null,
          },
          federationStatus: instance.federationStatus || 'approved',
        };
      })
    );

    // Calculate totals
    const totalStats = instancesWithStats.reduce(
      (acc, inst) => ({
        totalUsers: acc.totalUsers + (inst.stats.activeUsers || 0),
        totalDecisions: acc.totalDecisions + (inst.stats.recentDecisions || 0),
        totalResources: acc.totalResources + (inst.stats.resourceCount || 0),
      }),
      { totalUsers: 0, totalDecisions: 0, totalResources: 0 }
    );

    return NextResponse.json({
      instances: instancesWithStats,
      totals: totalStats,
      timestamp: new Date().toISOString(),
      source: 'dynamic', // Indicates instances were fetched dynamically
    });

  } catch (error) {
    console.error('[FederationInstances] Error:', error);
    return NextResponse.json(
      {
        error: 'InternalError',
        message: error instanceof Error ? error.message : 'Failed to fetch instances',
      },
      { status: 500 }
    );
  }
}
