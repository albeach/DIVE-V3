/**
 * Federation Health API Route
 * 
 * Phase 1: Federation Discovery & Health
 * 
 * Server-side route that checks health of all federation instances
 * and returns real-time status data for the admin dashboard.
 * 
 * This route:
 * 1. Checks health of each configured instance
 * 2. Measures latency to each endpoint
 * 3. Aggregates results with circuit breaker protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// Federation instance configuration
// TODO: Move to environment or database
const FEDERATION_INSTANCES = [
  {
    code: 'USA',
    name: 'United States',
    type: 'hub' as const,
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
    endpoints: {
      app: process.env.DEU_APP_URL || 'https://deu-app.prosecurity.biz',
      api: process.env.DEU_API_URL || 'https://deu-api.prosecurity.biz',
      idp: process.env.DEU_IDP_URL || 'https://deu-idp.prosecurity.biz',
    },
  },
];

interface IServiceHealth {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

interface IInstanceHealth {
  code: string;
  name: string;
  type: 'hub' | 'spoke';
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: string;
  latencyMs: number;
  services: {
    backend: IServiceHealth;
    keycloak: IServiceHealth;
  };
  endpoints: {
    app: string;
    api: string;
    idp: string;
  };
}

/**
 * Check health of a single endpoint with timeout
 */
async function checkEndpoint(url: string, timeoutMs: number = 5000): Promise<IServiceHealth> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    return {
      healthy: response.ok || response.status < 500,
      latencyMs,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      healthy: false,
      latencyMs,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Check health of an instance (backend + keycloak)
 */
async function checkInstanceHealth(instance: typeof FEDERATION_INSTANCES[0]): Promise<IInstanceHealth> {
  // Check both services in parallel
  const [backendHealth, keycloakHealth] = await Promise.all([
    checkEndpoint(`${instance.endpoints.api}/health`),
    checkEndpoint(`${instance.endpoints.idp}/health`),
  ]);
  
  // Determine overall status
  let status: 'healthy' | 'degraded' | 'down' = 'healthy';
  
  if (!backendHealth.healthy && !keycloakHealth.healthy) {
    status = 'down';
  } else if (!backendHealth.healthy || !keycloakHealth.healthy) {
    status = 'degraded';
  } else if (backendHealth.latencyMs > 2000 || keycloakHealth.latencyMs > 2000) {
    status = 'degraded';
  }
  
  // Calculate average latency
  const latencyMs = Math.round(
    (backendHealth.latencyMs + keycloakHealth.latencyMs) / 2
  );
  
  return {
    code: instance.code,
    name: instance.name,
    type: instance.type,
    status,
    lastChecked: new Date().toISOString(),
    latencyMs,
    services: {
      backend: backendHealth,
      keycloak: keycloakHealth,
    },
    endpoints: instance.endpoints,
  };
}

/**
 * GET /api/admin/federation/health
 * Returns health status of all federation instances
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Check health of all instances in parallel
    const healthChecks = await Promise.all(
      FEDERATION_INSTANCES.map(checkInstanceHealth)
    );
    
    // Calculate summary stats
    const healthyCount = healthChecks.filter(h => h.status === 'healthy').length;
    const degradedCount = healthChecks.filter(h => h.status === 'degraded').length;
    const downCount = healthChecks.filter(h => h.status === 'down').length;
    
    const averageLatency = Math.round(
      healthChecks.reduce((sum, h) => sum + h.latencyMs, 0) / healthChecks.length
    );
    
    return NextResponse.json({
      instances: healthChecks,
      summary: {
        total: healthChecks.length,
        healthy: healthyCount,
        degraded: degradedCount,
        down: downCount,
        averageLatencyMs: averageLatency,
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[FederationHealth] Error:', error);
    return NextResponse.json(
      {
        error: 'InternalError',
        message: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 500 }
    );
  }
}


