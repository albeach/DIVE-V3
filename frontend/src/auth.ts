import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
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

            // If logged in
            if (isLoggedIn) {
                // Redirect from Login or Home to Dashboard
                if (isOnLogin || isOnHome) {
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
        jwt({ token, account, profile }) {
            // Store Keycloak tokens and custom claims
            if (account) {
                token.idToken = account.id_token;
                token.refreshToken = account.refresh_token;
                token.accessToken = account.access_token;
            }

            // Store custom DIVE attributes from profile
            if (profile) {
                token.uniqueID = (profile as any).uniqueID;
                token.clearance = (profile as any).clearance;
                token.countryOfAffiliation = (profile as any).countryOfAffiliation;
                token.acpCOI = (profile as any).acpCOI;
            }

            return token;
        },
        session({ session, token }) {
            // Add user ID
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }

            // Add Keycloak tokens
            if (token.idToken) {
                session.idToken = token.idToken as string;
            }
            if (token.refreshToken) {
                session.refreshToken = token.refreshToken as string;
            }
            if (token.accessToken) {
                session.accessToken = token.accessToken as string;
            }

            // Add DIVE custom attributes
            if (token.uniqueID) {
                session.user.uniqueID = token.uniqueID as string;
            }
            if (token.clearance) {
                session.user.clearance = token.clearance as string;
            }
            if (token.countryOfAffiliation) {
                session.user.countryOfAffiliation = token.countryOfAffiliation as string;
            }
            if (token.acpCOI) {
                session.user.acpCOI = token.acpCOI as string[];
            }

            return session;
        },
    },
    pages: {
        signIn: "/login",
        error: "/",
    },
    session: {
        strategy: "jwt",
        maxAge: 8 * 60 * 60, // 8 hours
    },
    events: {
        async signOut({ token }) {
            // Log signout event
            console.log("User signed out:", token?.sub);
        },
    },
});

