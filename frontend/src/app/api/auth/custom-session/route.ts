/**
 * Custom Session Creation Endpoint
 *
 * Creates a NextAuth session from custom login tokens
 * This allows custom login pages to integrate with NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    findUserById,
    insertUser,
    findAccountsByUserId,
    updateAccountTokens,
    insertAccount,
    insertSession
} from '@/lib/db/operations';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { accessToken, refreshToken, idToken, expiresIn } = await request.json();

        console.log('[Custom Session] Received tokens:', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            hasIdToken: !!idToken,
            expiresIn
        });

        if (!accessToken || !idToken) {
            console.error('[Custom Session] Missing required tokens:', { accessToken: !!accessToken, idToken: !!idToken });
            return NextResponse.json(
                { error: 'Missing required tokens' },
                { status: 400 }
            );
        }

        // Decode JWT to get user info (without verification - already verified by backend)
        const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

        // ENRICHMENT: Generate email if missing (remote IdPs may not provide)
        let email = payload.email || payload.preferred_username;
        const uniqueID = payload.uniqueID || payload.sub;

        if (!email || email.trim() === '') {
            // If uniqueID looks like email, use it
            if (uniqueID && uniqueID.includes('@')) {
                email = uniqueID;
            } else {
                // Generate synthetic email
                email = `${uniqueID || payload.sub}@dive-broker.internal`;
            }
            console.log('[Custom Session] Generated email:', email);
        }

        const name = payload.name || payload.preferred_username;

        // Extract DIVE-specific attributes for future session retrieval
        // These will be populated by the auth.ts session callback
        // Fallback to current instance if country not in token
        const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
        console.log('[Custom Session] Extracted user attributes:', {
            uniqueID,
            email,
            name,
            clearance: payload.clearance || 'UNCLASSIFIED',
            countryOfAffiliation: payload.countryOfAffiliation || CURRENT_INSTANCE,
            acpCOI: payload.acpCOI || [],
            roles: payload.realm_access?.roles || payload.roles || []
        });

        // Create or update user
        let user;
        const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (existingUsers.length > 0) {
            user = existingUsers[0];
        } else {
            await insertUser({
                id: randomUUID(),
                name,
                email,
            });
            const newUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
            user = newUsers[0];
        }

        // Create or update account
        const existingAccounts = await findAccountsByUserId(user.id);
        const expiresAt = Math.floor(Date.now() / 1000) + (expiresIn || 900);

        if (existingAccounts.length > 0) {
            // Update existing account tokens
            await updateAccountTokens('keycloak', payload.sub, {
                access_token: accessToken,
                refresh_token: refreshToken,
                id_token: idToken,
                expires_at: expiresAt,
            });
        } else {
            // Create new account
            await insertAccount({
                userId: user.id,
                type: 'oauth',
                provider: 'keycloak',
                providerAccountId: payload.sub,
                access_token: accessToken,
                refresh_token: refreshToken,
                id_token: idToken,
                expires_at: expiresAt,
                token_type: 'Bearer',
                scope: payload.scope || 'openid profile email',
            });
        }

        // Create session
        const sessionToken = randomUUID();
        const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await insertSession({
            sessionToken,
            userId: user.id,
            expires: sessionExpiry,
        });

        // Set session cookie
        const response = NextResponse.json({ success: true, sessionToken });
        response.cookies.set('authjs.session-token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: sessionExpiry,
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Custom session creation error:', error);
        return NextResponse.json(
            { error: 'Failed to create session' },
            { status: 500 }
        );
    }
}
