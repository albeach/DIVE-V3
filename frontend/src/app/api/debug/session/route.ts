/**
 * Debug Session API Route
 *
 * Returns current authentication context including ACR/AMR/AAL
 * for troubleshooting AAL2 issues
 */

import { NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Validate session
        const validation = await validateSession();

        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error },
                { status: 401 }
            );
        }

        // Get tokens (server-side only)
        const tokens = await getSessionTokens();

        // Parse ID token to get ACR/AMR claims
        const idTokenParts = tokens.idToken.split('.');
        if (idTokenParts.length !== 3) {
            throw new Error('Invalid token format');
        }

        const payload = JSON.parse(
            Buffer.from(idTokenParts[1], 'base64').toString('utf-8')
        );

        // Extract authentication context
        const authContext = {
            acr: payload.acr || 'not set',
            amr: payload.amr || [],
            auth_time: payload.auth_time,
            aal_interpretation: interpretAAL(payload.acr, payload.amr),
            note: 'Mapping: acr 0/1 → AAL1, 2 → AAL2, 3 → AAL3. AMR with 2+ factors yields AAL2 fallback.',
        };

        return NextResponse.json({
            session: {
                userId: validation.userId,
                expiresAt: new Date(validation.expiresAt!).toISOString(),
            },
            authContext,
            user: {
                uniqueID: payload.uniqueID || payload.preferred_username,
                clearance: payload.clearance,
                country: payload.countryOfAffiliation,
                acpCOI: payload.acpCOI || [],
            },
        });

    } catch (error) {
        console.error('[DebugSession] Error:', error);
        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}

function interpretAAL(acr: any, amr: any): string {
    const acrStr = String(acr ?? '0');
    const amrArray = Array.isArray(amr) ? amr : [];

    // Numeric/string mapping aligned to Keycloak default:
    // 1 => Level 1 (password), 2 => Level 2 (OTP), 3 => Level 3 (WebAuthn)
    if (acrStr === '3') return 'AAL3';
    if (acrStr === '2') return 'AAL2';
    if (acrStr === '1' || acrStr === '0') return 'AAL1';

    // Fallback: infer from AMR if multiple factors present
    if (amrArray.length >= 2) return 'AAL2 (from AMR factors)';

    return 'AAL1 (single factor)';
}
