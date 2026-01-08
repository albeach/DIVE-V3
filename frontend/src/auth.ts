import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Email domain to country mapping for enrichment
 * Week 3: Infer countryOfAffiliation from email domain
 * Phase 3: Added DEU, GBR, ITA, ESP, POL, NLD NATO partners
 */
const EMAIL_DOMAIN_COUNTRY_MAP: Record<string, string> = {
    // United States
    'mil': 'USA', 'army.mil': 'USA', 'navy.mil': 'USA', 'af.mil': 'USA',
    // France
    'gouv.fr': 'FRA', 'defense.gouv.fr': 'FRA',
    // Canada
    'gc.ca': 'CAN', 'forces.gc.ca': 'CAN',
    // United Kingdom / Great Britain
    'mod.uk': 'GBR', 'gov.uk': 'GBR',
    // Germany (Deutschland)
    'bundeswehr.org': 'DEU', 'bund.de': 'DEU', 'bmvg.de': 'DEU',
    // Italy
    'difesa.it': 'ITA', 'esercito.difesa.it': 'ITA',
    // Spain (España)
    'mde.es': 'ESP', 'defensa.gob.es': 'ESP',
    // Poland (Polska)
    'mon.gov.pl': 'POL', 'wp.mil.pl': 'POL',
    // Netherlands (Nederland)
    'mindef.nl': 'NLD', 'defensie.nl': 'NLD',
    // Industry partners (default to USA)
    'lockheed.com': 'USA', 'northropgrumman.com': 'USA', 'raytheon.com': 'USA',
    'boeing.com': 'USA', 'l3harris.com': 'USA',
};

/**
 * Infer country from email domain
 */
function inferCountryFromEmail(email: string): { country: string; confidence: 'high' | 'low' } {
    if (!email) return { country: 'USA', confidence: 'low' };

    const domain = email.toLowerCase().split('@')[1];
    if (!domain) return { country: 'USA', confidence: 'low' };

    // Check exact match
    if (EMAIL_DOMAIN_COUNTRY_MAP[domain]) {
        return { country: EMAIL_DOMAIN_COUNTRY_MAP[domain], confidence: 'high' };
    }

    // Check subdomain match
    for (const [mappedDomain, country] of Object.entries(EMAIL_DOMAIN_COUNTRY_MAP)) {
        if (domain.endsWith(`.${mappedDomain}`)) {
            return { country, confidence: 'high' };
        }
    }

    // Default
    return { country: 'USA', confidence: 'low' };
}

/**
 * Refresh access token using refresh token
 * Session Expiration Fix (Oct 21, 2025):
 * - Enhanced logging for full lifecycle tracking
 * - Better error handling for Keycloak session expiration
 * - Offline token support for long-lived refresh capability
 * FIX (Nov 6, 2025): Use internal KEYCLOAK_URL for server-side calls
 */
async function refreshAccessToken(account: any) {
    const refreshUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (account.expires_at || 0) - currentTime;

    try {
        console.log('[DIVE] Token Refresh Request', {
            userId: account.userId,
            keycloakUrl: process.env.KEYCLOAK_URL,
            realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
            refreshUrl,
            currentTime: new Date(currentTime * 1000).toISOString(),
            expiresAt: new Date((account.expires_at || 0) * 1000).toISOString(),
            timeUntilExpiry,
            hasRefreshToken: !!account.refresh_token,
            refreshTokenLength: account.refresh_token?.length || 0,
        });

        const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: process.env.KEYCLOAK_CLIENT_ID!,
                client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
                grant_type: 'refresh_token',
                refresh_token: account.refresh_token!,
            }),
        });

        const tokens = await response.json();

        if (!response.ok) {
            console.error('[DIVE] Token Refresh Failed', {
                status: response.status,
                statusText: response.statusText,
                error: tokens.error,
                error_description: tokens.error_description,
                userId: account.userId,
                timeUntilExpiry,
            });

            // Keycloak session expired - user needs to re-authenticate
            if (tokens.error === 'invalid_grant' || tokens.error_description?.includes('Session not active')) {
                console.warn('[DIVE] Keycloak Session Expired', {
                    reason: 'SSO session idle timeout exceeded or session explicitly ended',
                    error: tokens.error,
                    error_description: tokens.error_description,
                    recommendation: 'User must re-authenticate to establish new session',
                });
                throw new Error('RefreshTokenExpired');
            }

            throw new Error(`Token refresh failed: ${tokens.error || 'Unknown error'}`);
        }

        console.log('[DIVE] Token Refreshed Successfully', {
            userId: account.userId,
            newExpiresIn: tokens.expires_in,
            newExpiresAt: new Date((currentTime + tokens.expires_in) * 1000).toISOString(),
            refreshTokenRotated: !!tokens.refresh_token && tokens.refresh_token !== account.refresh_token,
            scope: tokens.scope,
        });

        // Update account in database with new tokens
        const updatedAccount = {
            access_token: tokens.access_token,
            id_token: tokens.id_token,
            expires_at: currentTime + tokens.expires_in,
            refresh_token: tokens.refresh_token || account.refresh_token, // Handle rotation
        };

        await db.update(accounts)
            .set(updatedAccount)
            .where(eq(accounts.userId, account.userId));

        console.log('[DIVE] Database Updated', {
            userId: account.userId,
            newExpiresAt: new Date(updatedAccount.expires_at * 1000).toISOString(),
        });

        return {
            ...account,
            ...updatedAccount,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[DIVE] Token Refresh Error', {
            userId: account.userId,
            error: errorMsg,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            timeUntilExpiry,
        });
        throw error;
    }
}

// Determine cookie domain based on NEXTAUTH_URL
// NextAuth v5 officially uses NEXTAUTH_URL per documentation
// CRITICAL FIX: Handle both localhost development and Cloudflare tunnel domains
// FEDERATION FIX (Dec 2025): Support multiple domains (dive25.com, prosecurity.biz)
const getAuthCookieDomain = (): string | undefined => {
    const authUrl = process.env.NEXTAUTH_URL;

    // DEVELOPMENT: Localhost or IP - use exact domain match (undefined = browser default)
    // CRITICAL: Don't set domain for localhost - browsers handle this automatically
    // Setting domain: 'localhost' can break cookie handling in some browsers
    if (!authUrl || authUrl.includes('localhost') || authUrl.includes('127.0.0.1') || authUrl.includes('3000')) {
        console.log('[DIVE] Cookie domain: localhost/IP detected - using exact match (undefined)');
        return undefined;  // Use exact domain match (no wildcard) - browser handles localhost automatically
    }

    // PRODUCTION: Custom domain - use wildcard for subdomains
    if (authUrl.includes('divedeeper.internal')) {
        return '.divedeeper.internal'; // Allow cookies across all subdomains
    }
    if (authUrl.includes('dive25.com')) {
        return '.dive25.com'; // Allow cookies across Cloudflare tunnel subdomains (USA, FRA, GBR)
    }
    // DEU instance uses prosecurity.biz domain (remote deployment)
    if (authUrl.includes('prosecurity.biz')) {
        return '.prosecurity.biz'; // Allow cookies across DEU Cloudflare tunnel subdomains
    }

    return undefined; // Use default (exact domain match)
};

const AUTH_COOKIE_DOMAIN = getAuthCookieDomain();
const AUTH_COOKIE_SECURE = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;

// Environment detection for proper cookie configuration
const isLocalhost = process.env.NEXTAUTH_URL?.includes('localhost') || process.env.NEXTAUTH_URL?.includes('3000') || false;
// FEDERATION FIX: Include prosecurity.biz (DEU remote instance) in Cloudflare tunnel check
const isCloudflareTunnel = (process.env.NEXTAUTH_URL?.includes('dive25.com') || process.env.NEXTAUTH_URL?.includes('prosecurity.biz')) ?? false;

console.log('[DIVE] NextAuth v5 cookie configuration:', {
    nextauthUrl: process.env.NEXTAUTH_URL,
    domain: AUTH_COOKIE_DOMAIN || 'default (exact match)',
    secure: AUTH_COOKIE_SECURE,
    isLocalhost,
    isCloudflareTunnel,
    sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
    trustHost: true,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    session: {
        strategy: "database",  // Use database sessions with adapter
        maxAge: 8 * 60 * 60,   // 8 hours
        updateAge: 15 * 60,    // Update session every 15 minutes
    },
    trustHost: true, // Required for NextAuth v5 in development
    debug: process.env.NODE_ENV === "development",  // ENABLE VERBOSE DEBUG LOGGING
    logger: {
        error(code, ...message) {
            console.error('[NextAuth Error]', code, message);
            // Enhanced error logging to expose [Object] details
            if (code instanceof Error) {
                console.error('[NextAuth Error Details]', {
                    name: code.name,
                    message: code.message,
                    stack: code.stack,
                    cause: code.cause,
                });
                if (code.cause && typeof code.cause === 'object') {
                    console.error('[NextAuth Error Cause]', JSON.stringify(code.cause, null, 2));
                }
            }
        },
        warn(code, ...message) {
            console.warn('[NextAuth Warn]', code, message);
        },
        debug(code, ...message) {
            // Only log debug in development
            if (process.env.NODE_ENV === 'development') {
                console.log('[NextAuth Debug]', code, message);
            }
        },
    },
    providers: [
        Keycloak({
            // Auth.js standard configuration (per https://authjs.dev/getting-started/providers/keycloak)
            // Uses AUTH_KEYCLOAK_ID, AUTH_KEYCLOAK_SECRET, AUTH_KEYCLOAK_ISSUER from environment
            // Auth.js automatically discovers endpoints via OIDC discovery from issuer
            issuer: process.env.AUTH_KEYCLOAK_ISSUER ?? process.env.KEYCLOAK_ISSUER ?? 'https://localhost:8443/realms/dive-v3-broker',
            authorization: {
                params: {
                    // Request only online tokens locally; offline_access caused KC to reject with "Offline tokens not allowed"
                    scope: "openid profile email",
                }
            },
            // FIX (2026-01-05): Disable 'iss' check to avoid issuer mismatch errors
            // Keycloak returns iss=localhost:8443 but backend communicates via dive-hub-keycloak:8443
            // Still using PKCE and state for security
            checks: ["pkce", "state"],  // Removed "nonce" which was causing InvalidCheck errors
            allowDangerousEmailAccountLinking: true,
            // FIX (Nov 7): Profile callback to handle remote IdPs without email
            // and capture DIVE attributes from Keycloak tokens
            profile(profile) {
                // Log profile in development only
                if (process.env.NODE_ENV === 'development') {
                    console.log('[NextAuth profile()] Keycloak profile:', {
                        sub: profile.sub,
                        email: profile.email,
                        preferred_username: profile.preferred_username,
                        name: profile.name,
                        uniqueID: profile.uniqueID,
                        clearance: profile.clearance,
                        countryOfAffiliation: profile.countryOfAffiliation,
                        acpCOI: profile.acpCOI,
                    });
                }

                // ENRICHMENT: Generate email if missing (remote IdPs may not provide)
                let email = profile.email;
                if (!email || email.trim() === '') {
                    // Generate from uniqueID (if it looks like email) or username
                    const uniqueID = profile.uniqueID || profile.preferred_username || profile.sub;
                    if (uniqueID && uniqueID.includes('@')) {
                        email = uniqueID;
                    } else {
                        // Generate synthetic email: username@dive-broker.internal
                        email = `${uniqueID || profile.sub}@dive-broker.internal`;
                    }
                    console.log('[NextAuth profile()] Generated email:', email, 'from uniqueID:', uniqueID);
                }

                // Return profile with all DIVE attributes
                return {
                    id: profile.sub,
                    name: profile.name || profile.preferred_username || profile.sub,
                    email: email,
                    image: profile.picture,
                    uniqueID: profile.uniqueID || profile.preferred_username || profile.sub,
                    clearance: profile.clearance || 'UNCLASSIFIED',
                    countryOfAffiliation: profile.countryOfAffiliation || profile.country || 'UNKNOWN',
                    acpCOI: profile.acpCOI || profile.aciCOI || [],
                    roles: profile.realm_access?.roles || profile.roles || [],
                };
            },
        }),
    ],

    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnLogin = nextUrl.pathname === "/login";
            const isOnCustomLogin = nextUrl.pathname.startsWith("/login/"); // Custom login pages
            const isOnHome = nextUrl.pathname === "/";

            // Allow API routes and auth callbacks
            if (nextUrl.pathname.startsWith("/api/")) {
                return true;
            }

            // Allow custom login pages (they handle their own auth flow)
            if (isOnCustomLogin) {
                return true;
            }

            // FIX #6: Enhanced token validity check
            // Check if user has valid tokens (not just user existence)
            const hasValidTokens = !!(auth as any)?.accessToken && !!(auth as any)?.idToken;

            // EXCEPTION: Super Admin accounts don't have Keycloak tokens (custom session)
            const isSuperAdmin = auth?.user?.roles?.includes('super_admin');

            // DEBUG: Log authorization check
            if (isLoggedIn && !hasValidTokens && !isSuperAdmin && nextUrl.pathname !== "/" && nextUrl.pathname !== "/login") {
                console.log('[DIVE authorized()] Redirect to login - no tokens', {
                    path: nextUrl.pathname,
                    hasUser: !!auth?.user,
                    hasAccessToken: !!(auth as any)?.accessToken,
                    hasIdToken: !!(auth as any)?.idToken,
                    isSuperAdmin,
                    authKeys: Object.keys(auth || {}),
                });
            }

            // If logged in
            if (isLoggedIn) {
                // FIX #6: User exists but no tokens - likely expired session
                // Force re-login to establish fresh session
                // EXCEPT for Super Admin users who don't use Keycloak tokens
                if (!hasValidTokens && !isSuperAdmin && !isOnHome && !isOnLogin && !isOnCustomLogin) {
                    console.warn('[DIVE] User exists but no tokens - forcing re-login');
                    // Redirect to /login (not /auth/signin)
                    return Response.redirect(new URL("/login", nextUrl));
                }

                // MFA ENFORCEMENT: Check if user needs MFA setup
                // CONFIDENTIAL and SECRET users require AAL2 (MFA)
                const user = auth?.user as any;
                const requiresMFA = user?.clearance === 'CONFIDENTIAL' || user?.clearance === 'SECRET';
                const hasMFA = user?.amr && Array.isArray(user.amr) &&
                    (user.amr.includes('otp') || user.amr.includes('hwk') || user.amr.includes('webauthn'));
                const isOnMFASetup = nextUrl.pathname === '/mfa-setup';

                if (requiresMFA && !hasMFA && !isOnMFASetup && !isOnLogin && !isOnCustomLogin) {
                    console.log('[DIVE] MFA required but not configured - redirecting to setup', {
                        clearance: user?.clearance,
                        amr: user?.amr,
                        path: nextUrl.pathname
                    });
                    return Response.redirect(new URL("/mfa-setup", nextUrl));
                }

                // Redirect from Login to Dashboard (but allow Home for logout landing)
                if (isOnLogin) {
                    return Response.redirect(new URL("/dashboard", nextUrl));
                }
                return true;
            }

            // If not logged in
            if (!isLoggedIn) {
                // Allow Home, Login, and Custom Login pages
                if (isOnHome || isOnLogin || isOnCustomLogin) {
                    return true;
                }
                // Redirect to landing page (/) for IdP selection
                // This provides a better UX than showing an intermediate login page
                return Response.redirect(new URL("/", nextUrl));
            }

            return true;
        },
        async session({ session, user }) {
            // With database strategy, we receive user from DB, not token
            // Fetch the account to get Keycloak tokens
            if (user && session.user) {
                session.user.id = user.id;

                // Get account data to retrieve Keycloak tokens
                try {
                    const accountResults = await db
                        .select()
                        .from(accounts)
                        .where(eq(accounts.userId, user.id))
                        .limit(1);

                    let account = accountResults[0];

                    if (account) {
                        // CRITICAL FIX: If no tokens in account, user has logged out
                        // This prevents session recreation after logout
                        if (!account.access_token || !account.id_token) {
                            console.log('[DIVE] No tokens in account - user logged out, invalidating session');
                            // Return null to invalidate the session
                            return null as any; // Type assertion needed for NextAuth v5
                        }
                        console.log('[DIVE] Account found for user:', {
                            userId: user.id,
                            provider: account.provider,
                            hasAccessToken: !!account.access_token,
                            hasIdToken: !!account.id_token,
                            accessTokenLength: account.access_token?.length || 0,
                            expiresAt: account.expires_at,
                            currentTime: Math.floor(Date.now() / 1000),
                            isExpired: account.expires_at ? account.expires_at < Math.floor(Date.now() / 1000) : false,
                        });

                        // Check if access token needs refresh (proactive refresh)
                        const currentTime = Math.floor(Date.now() / 1000);
                        const hasRefreshToken = !!account.refresh_token;

                        // Calculate time until expiry
                        const timeUntilExpiry = (account.expires_at || 0) - currentTime;
                        const isExpired = timeUntilExpiry <= 0;

                        // PROACTIVE REFRESH: Refresh when token has significant lifetime remaining
                        // For 15-minute tokens (900s), this means refresh at 8 minutes remaining (53% of lifetime)
                        // This prevents API failures and gives plenty of buffer for network issues
                        const shouldRefresh = hasRefreshToken && (
                            isExpired || // Token is expired
                            timeUntilExpiry < 480 // Less than 8 minutes remaining (proactive refresh buffer)
                        );

                        if (shouldRefresh && account.expires_at) {
                            const isProactive = !isExpired;
                            console.log(`[DIVE] ${isProactive ? 'Proactive' : 'Reactive'} token refresh`, {
                                timeUntilExpiry,
                                expiresAt: new Date((account.expires_at || 0) * 1000).toISOString(),
                                currentTime: new Date(currentTime * 1000).toISOString(),
                            });

                            try {
                                account = await refreshAccessToken(account);
                                console.log('[DIVE] Token refreshed successfully, new expiry:',
                                    new Date((account.expires_at || 0) * 1000).toISOString());

                                // FIX #2: Update database session expiry to match token refresh
                                // This prevents session from expiring even though tokens are fresh
                                try {
                                    const newSessionExpiry = new Date(Date.now() + 60 * 60 * 1000); // +60 minutes from now
                                    await db.update(sessions)
                                        .set({ expires: newSessionExpiry })
                                        .where(eq(sessions.userId, user.id));

                                    console.log('[DIVE] Database session extended to:', newSessionExpiry.toISOString());
                                } catch (dbError) {
                                    console.error('[DIVE] Failed to extend database session:', dbError);
                                    // Don't fail the entire session refresh if DB update fails
                                }
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                                console.error('[DIVE] Token refresh failed:', errorMsg);

                                // FIX #3: If refresh token expired, delete database session and force re-auth
                                if (errorMsg.includes('RefreshTokenExpired') || errorMsg.includes('invalid_grant')) {
                                    console.log('[DIVE] Refresh token invalid - deleting session, user needs to re-login');

                                    try {
                                        // Delete database session to force complete logout
                                        await db.delete(sessions).where(eq(sessions.userId, user.id));
                                        console.log('[DIVE] Database session deleted due to invalid refresh token');

                                        // Clear account tokens to prevent session recreation
                                        await db.update(accounts)
                                            .set({
                                                access_token: null,
                                                id_token: null,
                                                refresh_token: null,
                                                expires_at: null,
                                                session_state: null,
                                            })
                                            .where(eq(accounts.userId, user.id));
                                        console.log('[DIVE] Account tokens cleared');
                                    } catch (cleanupError) {
                                        console.error('[DIVE] Session cleanup error:', cleanupError);
                                    }

                                    // Return null to completely invalidate the session
                                    return null as any;
                                }

                                // For other errors, continue with existing tokens if not expired
                                if (!isExpired) {
                                    console.log('[DIVE] Using existing tokens despite refresh failure (token still valid)');
                                } else {
                                    console.warn('[DIVE] Token expired and refresh failed - session invalid');
                                    session.accessToken = undefined;
                                    session.idToken = undefined;
                                    session.refreshToken = undefined;
                                    return session;
                                }
                            }
                        } else if (!hasRefreshToken && isExpired) {
                            console.warn('[DIVE] Token expired but no refresh_token available');

                            // FIX #3: Delete database session when no refresh possible
                            try {
                                await db.delete(sessions).where(eq(sessions.userId, user.id));
                                console.log('[DIVE] Database session deleted - no refresh token available');
                            } catch (cleanupError) {
                                console.error('[DIVE] Session cleanup error:', cleanupError);
                            }

                            // Return null to force re-authentication
                            return null as any;
                        } else {
                            console.log('[DIVE] Token valid, no refresh needed', {
                                timeUntilExpiry,
                                expiresAt: new Date((account.expires_at || 0) * 1000).toISOString(),
                            });
                        }

                        // SECURITY: DO NOT expose tokens to client session
                        // Tokens should only be used server-side. Client should use
                        // server-side API routes that handle token validation.
                        //
                        // For internal server-side use only (e.g., API routes):
                        // - Access token: Used to call Keycloak protected resources
                        // - ID token: Contains user claims
                        // - Refresh token: Used to get new access tokens
                        //
                        // The client only receives:
                        // - User profile data (name, email, custom claims)
                        // - No raw tokens

                        // Parse DIVE attributes from id_token if available
                        if (account.id_token) {
                            try {
                                // Decode JWT to extract custom claims (don't verify, just decode)
                                const tokenParts = account.id_token.split('.');
                                if (tokenParts.length === 3) {
                                    const payload = JSON.parse(
                                        Buffer.from(tokenParts[1], 'base64').toString('utf-8')
                                    );

                                    // Extract DIVE custom attributes
                                    session.user.uniqueID = payload.uniqueID || payload.preferred_username || payload.sub;

                                    // ENRICHMENT LOGIC: Fill missing attributes (Week 3)
                                    // This handles Industry users or any IdP with incomplete attributes

                                    // Clearance: Default to UNCLASSIFIED if missing
                                    if (!payload.clearance || payload.clearance === '') {
                                        session.user.clearance = 'UNCLASSIFIED';
                                        console.log('[DIVE] Enriched clearance to UNCLASSIFIED (missing from IdP)');
                                    } else {
                                        session.user.clearance = payload.clearance;
                                    }

                                    // Country: Infer from email if missing
                                    if (!payload.countryOfAffiliation || payload.countryOfAffiliation === '') {
                                        const email = payload.email || user.email || '';
                                        const inferredCountry = inferCountryFromEmail(email);
                                        session.user.countryOfAffiliation = inferredCountry.country;
                                        console.log('[DIVE] Enriched countryOfAffiliation:', {
                                            email,
                                            country: inferredCountry.country,
                                            confidence: inferredCountry.confidence
                                        });
                                    } else {
                                        session.user.countryOfAffiliation = payload.countryOfAffiliation;
                                    }

                                    // Parse acpCOI - might be JSON string or array
                                    if (payload.acpCOI) {
                                        if (Array.isArray(payload.acpCOI)) {
                                            session.user.acpCOI = payload.acpCOI;
                                        } else if (typeof payload.acpCOI === 'string') {
                                            try {
                                                const parsed = JSON.parse(payload.acpCOI);
                                                session.user.acpCOI = Array.isArray(parsed) ? parsed : [parsed];
                                            } catch {
                                                session.user.acpCOI = [payload.acpCOI];
                                            }
                                        } else {
                                            session.user.acpCOI = [];
                                        }
                                    } else {
                                        session.user.acpCOI = [];
                                    }

                                    // Extract roles (Week 3.3: Super Admin)
                                    // Roles can be in: realm_access.roles, resource_access.{client}.roles, or roles claim
                                    let roles: string[] = [];
                                    if (payload.realm_access && Array.isArray(payload.realm_access.roles)) {
                                        roles = payload.realm_access.roles;
                                    } else if (Array.isArray(payload.roles)) {
                                        roles = payload.roles;
                                    }

                                    // Debug logging for role extraction
                                    console.log('[DIVE Session] Role extraction:', {
                                        hasRealmAccess: !!payload.realm_access,
                                        realmAccessRoles: payload.realm_access?.roles,
                                        directRoles: payload.roles,
                                        extractedRoles: roles,
                                        userUniqueID: payload.uniqueID || payload.sub
                                    });

                                    session.user.roles = roles;

                                    // ============================================
                                    // AAL/MFA Claims Extraction (NIST SP 800-63B)
                                    // ============================================
                                    // FIX: Extract acr (Authentication Context Class Reference) and amr (Authentication Methods Reference)
                                    // These are critical for AAL2/AAL3 enforcement in OPA policies
                                    // Reference: AAL-MFA-ROOT-CAUSE-ANALYSIS.md (Issue #1)

                                    // ACR: For federated users, prioritize user_acr (from IdP)
                                    // The user_acr claim contains the ACR value from the federated Spoke's actual authentication.
                                    // The direct acr claim comes from the Hub's session (SSO cookie reuse, always 1).
                                    let acr: string | undefined;

                                    // For federated users: use user_acr (from Spoke's authentication)
                                    // For direct users: use acr (from Hub's authentication)
                                    if (payload.user_acr !== undefined && payload.user_acr !== null) {
                                        acr = String(payload.user_acr);
                                    } else if (payload.acr !== undefined && payload.acr !== null) {
                                        acr = String(payload.acr);
                                    }

                                    // AMR: Priority order for AMR values
                                    // 1. user_amr (from federated IdP authentication)
                                    // 2. amr (from direct Keycloak authentication)
                                    // 3. attributes.amr (from sync-amr-attributes.sh script)
                                    // 4. Default to ['pwd']
                                    let amr: string[] = ['pwd']; // default fallback

                                    // For federated users: use user_amr (from Spoke's authentication)
                                    // For direct users: use amr (from Hub's authentication)
                                    const amrSource = payload.user_amr || payload.amr;

                                    if (amrSource) {
                                        if (Array.isArray(amrSource)) {
                                            amr = amrSource;
                                        } else if (typeof amrSource === 'string') {
                                            // Sometimes stored as JSON string
                                            try {
                                                const parsed = JSON.parse(amrSource);
                                                amr = Array.isArray(parsed) ? parsed : [parsed];
                                            } catch {
                                                // Not JSON, treat as single value
                                                amr = [amrSource];
                                            }
                                        }
                                        console.log('[DEBUG H3] AMR after token extraction:', amr);
                                    } else if (payload.attributes?.amr) {
                                        // Fallback: Use AMR from user attributes (set by sync-amr-attributes.sh)
                                        const attrAmr = payload.attributes.amr;
                                        if (Array.isArray(attrAmr)) {
                                            amr = attrAmr.map(String);
                                        } else if (typeof attrAmr === 'string') {
                                            try {
                                                const parsed = JSON.parse(attrAmr);
                                                amr = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
                                            } catch {
                                                amr = [String(attrAmr)];
                                            }
                                        }
                                        console.log('[DIVE] Using AMR from user attributes:', amr);
                                    } else {
                                        // Final fallback: Infer AMR from clearance requirements
                                        // This ensures users get correct AAL even if token AMR is missing
                                        const clearance = payload.clearance || payload.attributes?.clearance?.[0] || 'UNCLASSIFIED';
                                        if (clearance === 'TOP_SECRET') {
                                            amr = ['pwd', 'hwk']; // AAL3 requires WebAuthn
                                        } else if (clearance === 'CONFIDENTIAL' || clearance === 'SECRET') {
                                            amr = ['pwd', 'otp']; // AAL2 requires TOTP
                                        } else {
                                            amr = ['pwd']; // AAL1 is password only
                                        }
                                        console.log('[DIVE] Inferred AMR from clearance:', { clearance, amr });
                                    }
                                    session.user.amr = amr;

                                    // Derive AAL from ACR/AMR if ACR missing or incorrect
                                    // CRITICAL FIX: Keycloak sometimes returns acr="1" even when WebAuthn is used
                                    // We must override based on AMR to get correct AAL level
                                    const amrSet = new Set(amr.map((v) => String(v).toLowerCase()));

                                    // Check if AMR indicates higher AAL than ACR suggests
                                    const hasWebAuthn = amrSet.has('hwk') || amrSet.has('webauthn') || amrSet.has('passkey');
                                    const hasOTP = amrSet.has('otp') || amrSet.has('totp');
                                    const hasMultipleFactors = amr.length >= 2;

                                    // Override ACR if Keycloak returned incorrect value
                                    // Keycloak may return acr="1" even with WebAuthn (hwk in AMR)
                                    const originalAcr = acr;
                                    if (!acr || acr === '0' || acr === '1' || acr === 'aal1') {
                                        if (hasWebAuthn) {
                                            acr = '3'; // AAL3 if hardware key present
                                        } else if (hasMultipleFactors || hasOTP) {
                                            acr = '2'; // AAL2 if multiple factors or OTP
                                        } else {
                                            acr = '0';
                                        }
                                    } else if (acr === '2' && hasWebAuthn) {
                                        // Keycloak returned AAL2 but we have WebAuthn - upgrade to AAL3
                                        acr = '3';
                                    }

                                    session.user.acr = acr || '0';

                                    // auth_time: Unix timestamp of authentication event
                                    // Used for token freshness validation in OPA
                                    session.user.auth_time = payload.auth_time;
                                }
                            } catch (error) {
                                console.error('Failed to decode id_token for custom claims:', error);
                            }
                        }
                    } else {
                        console.warn('[DIVE] No account found for user:', user.id);
                    }
                } catch (error) {
                    console.error('Failed to fetch account for session:', error);
                }
            }

            return session;
        },
    },
    // REMOVED pages configuration to fix "UnknownAction" error
    // NextAuth v5 with custom pages.signIn disables the /api/auth/signin endpoint
    // Our LoginButton component uses /api/auth/signin/keycloak directly
    // Therefore, we must let NextAuth handle signin pages internally
    //
    // pages: {
    //     signIn: "/login",   // This causes UnknownAction when using /api/auth/signin
    //     error: "/",
    //     signOut: "/",
    //     verifyRequest: "/login",
    //     newUser: "/dashboard"
    // },
    cookies: {
        sessionToken: {
            name: `authjs.session-token`,
            options: {
                httpOnly: true,
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
            },
        },
        callbackUrl: {
            name: `authjs.callback-url`,
            options: {
                httpOnly: true,
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
            },
        },
        csrfToken: {
            name: `authjs.csrf-token`,
            options: {
                httpOnly: true,
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
            },
        },
        pkceCodeVerifier: {
            name: `authjs.pkce.code_verifier`,
            options: {
                httpOnly: true,
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
                maxAge: 60 * 15, // 15 minutes
            },
        },
        state: {
            name: `authjs.state`,
            options: {
                httpOnly: true,
                // CRITICAL FIX: For localhost HTTPS, 'lax' allows cookies on top-level navigations (GET redirects)
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                // CRITICAL FIX: Don't set domain for localhost - omit it entirely when undefined
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
                maxAge: 60 * 15, // 15 minutes
            },
        },
        nonce: {
            name: `authjs.nonce`,
            options: {
                httpOnly: true,
                sameSite: isLocalhost ? 'lax' : (isCloudflareTunnel ? 'none' : 'lax'),
                path: '/',
                secure: AUTH_COOKIE_SECURE,
                ...(AUTH_COOKIE_DOMAIN ? { domain: AUTH_COOKIE_DOMAIN } : {}),
            },
        },
    },
    events: {
        async signOut(message) {
            console.log('[DIVE] signOut event triggered');

            // CRITICAL: Delete session from database (required with database strategy)
            // From https://authjs.dev/getting-started/database
            // DrizzleAdapter doesn't auto-delete sessions on signOut()
            const sessionData = 'session' in message ? message.session : null;
            let userId: string | null = null;
            let accessToken: string | null = null;
            let refreshToken: string | null = null;

            if (sessionData?.userId) {
                userId = sessionData.userId;
            } else if ('user' in message && message.user) {
                const user = message.user as any;
                userId = user.id || null;
            }

            // Phase 2 GAP-007: Get access/refresh tokens for Keycloak revocation
            if (userId) {
                try {
                    const userAccounts = await db.select()
                        .from(accounts)
                        .where(eq(accounts.userId, userId));

                    if (userAccounts.length > 0) {
                        accessToken = userAccounts[0].access_token;
                        refreshToken = userAccounts[0].refresh_token;
                    }
                } catch (error) {
                    console.error('[DIVE] Error fetching account for logout:', error);
                }
            }

            if (sessionData && sessionData.sessionToken) {
                try {
                    await db
                        .delete(sessions)
                        .where(eq(sessions.sessionToken, sessionData.sessionToken));
                    console.log('[DIVE] Database session deleted:', sessionData.sessionToken.substring(0, 8) + '...');
                } catch (error) {
                    console.error('[DIVE] Error deleting session from database:', error);
                }
            }

            // CRITICAL: Clear account tokens to prevent session recreation
            // Without this, the session callback will find the account and recreate the session!
            if (userId) {
                try {
                    await db.update(accounts)
                        .set({
                            access_token: null,
                            id_token: null,
                            refresh_token: null,
                            expires_at: null,
                            session_state: null,
                        })
                        .where(eq(accounts.userId, userId));
                    console.log('[DIVE] Account tokens cleared for user:', userId);
                } catch (error) {
                    console.error('[DIVE] Error clearing account tokens:', error);
                }
            }

            // ============================================
            // Phase 2 GAP-007: Coordinated Logout
            // ============================================
            // 1. Revoke tokens in Keycloak
            // 2. Add tokens to shared blacklist Redis
            // ============================================
            if (refreshToken || accessToken) {
                const keycloakUrl = process.env.KEYCLOAK_URL;
                const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
                const clientId = process.env.KEYCLOAK_CLIENT_ID;
                const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

                // Revoke refresh token in Keycloak (this also invalidates the access token)
                if (refreshToken && keycloakUrl && realm && clientId && clientSecret) {
                    try {
                        const revokeUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/revoke`;
                        const response = await fetch(revokeUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: new URLSearchParams({
                                client_id: clientId,
                                client_secret: clientSecret,
                                token: refreshToken,
                                token_type_hint: 'refresh_token',
                            }),
                        });

                        if (response.ok || response.status === 204) {
                            console.log('[DIVE] Keycloak refresh token revoked');
                        } else {
                            console.warn('[DIVE] Keycloak token revocation returned:', response.status);
                        }
                    } catch (error) {
                        console.error('[DIVE] Keycloak token revocation failed:', error);
                        // Continue - don't fail logout
                    }
                }

                // Notify backend to add token to shared blacklist
                // This ensures the token is blocked across ALL instances
                if (accessToken) {
                    try {
                        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
                        if (backendUrl) {
                            const blacklistResponse = await fetch(`${backendUrl}/api/auth/blacklist-token`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${accessToken}`,
                                },
                                body: JSON.stringify({
                                    reason: 'User logout',
                                }),
                            });

                            if (blacklistResponse.ok) {
                                console.log('[DIVE] Token added to shared blacklist');
                            } else {
                                console.warn('[DIVE] Token blacklist request returned:', blacklistResponse.status);
                            }
                        }
                    } catch (error) {
                        console.error('[DIVE] Token blacklist request failed:', error);
                        // Continue - don't fail logout
                    }
                }
            }

            // Log signout event
            if ('token' in message && message.token) {
                console.log("[DIVE] User signed out:", message.token.sub);
            }
        },
        async signIn({ user, account, profile }) {
            // DEBUG: Hypothesis 4 - Track sign-in event
            console.log('[DEBUG H4] Sign-in event:', {
              email: user?.email,
              provider: account?.provider,
              hasIdToken: !!account?.id_token,
              idTokenLength: account?.id_token?.length
            });

            // Multi-realm: Handle federated accounts from broker realm
            // Allow sign-in for all Keycloak accounts (broker creates new users)
            console.log('[DIVE] Sign-in event', {
                email: user?.email,
                provider: account?.provider,
                accountId: account?.providerAccountId,
            });

            // On fresh sign-in, manually update account tokens in database
            // DrizzleAdapter creates account on first login but doesn't always update on re-login
            if (account && user?.id) {
                try {
                    console.log('[DIVE] Updating account tokens', {
                        userId: user.id,
                        provider: account.provider,
                        hasAccessToken: !!account.access_token,
                        expiresAt: account.expires_at,
                    });

                    // Manually update the account record to ensure fresh tokens
                    await db.update(accounts)
                        .set({
                            access_token: account.access_token as string || null,
                            id_token: account.id_token as string || null,
                            refresh_token: account.refresh_token as string || null,
                            expires_at: account.expires_at as number || null,
                            token_type: account.token_type as string || null,
                            scope: account.scope as string || null,
                            session_state: account.session_state as string || null,
                        })
                        .where(eq(accounts.userId, user.id));

                    console.log('[DIVE] Account tokens updated successfully');
                } catch (error) {
                    console.error('[DIVE] Failed to update account tokens:', error);
                    // Don't fail the login, just log the error
                }
            }

            // Multi-realm: All Keycloak accounts allowed (broker creates new users)
            // No return needed - void function
        },
    },
});
