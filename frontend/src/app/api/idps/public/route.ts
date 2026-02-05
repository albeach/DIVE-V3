import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { getBackendUrl } from '@/lib/api-utils';

export const runtime = 'nodejs';

/**
 * Load CA certificates for TLS verification (mkcert / dev CA).
 * Same pattern as backend health.service.ts: trust the CA, never disable verification.
 * Paths: Docker mount, NODE_EXTRA_CA_CERTS, local dev, repo certs.
 */
function loadCACertificates(): Buffer[] | undefined {
  const caPaths = [
    '/app/certs/ca/rootCA.pem',
    process.env.NODE_EXTRA_CA_CERTS,
    path.join(process.cwd(), 'certs', 'ca', 'rootCA.pem'),
    path.join(process.cwd(), '..', 'certs', 'mkcert', 'rootCA.pem'),
  ].filter(Boolean) as string[];

  const loaded: Buffer[] = [];
  for (const caPath of caPaths) {
    try {
      if (fs.existsSync(caPath)) {
        loaded.push(fs.readFileSync(caPath));
        break; // one CA sufficient
      }
    } catch {
      // skip
    }
  }
  return loaded.length > 0 ? loaded : undefined;
}

const caCertificates = loadCACertificates();

/** HTTPS agent that trusts mkcert CA when CA file is available; otherwise Node uses default (system + NODE_EXTRA_CA_CERTS). */
const httpsAgent =
  caCertificates
    ? new https.Agent({
      ca: caCertificates,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    })
    : undefined;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  // Use dynamic backend URL resolution (supports multi-domain deployment)
  const backendUrl = getBackendUrl();

  const target = `${backendUrl}/api/idps/public`;

  // Debug logging (only in development)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[api/idps/public] Backend URL resolution:', {
      BACKEND_URL: process.env.BACKEND_URL || '(not set)',
      NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || '(not set)',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '(not set)',
      resolved: backendUrl,
      target,
      hasHttpsAgent: !!httpsAgent,
      hasCACerts: !!caCertificates,
    });
  }

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
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/idps/public] proxy error', {
      error: errorMessage,
      target,
      backendUrl,
      env: {
        BACKEND_URL: process.env.BACKEND_URL || '(not set)',
        NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || '(not set)',
      },
    });
    return NextResponse.json(
      {
        error: 'IdP fetch failed',
        message: errorMessage,
        details: process.env.NODE_ENV !== 'production' ? { target, backendUrl } : undefined,
      },
      { status: 502 }
    );
  }
}

async function proxyRequest(urlStr: string): Promise<{ status: number; body: any }> {
  const urlObj = new URL(urlStr);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  const requestOptions: https.RequestOptions | http.RequestOptions = {
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: `${urlObj.pathname}${urlObj.search}`,
    method: 'GET',
    timeout: 5000,
  };
  if (isHttps && httpsAgent) {
    (requestOptions as https.RequestOptions).agent = httpsAgent;
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(
      requestOptions,
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
      const hostname = urlObj.hostname;
      const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      let diagnostic = `Backend connection failed: ${err.message}`;

      if (err.message.includes('ECONNREFUSED')) {
        diagnostic += `. Connection refused to ${hostname}:${port}. `;
        diagnostic += `Check: 1) Backend service is running (docker ps), `;
        diagnostic += `2) BACKEND_URL matches your compose service name (e.g. backend-fra for FRA, backend for hub), `;
        diagnostic += `3) Services are on the same Docker network.`;
      } else if (err.message.includes('ENOTFOUND')) {
        diagnostic += `. Hostname ${hostname} not found. Check BACKEND_URL matches your Docker service name.`;
      } else {
        diagnostic += `. Target: ${urlStr}`;
      }

      reject(new Error(diagnostic));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Backend request timeout. Is the backend running at ${urlStr}?`));
    });

    req.end();
  });
}
