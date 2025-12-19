import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

export const runtime = 'nodejs';

// Allow self-signed certs in local/dev (spoke stacks use mkcert)
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://localhost:4000';

  const target = `${backendUrl}/api/idps/public`;

  try {
    const { status, body } = await proxyRequest(target);
    if (status < 200 || status >= 300) {
      return NextResponse.json(
        { error: 'Failed to fetch IdPs', status },
        { status }
      );
    }
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error('[api/idps/public] proxy error', err);
    return NextResponse.json(
      {
        error: 'IdP fetch failed',
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
            reject(parseErr);
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}
