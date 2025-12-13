import { handlers } from "@/auth";
import { NextRequest } from "next/server";

type INextAuthRouteContext = { params: { nextauth?: string[] } };

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
    fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'L1',location:'api/auth/[...nextauth]/route.ts:GET',message:'NextAuth handler invoked (request/env snapshot)',data:{method:'GET',path:request.nextUrl.pathname,host:request.headers.get('host'),xForwardedHost:request.headers.get('x-forwarded-host'),xForwardedProto:request.headers.get('x-forwarded-proto'),referer:request.headers.get('referer'),envNextAuthUrl:process.env.NEXTAUTH_URL??null,envAuthUrl:(process.env as Record<string, string | undefined>).AUTH_URL??null,envAuthTrustHost:process.env.AUTH_TRUST_HOST??null,hasAuthSecret:!!process.env.AUTH_SECRET,hasNextAuthSecret:!!process.env.NEXTAUTH_SECRET,authKeycloakIssuer:(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ISSUER??null,keycloakIssuer:process.env.KEYCLOAK_ISSUER??null,nextPublicBaseUrl:process.env.NEXT_PUBLIC_BASE_URL??null,nextPublicKeycloakRealm:process.env.NEXT_PUBLIC_KEYCLOAK_REALM??null,keycloakRealm:process.env.KEYCLOAK_REALM??null,authKeycloakId:(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ID??null,hasAuthKeycloakSecret:!!(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_SECRET},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    try {
        const handlersGet = handlers.GET as unknown as (req: NextRequest, ctx: unknown) => Promise<Response> | Response;
        return await handlersGet(request, context);
    } catch (err) {
        const e = err instanceof Error ? err : new Error('Unknown NextAuth GET error');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'L1',location:'api/auth/[...nextauth]/route.ts:GET:catch',message:'NextAuth handler threw (sanitized)',data:{name:e.name,message:e.message,stack:(e.stack||'').split('\n').slice(0,8).join('\n')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        throw err;
    }
}

export async function POST(request: NextRequest, context: INextAuthRouteContext) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'L1',location:'api/auth/[...nextauth]/route.ts:POST',message:'NextAuth handler invoked (request/env snapshot)',data:{method:'POST',path:request.nextUrl.pathname,host:request.headers.get('host'),xForwardedHost:request.headers.get('x-forwarded-host'),xForwardedProto:request.headers.get('x-forwarded-proto'),referer:request.headers.get('referer'),envNextAuthUrl:process.env.NEXTAUTH_URL??null,envAuthUrl:(process.env as Record<string, string | undefined>).AUTH_URL??null,envAuthTrustHost:process.env.AUTH_TRUST_HOST??null,hasAuthSecret:!!process.env.AUTH_SECRET,hasNextAuthSecret:!!process.env.NEXTAUTH_SECRET,authKeycloakIssuer:(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ISSUER??null,keycloakIssuer:process.env.KEYCLOAK_ISSUER??null,nextPublicBaseUrl:process.env.NEXT_PUBLIC_BASE_URL??null,nextPublicKeycloakRealm:process.env.NEXT_PUBLIC_KEYCLOAK_REALM??null,keycloakRealm:process.env.KEYCLOAK_REALM??null,authKeycloakId:(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_ID??null,hasAuthKeycloakSecret:!!(process.env as Record<string, string | undefined>).AUTH_KEYCLOAK_SECRET},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    try {
        const handlersPost = handlers.POST as unknown as (req: NextRequest, ctx: unknown) => Promise<Response> | Response;
        return await handlersPost(request, context);
    } catch (err) {
        const e = err instanceof Error ? err : new Error('Unknown NextAuth POST error');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'L1',location:'api/auth/[...nextauth]/route.ts:POST:catch',message:'NextAuth handler threw (sanitized)',data:{name:e.name,message:e.message,stack:(e.stack||'').split('\n').slice(0,8).join('\n')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        throw err;
    }
}


