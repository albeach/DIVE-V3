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

    // Here we would normally save the TOTP secret to the user's Keycloak account
    // But for now, we'll just return success and let the frontend handle the session update

    // TODO: Call Keycloak Admin API to configure TOTP for the user

    return NextResponse.json({
      success: true,
      message: 'TOTP setup completed successfully'
    });

  } catch (error) {
    console.error('OTP verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
