/**
 * OTP Verify Route - Verify TOTP code for 2FA
 *
 * NextAuth v5 pattern: Uses `auth()` from @/auth for session validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import speakeasy from 'speakeasy';

export async function POST(request: NextRequest) {
  try {
    // NextAuth v5: Use auth() to get session
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, secret } = await request.json();

    if (!code || !secret) {
      return NextResponse.json({ error: 'Code and secret are required' }, { status: 400 });
    }

    // Verify the TOTP code
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time steps (30 seconds) tolerance
    });

    if (!verified) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Configure TOTP in Keycloak for the authenticated user
    // CRITICAL: This actually enables MFA for the user account

    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';
    const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'dive-v3-broker';
    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'dive-v3-broker';
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

    if (!clientSecret) {
      console.error('KEYCLOAK_CLIENT_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // DEBUG: Log admin token request
    console.log('[DEBUG H1] Getting Keycloak admin token for TOTP config');

    // Get Keycloak admin token
    const adminTokenResponse = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!adminTokenResponse.ok) {
      console.error('Failed to get Keycloak admin token');
      return NextResponse.json({ error: 'Authentication service error' }, { status: 500 });
    }

    const adminTokenData = await adminTokenResponse.json();
    const adminToken = adminTokenData.access_token;

    // Find the user by uniqueID (which should match the username)
    const userUniqueId = (session.user as any).uniqueID || session.user.id;
    const usersResponse = await fetch(`${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(userUniqueId)}&exact=true`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });

    if (!usersResponse.ok) {
      console.error('Failed to find user in Keycloak');
      return NextResponse.json({ error: 'User lookup failed' }, { status: 500 });
    }

    const users = await usersResponse.json();
    if (!users || users.length === 0) {
      console.error('User not found in Keycloak');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // DEBUG: Hypothesis 1 - Track TOTP configuration attempt
    console.log('[DEBUG H1] Attempting TOTP config for user:', userUniqueId, 'in realm:', realm);

    const totpPayload = {
      type: 'otp',
      temporary: false,
      secret: secret,
      algorithm: 'HmacSHA1',
      digits: 6,
      period: 30,
    };
    console.log('[DEBUG H1] TOTP payload:', { ...totpPayload, secret: secret.substring(0, 4) + '...' });

    // Configure TOTP for the user
    const totpConfigResponse = await fetch(`${keycloakUrl}/admin/realms/${realm}/users/${userId}/credentials/totp`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'otp',
        temporary: false,
        secret: secret,
        algorithm: 'HmacSHA1',
        digits: 6,
        period: 30,
      }),
    });

    // DEBUG: Hypothesis 1 - Track TOTP configuration result
    console.log('[DEBUG H1] TOTP config response:', { status: totpConfigResponse.status, ok: totpConfigResponse.ok });

    if (!totpConfigResponse.ok) {
      const errorText = await totpConfigResponse.text();

      // DEBUG: Hypothesis 1 - Track TOTP configuration failure
      console.log('[DEBUG H1] TOTP config failed:', errorText);

      console.error('Failed to configure TOTP:', errorText);
      return NextResponse.json({ error: 'Failed to configure MFA' }, { status: 500 });
    }

    console.log(`TOTP configured successfully for user: ${userUniqueId}`);

    // Note: AMR attribute sync should be run separately via:
    // ./dive hub amr sync --user <username>
    // This ensures the user's AMR attribute reflects their configured credentials

    return NextResponse.json({
      success: true,
      message: 'TOTP setup completed successfully'
    });

  } catch (error) {
    console.error('OTP verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
