import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

export const runtime = 'nodejs';

/**
 * GET /api/idps/[alias]/health - Proxy IdP health check endpoint
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { alias: string } }
): Promise<NextResponse> {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://localhost:4000';

  const { alias } = params;
  const target = `${backendUrl}/api/idps/${alias}/health`;

  try {
    const { status, body } = await proxyRequest(target);
    return NextResponse.json(body, { status });
  } catch (err) {
    console.error(`[api/idps/${alias}/health] proxy error`, err);
    return NextResponse.json(
      {
        success: false,
        healthy: false,
        degraded: false,
        alias,
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}

async function proxyRequest(urlStr: string): Promise<{ status: number; body: any }> {
  const urlObj = new URL(urlStr);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 3000, // 3 second timeout
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode || 500;
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status, body: parsed });
          } catch (parseErr) {
            reject(new Error(`Failed to parse response: ${parseErr}`));
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}
