/**
 * OpenAPI Specification Proxy Route
 *
 * Proxies the OpenAPI spec from the backend to avoid CORS issues
 * and provides server-side caching.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';

    const response = await fetch(`${backendUrl}/api-docs/json`, {
      headers: {
        'Accept': 'application/json',
      },
      // Disable Next.js fetch cache to always get fresh spec
      cache: 'no-store',
      // Allow self-signed certs in development
      // @ts-ignore - Node.js specific option
      rejectUnauthorized: false,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch OpenAPI spec' },
        { status: response.status }
      );
    }

    const spec = await response.json();

    return NextResponse.json(spec, {
      headers: {
        // Short cache in development, longer in production
        'Cache-Control': process.env.NODE_ENV === 'production'
          ? 'public, max-age=300' // 5 minutes in production
          : 'no-cache, no-store, must-revalidate', // No cache in development
      },
    });
  } catch (error) {
    console.error('OpenAPI proxy error:', error);

    // Return a minimal spec on error
    return NextResponse.json({
      openapi: '3.0.3',
      info: {
        title: 'DIVE V3 API',
        version: '1.0.0',
        description: 'API documentation temporarily unavailable. Please try again later.',
      },
      paths: {},
    }, {
      status: 503,
    });
  }
}
