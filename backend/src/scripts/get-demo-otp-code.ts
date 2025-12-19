/**
 * DIVE V3 - Get Demo OTP Code
 * 
 * Generates the current OTP code for demo users
 * 
 * Usage:
 *   npm run ts-node backend/src/scripts/get-demo-otp-code.ts
 */

import speakeasy from 'speakeasy';

// Demo OTP secret (Base32 format)
// This is the secret used for all demo users requiring OTP
const DEMO_OTP_SECRET = 'DEMO123456789012345678901234567890';

function getCurrentOTPCode(): string {
    const token = speakeasy.totp({
        secret: DEMO_OTP_SECRET,
        encoding: 'base32',
        algorithm: 'sha256',
        digits: 6,
        step: 30
    });

    return token;
}

function getOTPCodes(): { current: string; next: string; previous: string } {
    const current = getCurrentOTPCode();
    
    // Get next code (30 seconds from now)
    const next = speakeasy.totp({
        secret: DEMO_OTP_SECRET,
        encoding: 'base32',
        algorithm: 'sha256',
        digits: 6,
        step: 30,
        time: Math.floor(Date.now() / 1000) + 30
    });

    // Get previous code (30 seconds ago)
    const previous = speakeasy.totp({
        secret: DEMO_OTP_SECRET,
        encoding: 'base32',
        algorithm: 'sha256',
        digits: 6,
        step: 30,
        time: Math.floor(Date.now() / 1000) - 30
    });

    return { current, next, previous };
}

function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     DIVE V3 - Demo OTP Code Generator                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const codes = getOTPCodes();
    const now = new Date();
    const nextTime = new Date(now.getTime() + 30000);
    const prevTime = new Date(now.getTime() - 30000);

    console.log('📱 Current OTP Code (valid for ~30 seconds):');
    console.log(`   ${codes.current}\n`);

    console.log('⏰ Code Validity:');
    console.log(`   Previous: ${codes.previous} (expired at ${prevTime.toLocaleTimeString()})`);
    console.log(`   Current:  ${codes.current} (valid until ${nextTime.toLocaleTimeString()})`);
    console.log(`   Next:     ${codes.next} (valid from ${nextTime.toLocaleTimeString()})\n`);

    console.log('💡 Tip: For demo purposes, you can also use code: 123456');
    console.log('   (if validation override is enabled)\n');
}

if (require.main === module) {
    main();
    
    // Update every 5 seconds for convenience
    setInterval(() => {
        console.clear();
        main();
    }, 5000);
}

export { getCurrentOTPCode, getOTPCodes };
