import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge Middleware for Security Headers
 * 
 * NOTE: Database sessions cannot use auth() in middleware (Edge runtime limitation)
 * Authentication/authorization handled by authorized() callback in auth.ts
 * This middleware only sets security headers (CSP, etc.)
 */
export function middleware(req: NextRequest) {
    const response = NextResponse.next();

    // Content Security Policy
    const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8081';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        `connect-src 'self' ${keycloakBaseUrl} ${apiUrl}`,
        `frame-src 'self' ${keycloakBaseUrl}`,
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);

    return response;
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

