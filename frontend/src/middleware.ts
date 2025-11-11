import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge Middleware for Security Headers
 * 
 * NOTE: Edge Runtime CANNOT use auth() with database adapter  
 * (postgres-js requires Node.js 'net' module which Edge Runtime doesn't support)
 * 
 * Authentication/authorization is handled by:
 * 1. NextAuth route handlers (run in Node.js runtime, CAN access database)
 * 2. authorized() callback in auth.ts (called by route handlers, NOT middleware)
 * 3. Server components checking auth() in layouts/pages
 * 
 * This middleware ONLY sets security headers (CSP, etc.)
 */
export function middleware(req: NextRequest) {
    const response = NextResponse.next();

    // Content Security Policy
    const keycloakBaseUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://localhost:8443';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://localhost:4000';

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com", // Allow Cloudflare analytics
        `style-src 'self' 'unsafe-inline'`,
        "img-src 'self' data: https:",
        `font-src 'self'`,
        // Allow Cloudflare tunnel domains and Cloudflare Access
        `connect-src 'self' ${keycloakBaseUrl} ${apiUrl} https://localhost:8443 https://localhost:4000 https://dive25.cloudflareaccess.com https://*.dive25.com`,
        `frame-src 'self' ${keycloakBaseUrl}`,
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);

    return response;
}

export const config = {
    // Apply to all routes except static files and most API routes
    // BUT include /api/auth routes that need CSP for iframe embedding
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};

