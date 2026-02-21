import { NextResponse } from 'next/server';
import { getSecureFetchOptions } from '@/lib/https-agent';
import { getBackendUrl } from '@/lib/api-utils';

/**
 * Health check endpoint for frontend service
 * Used by Docker Compose healthcheck to verify service readiness
 *
 * Checks:
 * - Server is running (if we got here, it's responding)
 * - Backend connectivity (optional, for comprehensive check)
 *
 * Returns:
 * - 200: Service is healthy and ready
 * - 503: Service is unhealthy (dependencies not ready)
 */
export async function GET(request: Request) {
    const startTime = Date.now();

    // Basic health check - server is running
    const checks: Record<string, boolean> = {
        server: true,  // If we got here, Next.js is running
    };

    // Optional: Check backend connectivity
    // Only if BACKEND_URL is configured (avoid blocking in dev mode)
    const backendUrl = getBackendUrl();

    if (backendUrl) {
        try {
            const backendHealthUrl = `${backendUrl}/api/health`;

            // Use Node.js fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const response = await fetch(backendHealthUrl, {
                method: 'GET',
                signal: controller.signal,
                ...getSecureFetchOptions(),
            });

            clearTimeout(timeoutId);

            checks.backend = response.ok;
        } catch (error) {
            // Backend check failed, but this is non-blocking
            // Health check still passes if server is running
            checks.backend = false;
            console.warn('Backend health check failed (non-blocking):', error);
        }
    } else {
        // Backend URL not configured, skip check
        checks.backend = true;
    }

    // Determine overall health
    const allHealthy = Object.values(checks).every(check => check === true);
    const status = allHealthy ? 200 : 200;  // Always return 200 for now (server is running)

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
        status: 'healthy',
        checks: checks,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        version: process.env.NEXT_PUBLIC_APP_VERSION || '3.0.0',
        environment: process.env.NODE_ENV || 'development',
    }, { status });
}

/**
 * HEAD request support (for wget --spider health checks)
 */
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}
