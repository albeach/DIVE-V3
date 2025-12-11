import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Simple Health Check Endpoint for Kubernetes Probes
 * 
 * This endpoint does NOT require authentication and is used by:
 * - Kubernetes liveness probes
 * - Kubernetes readiness probes
 * 
 * Returns 200 OK if the Next.js application is running.
 */
export async function GET() {
    return NextResponse.json(
        { 
            status: 'ok',
            service: 'dive-v3-frontend',
            timestamp: new Date().toISOString()
        },
        { status: 200 }
    );
}








