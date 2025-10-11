/**
 * Keycloak Frontchannel Logout Callback
 * 
 * Based on: https://koyukan.medium.com/mastering-keycloak-front-channel-logout-with-next-js-nextauth-js-a-post-mortem-turned-how-to-631d06118d7b
 * 
 * Frontchannel logout flow:
 * 1. Keycloak loads this endpoint in a hidden iframe
 * 2. This route deletes HttpOnly cookies (can't be done with JavaScript)
 * 3. Returns HTML with JavaScript that:
 *    - Clears localStorage/sessionStorage (in iframe context)
 *    - Sends postMessage to parent window
 * 4. Parent window receives message and completes logout
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
    try {
        console.log('[DIVE] Frontchannel logout callback - deleting cookies');

        // Delete NextAuth session cookies (HttpOnly - can only be done server-side)
        const cookieStore = await cookies();

        // In development (HTTP), use non-secure names
        // In production (HTTPS), use __Secure- prefix
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieNames = isProduction
            ? ['__Secure-next-auth.session-token', '__Secure-authjs.session-token']
            : ['next-auth.session-token', 'authjs.session-token'];

        cookieNames.forEach(name => {
            try {
                cookieStore.delete(name);
                console.log('[DIVE] Deleted cookie:', name);
            } catch (error) {
                console.error('[DIVE] Error deleting cookie:', name, error);
            }
        });

        console.log('[DIVE] Session cookies deleted in frontchannel logout');

        // Return HTML with JavaScript that:
        // 1. Clears browser storage (localStorage, sessionStorage)
        // 2. Sends postMessage to parent window to trigger full logout
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Logout</title>
</head>
<body>
    <script>
        console.log('[DIVE Iframe] Frontchannel logout executing...');
        
        // Clear browser storage (this runs in iframe context)
        try {
            localStorage.clear();
            sessionStorage.clear();
            console.log('[DIVE Iframe] Browser storage cleared');
        } catch (e) {
            console.error('[DIVE Iframe] Storage clear error:', e);
        }
        
        // Notify parent window that logout is complete
        if (window.parent !== window) {
            console.log('[DIVE Iframe] Sending logout-complete message to parent');
            window.parent.postMessage('logout-complete', '*');
        }
    </script>
    <p>Logging out...</p>
</body>
</html>
        `;

        return new NextResponse(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-store',
                // CRITICAL: Allow iframe embedding from Keycloak
                'X-Frame-Options': 'ALLOWALL',
                'Content-Security-Policy': "frame-ancestors 'self' http://localhost:8081 http://keycloak:8080",
            },
        });

    } catch (error) {
        console.error('[DIVE] Frontchannel logout error:', error);

        // Still return success to avoid breaking Keycloak logout
        return new NextResponse('<html><body>Logout complete</body></html>', {
            status: 200,
            headers: {
                'Content-Type': 'text/html',
                'X-Frame-Options': 'ALLOWALL',
            },
        });
    }
}

// POST method support
export async function POST(request: NextRequest) {
    return GET(request);
}

