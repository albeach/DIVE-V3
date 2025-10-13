import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Email domain to country mapping for enrichment
 * Week 3: Infer countryOfAffiliation from email domain
 */
const EMAIL_DOMAIN_COUNTRY_MAP: Record<string, string> = {
    'mil': 'USA', 'army.mil': 'USA', 'navy.mil': 'USA', 'af.mil': 'USA',
    'gouv.fr': 'FRA', 'defense.gouv.fr': 'FRA',
    'gc.ca': 'CAN', 'forces.gc.ca': 'CAN',
    'mod.uk': 'GBR',
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
 */
async function refreshAccessToken(account: any) {
    try {
        console.log('[DIVE] Attempting token refresh for user:', account.userId);

        const response = await fetch(
            `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
            {
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
            }
        );

        const tokens = await response.json();

        if (!response.ok) {
            console.error('[DIVE] Token refresh failed:', {
                status: response.status,
                error: tokens.error,
                error_description: tokens.error_description,
            });

            // If refresh token is invalid/expired, we can't refresh
            // User will need to re-authenticate
            if (tokens.error === 'invalid_grant') {
                console.log('[DIVE] Refresh token expired or invalid - user needs to re-login');
                throw new Error('RefreshTokenExpired');
            }

            throw new Error(`Token refresh failed: ${tokens.error || 'Unknown error'}`);
        }

        console.log('[DIVE] Token refreshed successfully, new expiry:', tokens.expires_in, 'seconds');

        // Update account in database with new tokens
        await db.update(accounts)
            .set({
                access_token: tokens.access_token,
                id_token: tokens.id_token,
                expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
                refresh_token: tokens.refresh_token || account.refresh_token,
            })
            .where(eq(accounts.userId, account.userId));

        return {
            ...account,
            access_token: tokens.access_token,
            id_token: tokens.id_token,
            expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
            refresh_token: tokens.refresh_token || account.refresh_token,
        };
    } catch (error) {
        console.error('[DIVE] Error refreshing token:', error);
        throw error;
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
    trustHost: true, // Required for NextAuth v5 in development
    providers: [
        Keycloak({
            clientId: process.env.KEYCLOAK_CLIENT_ID as string,
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET as string,
            issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
            authorization: {
                params: {
                    scope: "openid profile email",
                }
            }
        }),
    ],
    debug: process.env.NODE_ENV === "development",

    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnLogin = nextUrl.pathname === "/login";
            const isOnHome = nextUrl.pathname === "/";

            // Allow API routes and auth callbacks
            if (nextUrl.pathname.startsWith("/api/")) {
                return true;
            }

            // If logged in
            if (isLoggedIn) {
                // Redirect from Login to Dashboard (but allow Home for logout landing)
                if (isOnLogin) {
                    return Response.redirect(new URL("/dashboard", nextUrl));
                }
                return true;
            }

            // If not logged in
            if (!isLoggedIn) {
                // Allow Home and Login only
                if (isOnHome || isOnLogin) {
                    return true;
                }
                // Redirect to Home
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

                        // Check if access token is expired and needs refresh
                        const currentTime = Math.floor(Date.now() / 1000);
                        const isExpired = account.expires_at && account.expires_at < currentTime;
                        const hasRefreshToken = !!account.refresh_token;

                        // Only refresh if:
                        // 1. Token is actually expired
                        // 2. We have a refresh token
                        // 3. Token expired more than 5 minutes ago (avoid refreshing during login)
                        const needsRefresh = isExpired && hasRefreshToken &&
                            account.expires_at && (currentTime - account.expires_at) > 300;

                        if (needsRefresh) {
                            console.log('[DIVE] Access token expired, refreshing...', {
                                expiredSince: currentTime - (account.expires_at || 0),
                                secondsAgo: currentTime - (account.expires_at || 0),
                            });

                            try {
                                account = await refreshAccessToken(account);
                                console.log('[DIVE] Token refreshed, new expiry:', account.expires_at);
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                                console.error('[DIVE] Token refresh failed:', errorMsg);

                                // If refresh token expired, user needs to re-authenticate
                                if (errorMsg.includes('RefreshTokenExpired') || errorMsg.includes('invalid_grant')) {
                                    console.log('[DIVE] Refresh token invalid - session expired, user needs to re-login');

                                    // Return session without tokens
                                    // The authorized callback and pages will handle redirect to login
                                    // when they detect missing accessToken
                                    session.accessToken = undefined;
                                    session.idToken = undefined;
                                    session.refreshToken = undefined;

                                    return session;
                                }

                                // For other errors, continue with existing tokens and hope they work
                                console.log('[DIVE] Using existing tokens despite refresh failure');
                            }
                        } else if (isExpired && !hasRefreshToken) {
                            console.warn('[DIVE] Token expired but no refresh_token available');
                        } else if (isExpired) {
                            console.log('[DIVE] Token recently expired, waiting for DrizzleAdapter update from fresh login');
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
    },
    session: {
        strategy: "database",
        maxAge: 8 * 60 * 60, // 8 hours
        updateAge: 24 * 60 * 60, // Update session every 24 hours
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

            if (sessionData) {
                try {
                    await db
                        .delete(sessions)
                        .where(eq(sessions.sessionToken, sessionData.sessionToken));
                    console.log('[DIVE] Database session deleted:', sessionData.sessionToken.substring(0, 8) + '...');
                } catch (error) {
                    console.error('[DIVE] Error deleting session from database:', error);
                }
            }

            // Log signout event
            if ('token' in message && message.token) {
                console.log("[DIVE] User signed out:", message.token.sub);
            }
        },
        async signIn({ user, account, profile }) {
            // On fresh sign-in, manually update account tokens in database
            // DrizzleAdapter creates account on first login but doesn't always update on re-login
            if (account && user?.id) {
                try {
                    console.log('[DIVE] Sign-in event - updating account tokens', {
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

                    console.log('[DIVE] Account tokens updated in database');
                } catch (error) {
                    console.error('[DIVE] Failed to update account tokens:', error);
                    // Don't fail the login, just log the error
                }
            }
        },
    },
});

