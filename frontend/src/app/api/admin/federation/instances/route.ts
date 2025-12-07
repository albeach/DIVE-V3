/**
 * Federation Instances API Route
 * 
 * Phase 1: Federation Discovery & Health
 * 
 * Server-side route that returns detailed information about
 * all federation instances including stats and status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Federation instance configuration
const FEDERATION_INSTANCES = [
  {
    code: 'USA',
    name: 'United States',
    type: 'hub' as const,
    country: 'USA',
    flag: '🇺🇸',
    endpoints: {
      app: process.env.USA_APP_URL || 'https://usa-app.dive25.com',
      api: process.env.USA_API_URL || 'https://usa-api.dive25.com',
      idp: process.env.USA_IDP_URL || 'https://usa-idp.dive25.com',
    },
  },
  {
    code: 'FRA',
    name: 'France',
    type: 'spoke' as const,
    country: 'FRA',
    flag: '🇫🇷',
    endpoints: {
      app: process.env.FRA_APP_URL || 'https://fra-app.dive25.com',
      api: process.env.FRA_API_URL || 'https://fra-api.dive25.com',
      idp: process.env.FRA_IDP_URL || 'https://fra-idp.dive25.com',
    },
  },
  {
    code: 'GBR',
    name: 'United Kingdom',
    type: 'spoke' as const,
    country: 'GBR',
    flag: '🇬🇧',
    endpoints: {
      app: process.env.GBR_APP_URL || 'https://gbr-app.dive25.com',
      api: process.env.GBR_API_URL || 'https://gbr-api.dive25.com',
      idp: process.env.GBR_IDP_URL || 'https://gbr-idp.dive25.com',
    },
  },
  {
    code: 'DEU',
    name: 'Germany',
    type: 'spoke' as const,
    country: 'DEU',
    flag: '🇩🇪',
    endpoints: {
      app: process.env.DEU_APP_URL || 'https://deu-app.prosecurity.biz',
      api: process.env.DEU_API_URL || 'https://deu-api.prosecurity.biz',
      idp: process.env.DEU_IDP_URL || 'https://deu-idp.prosecurity.biz',
    },
  },
];

interface IInstanceStats {
  activeUsers: number;
  recentDecisions: number;
  resourceCount: number;
  lastActivity: string;
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
      // Return estimated stats based on health response
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
    
    // Fetch stats for all instances in parallel
    const instancesWithStats = await Promise.all(
      FEDERATION_INSTANCES.map(async (instance) => {
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
          federationStatus: 'approved' as const, // All configured instances are approved
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


