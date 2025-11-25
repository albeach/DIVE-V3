import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge Middleware for Security Headers
 * 
 * ✅ SECURITY: Configurable CSP for secure/air-gapped environments
 * - No hard-coded third-party dependencies
 * - External domains only included when explicitly configured
 * - Suitable for classified networks and restricted environments
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

    // Content Security Policy - Secure by default
    // Read from environment variables (no hardcoded URLs)
    const keycloakBaseUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://localhost:8443';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
    
    // Optional: External analytics/monitoring (only in dev environments)
    const allowExternalAnalytics = process.env.NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS === 'true';
    const externalDomains = process.env.NEXT_PUBLIC_EXTERNAL_DOMAINS || '';

    // Build CSP directives
    const scriptSrc = [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Required for Next.js dev mode and some dynamic features
    ];
    
    // Only add external analytics in non-production or when explicitly enabled
    if (allowExternalAnalytics) {
        scriptSrc.push('https://static.cloudflareinsights.com');
    }

    // Build connect-src from environment variables only
    // Support both HTTP and HTTPS versions for local development
    const connectSrc = ["'self'"];
    
    // Add Keycloak URL (both HTTP and HTTPS versions for local dev)
    if (keycloakBaseUrl) {
        connectSrc.push(keycloakBaseUrl);
        if (keycloakBaseUrl.startsWith('https://')) {
            connectSrc.push(keycloakBaseUrl.replace('https://', 'http://'));
        } else if (keycloakBaseUrl.startsWith('http://')) {
            connectSrc.push(keycloakBaseUrl.replace('http://', 'https://'));
        }
    }
    
    // Add API URL (both HTTP and HTTPS versions for local dev)
    if (apiUrl) {
        connectSrc.push(apiUrl);
        if (apiUrl.startsWith('https://')) {
            connectSrc.push(apiUrl.replace('https://', 'http://'));
        } else if (apiUrl.startsWith('http://')) {
            connectSrc.push(apiUrl.replace('http://', 'https://'));
        }
    }

    // Add optional external domains if configured
    if (externalDomains) {
        connectSrc.push(...externalDomains.split(',').map(d => d.trim()).filter(Boolean));
    }

    const csp = [
        "default-src 'self'",
        `script-src ${scriptSrc.join(' ')}`,
        `style-src 'self' 'unsafe-inline'`, // Required for Tailwind and styled components
        "img-src 'self' data: blob:", // Allow inline images and data URIs
        `font-src 'self' data:`, // Self-hosted fonts only
        `connect-src ${connectSrc.join(' ')}`,
        `frame-src 'self' ${keycloakBaseUrl}`, // Allow Keycloak iframe for OIDC
        "object-src 'none'", // Block Flash, Java, etc.
        "base-uri 'self'", // Prevent base tag injection
        "form-action 'self'", // Prevent form submission to external domains
        "frame-ancestors 'none'", // Prevent clickjacking (use X-Frame-Options for broader support)
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);

    // Additional Security Headers
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    return response;
}

export const config = {
    // Apply to all routes except static files and most API routes
    // BUT include /api/auth routes that need CSP for iframe embedding
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};

