import { handlers } from "@/auth";

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

export const { GET, POST } = handlers;


