import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../[...nextauth]/route';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

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
