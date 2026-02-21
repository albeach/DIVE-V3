import { handlers } from "@/auth";
import { NextRequest } from "next/server";

// Next.js 15+ requires Promise-wrapped params
type INextAuthRouteContext = { params: Promise<{ nextauth?: string[] }> };

/**
 * NextAuth v5 Route Handlers
 *
 * CRITICAL: NextAuth v5 uses NEXTAUTH_URL per official documentation
 * This must match the NEXTAUTH_URL environment variable set in docker-compose.yml
 *
 * Environment Variables Required:
 * - NEXTAUTH_URL: Base URL for NextAuth (e.g., https://dev-app.dive25.com)
 * - AUTH_SECRET: Secret for encrypting cookies and tokens
 * - AUTH_TRUST_HOST: Set to "true" for custom domains
 */

// Debug logging to diagnose configuration issues
const nextauthUrl = process.env.NEXTAUTH_URL;

console.log('[NextAuth Route Handler] Configuration check:', {
    NEXTAUTH_URL: nextauthUrl,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    timestamp: new Date().toISOString(),
});

// Validate NEXTAUTH_URL is set
if (!nextauthUrl) {
    console.error('[NextAuth Route Handler] ❌ ERROR: NEXTAUTH_URL is not set! NextAuth will fail.');
}

export async function GET(request: NextRequest, context: INextAuthRouteContext) {
    // #region agent log
    console.log('[DEBUG H1] NextAuth GET handler invoked:', {
        path: request.nextUrl.pathname,
        searchParams: Array.from(request.nextUrl.searchParams.entries()),
        host: request.headers.get('host'),
        referer: request.headers.get('referer'),
        envNextAuthUrl: process.env.NEXTAUTH_URL,
        envAuthKeycloakIssuer: (process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ISSUER,
        envAuthKeycloakId: (process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ID,
        hasAuthKeycloakSecret: !!(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_SECRET,
        timestamp: Date.now()
    });
    // #endregion

    try {
        const handlersGet = handlers.GET as unknown as (req: NextRequest, ctx: unknown) => Promise<Response> | Response;
        return await handlersGet(request, context);
    } catch (err) {
        const e = err instanceof Error ? err : new Error('Unknown NextAuth GET error');
        // #region agent log
        console.error('[DEBUG H1] NextAuth GET handler threw:', {
            name: e.name,
            message: e.message,
            stack: (e.stack || '').split('\n').slice(0, 8).join('\n')
        });
        // #endregion
        throw err;
    }
}

export async function POST(request: NextRequest, context: INextAuthRouteContext) {
    // #region agent log
    console.log('[DEBUG H1] NextAuth POST handler invoked:', {
        path: request.nextUrl.pathname,
        searchParams: Array.from(request.nextUrl.searchParams.entries()),
        host: request.headers.get('host'),
        referer: request.headers.get('referer'),
        contentType: request.headers.get('content-type'),
        envNextAuthUrl: process.env.NEXTAUTH_URL,
        envAuthKeycloakIssuer: (process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ISSUER,
        timestamp: Date.now()
    });
    // #endregion

    try {
        const handlersPost = handlers.POST as unknown as (req: NextRequest, ctx: unknown) => Promise<Response> | Response;
        return await handlersPost(request, context);
    } catch (err) {
        const e = err instanceof Error ? err : new Error('Unknown NextAuth POST error');
        // #region agent log
        console.error('[DEBUG H1] NextAuth POST handler threw:', {
            name: e.name,
            message: e.message,
            stack: (e.stack || '').split('\n').slice(0, 8).join('\n')
        });
        // #endregion
        throw err;
    }
}
