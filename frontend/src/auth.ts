import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions } from "@/lib/db/schema";
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
 */
async function refreshAccessToken(account: any) {
    const refreshUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (account.expires_at || 0) - currentTime;

    try {
        console.log('[DIVE] Token Refresh Request', {
            userId: account.userId,
            keycloakUrl: process.env.KEYCLOAK_URL,
            realm: process.env.KEYCLOAK_REALM,
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

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
    trustHost: true, // Required for NextAuth v5 in development
    debug: process.env.NODE_ENV === "development",  // ENABLE VERBOSE DEBUG LOGGING
    logger: {
        error(code, ...message) {
            console.error('[NextAuth Error]', code, message);
        },
        warn(code, ...message) {
            console.warn('[NextAuth Warn]', code, message);
        },
        debug(code, ...message) {
            console.log('[NextAuth Debug]', code, message);
        },
    },
    providers: [
        Keycloak({
            clientId: process.env.KEYCLOAK_CLIENT_ID as string,
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET as string,
            issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
            authorization: {
                url: `${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
                params: {
                    scope: "openid profile email offline_access",
                }
            },
            token: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
            userinfo: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
            checks: ["pkce", "state"],
            allowDangerousEmailAccountLinking: true,
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
                // Redirect to /login (not /auth/signin)
                return Response.redirect(new URL("/login", nextUrl));
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

                        // PROACTIVE REFRESH: Refresh when token has 33% of lifetime left
                        // For 15-minute tokens (900s), this means refresh at 5 minutes remaining
                        // For 30-minute tokens (1800s), this means refresh at 10 minutes remaining
                        // This prevents API failures from expired tokens
                        const shouldRefresh = hasRefreshToken && (
                            isExpired || // Token is expired
                            timeUntilExpiry < 300 // Less than 5 minutes remaining (proactive)
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

                        // Add Keycloak tokens to session
                        session.idToken = account.id_token || undefined;
                        session.accessToken = account.access_token || undefined;
                        session.refreshToken = account.refresh_token || undefined;

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
                                    session.user.roles = roles;

                                    console.log('[DIVE] Custom claims extracted:', {
                                        uniqueID: session.user.uniqueID,
                                        clearance: session.user.clearance,
                                        country: session.user.countryOfAffiliation,
                                        roles: session.user.roles,
                                    });
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
    pages: {
        signIn: "/login",
        error: "/",
        signOut: "/", // Redirect to home after signout
        verifyRequest: "/login", // Redirect for email verification
        newUser: "/dashboard" // Redirect for new users
    },
    session: {
        strategy: "database",
        maxAge: 30 * 60, // 30 minutes (more reasonable for admin tasks)
        updateAge: 5 * 60, // Update session every 5 minutes (keep session alive with activity)
    },
    cookies: {
        sessionToken: {
            name: `authjs.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
        callbackUrl: {
            name: `authjs.callback-url`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
        csrfToken: {
            name: `authjs.csrf-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
        pkceCodeVerifier: {
            name: `authjs.pkce.code_verifier`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 15, // 15 minutes
            },
        },
        state: {
            name: `authjs.state`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 15, // 15 minutes
            },
        },
        nonce: {
            name: `authjs.nonce`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
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

            if (sessionData?.userId) {
                userId = sessionData.userId;
            } else if ('user' in message && message.user) {
                const user = message.user as any;
                userId = user.id || null;
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

            // Log signout event
            if ('token' in message && message.token) {
                console.log("[DIVE] User signed out:", message.token.sub);
            }
        },
        async signIn({ user, account, profile }) {
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

