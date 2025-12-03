#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - OPAL JWT Token Generator
 * Phase 7: Production Hardening
 * 
 * Generates JWT tokens for OPAL client authentication.
 * Uses RS256 algorithm with the OPAL JWT signing key.
 * 
 * Usage:
 *   npx ts-node backend/src/scripts/generate-opal-jwt.ts
 *   npx ts-node backend/src/scripts/generate-opal-jwt.ts --tenant USA
 *   npx ts-node backend/src/scripts/generate-opal-jwt.ts --expiry 30d
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PROJECT_ROOT = process.cwd();
const DEFAULT_KEY_PATH = path.join(PROJECT_ROOT, 'certs/opal/jwt-signing-key.pem');
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dive25';
const GCP_SECRET_NAME = 'dive-v3-opal-jwt-key';

interface JWTHeader {
  alg: string;
  typ: string;
  kid?: string;
}

interface JWTPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  scope?: string[];
  tenant?: string;
  permissions?: string[];
}

/**
 * Base64URL encode
 */
function base64url(data: Buffer | string): string {
  const base64 = Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Load signing key from GCP Secret Manager
 */
async function loadKeyFromGCP(): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');
    
    console.log('  Loading signing key from GCP Secret Manager...');
    const privateKey = execSync(
      `gcloud secrets versions access latest --secret=${GCP_SECRET_NAME} --project=${GCP_PROJECT_ID}`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    return privateKey;
  } catch {
    return null;
  }
}

/**
 * Load signing key from local file
 */
function loadKeyFromFile(keyPath: string): string | null {
  if (!fs.existsSync(keyPath)) {
    return null;
  }
  return fs.readFileSync(keyPath, 'utf-8');
}

/**
 * Parse duration string to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use 30s, 5m, 24h, or 7d`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return value;
  }
}

/**
 * Generate OPAL JWT token
 */
function generateToken(
  privateKey: string,
  options: {
    tenant?: string;
    expiry?: string;
    scope?: string[];
    permissions?: string[];
  } = {}
): string {
  const {
    tenant,
    expiry = '24h',
    scope = ['read:policy', 'read:data'],
    permissions = ['policy:read', 'data:read'],
  } = options;

  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = parseDuration(expiry);

  // JWT Header
  const header: JWTHeader = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'opal-jwt-key',
  };

  // JWT Payload
  const payload: JWTPayload = {
    iss: 'dive-v3',
    sub: `opal-client${tenant ? `-${tenant.toLowerCase()}` : ''}`,
    aud: 'dive-v3-opal',
    exp: now + expirySeconds,
    iat: now,
    jti: crypto.randomUUID(),
    scope,
    permissions,
  };

  if (tenant) {
    payload.tenant = tenant.toUpperCase();
  }

  // Create signature
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const signature = crypto.sign('sha256', Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });

  const signatureB64 = base64url(signature);

  return `${message}.${signatureB64}`;
}

/**
 * Verify JWT token
 */
function verifyToken(token: string, publicKey: string): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const message = `${headerB64}.${payloadB64}`;

    // Convert base64url to standard base64
    const signature = Buffer.from(
      signatureB64.replace(/-/g, '+').replace(/_/g, '/') + '==',
      'base64'
    );

    const valid = crypto.verify('sha256', Buffer.from(message), {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    }, signature);

    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payloadJson = Buffer.from(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '==',
      'base64'
    ).toString('utf-8');
    const payload = JSON.parse(payloadJson) as JWTPayload;

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let tenant: string | undefined;
  let expiry = '24h';
  let keyPath = DEFAULT_KEY_PATH;
  let verify: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tenant':
        tenant = args[++i];
        break;
      case '--expiry':
        expiry = args[++i];
        break;
      case '--key':
        keyPath = args[++i];
        break;
      case '--verify':
        verify = args[++i];
        break;
      case '--help':
      case '-h':
        console.log('DIVE V3 - OPAL JWT Token Generator');
        console.log('===================================\n');
        console.log('Usage:');
        console.log('  npx ts-node backend/src/scripts/generate-opal-jwt.ts [options]\n');
        console.log('Options:');
        console.log('  --tenant <ID>    Tenant ID (USA, FRA, GBR, DEU)');
        console.log('  --expiry <time>  Token expiry (30s, 5m, 24h, 7d). Default: 24h');
        console.log('  --key <path>     Path to private key file');
        console.log('  --verify <token> Verify a token instead of generating');
        console.log('  --help           Show this help message\n');
        console.log('Examples:');
        console.log('  npx ts-node backend/src/scripts/generate-opal-jwt.ts');
        console.log('  npx ts-node backend/src/scripts/generate-opal-jwt.ts --tenant USA --expiry 7d');
        process.exit(0);
    }
  }

  console.log('🔐 DIVE V3 - OPAL JWT Token Generator\n');

  // Load private key
  let privateKey = await loadKeyFromGCP();
  if (!privateKey) {
    privateKey = loadKeyFromFile(keyPath);
  }

  if (!privateKey) {
    console.error('❌ Signing key not found!');
    console.error('   Generate certificates first: ./scripts/generate-opal-certs.sh');
    process.exit(1);
  }

  // Derive public key
  const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) as string;

  // Verify mode
  if (verify) {
    console.log('🔍 Verifying token...\n');
    const result = verifyToken(verify, publicKey);
    
    if (result.valid) {
      console.log('✅ Token is valid!\n');
      console.log('Payload:');
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      console.log(`❌ Token is invalid: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  // Generate token
  console.log('Generating token...');
  console.log(`  Tenant: ${tenant || 'all'}`);
  console.log(`  Expiry: ${expiry}\n`);

  const token = generateToken(privateKey, { tenant, expiry });

  console.log('✅ Token generated!\n');
  console.log('='.repeat(60));
  console.log('JWT Token:');
  console.log('='.repeat(60));
  console.log(token);
  console.log('='.repeat(60));

  // Show decoded payload
  const verified = verifyToken(token, publicKey);
  if (verified.valid && verified.payload) {
    console.log('\nDecoded Payload:');
    console.log(JSON.stringify(verified.payload, null, 2));
  }

  // Instructions
  console.log('\n📋 Usage:\n');
  console.log('1. Set as environment variable:');
  console.log(`   export OPAL_CLIENT_JWT_TOKEN="${token}"\n`);
  console.log('2. Or add to docker-compose.yml:');
  console.log('   environment:');
  console.log(`     OPAL_CLIENT_TOKEN: ${token}\n`);

  // Calculate expiration time
  if (verified.payload) {
    const expiresAt = new Date(verified.payload.exp * 1000);
    console.log(`⏰ Token expires: ${expiresAt.toISOString()}`);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

