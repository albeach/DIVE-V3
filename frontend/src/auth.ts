import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

                                // If refresh token expired, clear tokens from session
                                // This will cause frontend to show "no token" error and user can re-login
                                if (errorMsg.includes('RefreshTokenExpired') || errorMsg.includes('invalid_grant')) {
                                    console.log('[DIVE] Refresh token invalid - session will have no tokens');
                                    // Don't add tokens to session - user will need to re-login
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
                                    session.user.clearance = payload.clearance;
                                    session.user.countryOfAffiliation = payload.countryOfAffiliation;

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

                                    console.log('[DIVE] Custom claims extracted:', {
                                        uniqueID: session.user.uniqueID,
                                        clearance: session.user.clearance,
                                        country: session.user.countryOfAffiliation,
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
            // Log signout event
            if ('token' in message && message.token) {
                console.log("User signed out:", message.token.sub);
            }
        },
    },
});

