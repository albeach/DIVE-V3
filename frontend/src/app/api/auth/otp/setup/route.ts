/**
 * OTP Setup Route - Generate TOTP secret for 2FA
 *
 * NextAuth v5 pattern: Uses `auth()` from @/auth for session validation
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export async function POST() {
  try {
    // NextAuth v5: Use auth() to get session
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `DIVE V3 - ${session.user.email || session.user.name}`,
      issuer: 'DIVE V3'
    });

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return NextResponse.json({
      success: true,
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl: secret.otpauth_url
    });

  } catch (error) {
    console.error('OTP setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
