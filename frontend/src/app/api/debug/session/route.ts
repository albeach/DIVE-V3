/**
 * Debug Session API Route
 * 
 * Returns current authentication context including ACR/AMR/AAL
 * for troubleshooting AAL2 issues
 */

import { NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

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
    const acrStr = String(acr || '0');
    const amrArray = Array.isArray(amr) ? amr : [];

    // Check ACR value
    if (acrStr === '2' || acrStr === '3') return 'AAL3';
    if (acrStr === '1') return 'AAL2';
    
    // Fallback: check AMR factors
    if (amrArray.length >= 2) return 'AAL2 (from AMR factors)';
    
    return 'AAL1 (single factor)';
}

