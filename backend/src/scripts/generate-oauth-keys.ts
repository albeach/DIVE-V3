#!/usr/bin/env tsx

/**
 * Generate RSA key pair for OAuth JWT signing
 * Usage: tsx src/scripts/generate-oauth-keys.ts
 */

import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const KEYS_DIR = path.join(__dirname, '../../keys');

// Ensure keys directory exists
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  logger.info('Created keys directory', { path: KEYS_DIR });
}

// Generate RSA key pair
logger.info('Generating RSA key pair for OAuth JWT signing...');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Write keys to files
const privateKeyPath = path.join(KEYS_DIR, 'private.pem');
const publicKeyPath = path.join(KEYS_DIR, 'public.pem');

fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 }); // Restricted permissions
fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

logger.info('OAuth JWT signing keys generated successfully', {
  privateKey: privateKeyPath,
  publicKey: publicKeyPath
});

// Display public key info for JWKS
logger.info('Add this public key to your JWKS endpoint or share with federation partners:', {
  publicKey: publicKey.split('\n').slice(1, -2).join('')
});

console.log(`
OAuth JWT Signing Keys Generated Successfully!

Private Key: ${privateKeyPath} (keep this secure!)
Public Key:  ${publicKeyPath} (share with partners)

Make sure to:
1. Update JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH in .env.local
2. Keep the private key secure and never commit it to git
3. Share the public key with federation partners for token validation
4. Add keys/ to .gitignore if not already present
`);
