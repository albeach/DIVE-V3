#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Bundle Signing Script
 * Phase 7: Production Hardening
 * 
 * Signs OPA policy bundles with RSA-4096 keys.
 * Supports GCP Secret Manager and local key files.
 * 
 * Usage:
 *   npx ts-node --esm scripts/policy/sign-bundle.ts sign --all
 *   npx ts-node --esm scripts/policy/sign-bundle.ts sign --tenant USA
 *   npx ts-node --esm scripts/policy/sign-bundle.ts generate-key --output ./certs/bundle-signing
 *   npx ts-node --esm scripts/policy/sign-bundle.ts verify --tenant USA
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BUNDLES_DIR = path.join(PROJECT_ROOT, 'dist/bundles');
const DEFAULT_KEY_PATH = path.join(PROJECT_ROOT, 'certs/bundle-signing/signing-key');
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dive25';
const GCP_SECRET_NAME = 'dive-v3-bundle-signing-key';

// Constants
const DEFAULT_KEY_SIZE = 4096;
const SIGNING_ALGORITHM = 'sha256';
const SALT_LENGTH = 32;

const TENANTS = ['usa', 'fra', 'gbr', 'deu'];

interface SignatureManifest {
  revision: string;
  tenant: string;
  bundleChecksum: string;
  signature: string;
  keyId: string;
  signedAt: string;
  algorithm: string;
  publicKey: string;
}

interface SigningResult {
  tenant: string;
  success: boolean;
  keyId?: string;
  error?: string;
}

/**
 * Generate RSA key pair
 */
function generateKeyPair(keySize: number = DEFAULT_KEY_SIZE): { privateKey: string; publicKey: string } {
  console.log(`🔐 Generating RSA-${keySize} key pair...`);
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

/**
 * Calculate key ID from public key
 */
function calculateKeyId(publicKey: string): string {
  const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Sign data with private key
 */
function signData(data: Buffer, privateKey: string): string {
  const signature = crypto.sign(SIGNING_ALGORITHM, data, {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: SALT_LENGTH,
  });
  return signature.toString('base64');
}

/**
 * Verify signature
 */
function verifySignature(data: Buffer, signature: string, publicKey: string): boolean {
  try {
    const signatureBuffer = Buffer.from(signature, 'base64');
    return crypto.verify(SIGNING_ALGORITHM, data, {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: SALT_LENGTH,
    }, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Load private key from GCP Secret Manager
 */
async function loadKeyFromGCP(): Promise<{ privateKey: string; publicKey: string } | null> {
  try {
    const { execSync } = await import('child_process');
    
    console.log('  📥 Loading private key from GCP Secret Manager...');
    const privateKey = execSync(
      `gcloud secrets versions access latest --secret=${GCP_SECRET_NAME} --project=${GCP_PROJECT_ID}`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    // Derive public key from private key
    const publicKey = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' }) as string;

    console.log('  ✅ Loaded signing key from GCP');
    return { privateKey, publicKey };
  } catch (error) {
    console.log('  ⚠️  GCP key not available, will use local key');
    return null;
  }
}

/**
 * Load private key from local file
 */
function loadKeyFromFile(keyPath: string): { privateKey: string; publicKey: string } | null {
  const privateKeyPath = keyPath.endsWith('.pem') ? keyPath : `${keyPath}.pem`;
  const publicKeyPath = privateKeyPath.replace('.pem', '.pub.pem');

  if (!fs.existsSync(privateKeyPath)) {
    return null;
  }

  console.log(`  📥 Loading private key from ${privateKeyPath}...`);
  const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
  
  let publicKey: string;
  if (fs.existsSync(publicKeyPath)) {
    publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
  } else {
    publicKey = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' }) as string;
  }

  console.log('  ✅ Loaded signing key from file');
  return { privateKey, publicKey };
}

/**
 * Load signing key (try GCP first, then local file)
 */
async function loadSigningKey(keyPath?: string): Promise<{ privateKey: string; publicKey: string; keyId: string } | null> {
  // Try GCP first
  let keys = await loadKeyFromGCP();
  
  // Fall back to local file
  if (!keys && keyPath) {
    keys = loadKeyFromFile(keyPath);
  }
  
  // Fall back to default path
  if (!keys) {
    keys = loadKeyFromFile(DEFAULT_KEY_PATH);
  }

  if (!keys) {
    return null;
  }

  const keyId = calculateKeyId(keys.publicKey);
  return { ...keys, keyId };
}

/**
 * Sign a tenant bundle
 */
async function signTenantBundle(
  tenant: string,
  keys: { privateKey: string; publicKey: string; keyId: string }
): Promise<SigningResult> {
  const bundlePath = path.join(BUNDLES_DIR, tenant, 'bundle.tar.gz');
  const manifestPath = path.join(BUNDLES_DIR, tenant, 'manifest.json');
  const sigManifestPath = path.join(BUNDLES_DIR, tenant, 'signature.json');
  const sigPath = `${bundlePath}.sig`;

  if (!fs.existsSync(bundlePath)) {
    return { tenant, success: false, error: 'Bundle not found' };
  }

  try {
    // Read bundle
    const bundleData = fs.readFileSync(bundlePath);
    
    // Calculate checksum
    const bundleChecksum = crypto.createHash('sha256').update(bundleData).digest('hex');
    
    // Get revision from manifest
    let revision = 'unknown';
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      revision = manifest.revision || revision;
    }

    // Sign the bundle
    const signature = signData(bundleData, keys.privateKey);
    const signedAt = new Date().toISOString();

    // Create signature manifest
    const sigManifest: SignatureManifest = {
      revision,
      tenant: tenant.toUpperCase(),
      bundleChecksum,
      signature,
      keyId: keys.keyId,
      signedAt,
      algorithm: `RSA-PSS-${SIGNING_ALGORITHM.toUpperCase()}`,
      publicKey: keys.publicKey,
    };

    // Write signature manifest
    fs.writeFileSync(sigManifestPath, JSON.stringify(sigManifest, null, 2));
    
    // Write detached signature
    fs.writeFileSync(sigPath, signature);

    return { tenant, success: true, keyId: keys.keyId };
  } catch (error) {
    return { tenant, success: false, error: String(error) };
  }
}

/**
 * Verify a tenant bundle signature
 */
function verifyTenantBundle(tenant: string): { valid: boolean; error?: string; keyId?: string; signedAt?: string } {
  const bundlePath = path.join(BUNDLES_DIR, tenant, 'bundle.tar.gz');
  const sigManifestPath = path.join(BUNDLES_DIR, tenant, 'signature.json');

  if (!fs.existsSync(bundlePath)) {
    return { valid: false, error: 'Bundle not found' };
  }

  if (!fs.existsSync(sigManifestPath)) {
    return { valid: false, error: 'Signature manifest not found' };
  }

  try {
    const bundleData = fs.readFileSync(bundlePath);
    const sigManifest: SignatureManifest = JSON.parse(fs.readFileSync(sigManifestPath, 'utf-8'));

    // Verify checksum
    const actualChecksum = crypto.createHash('sha256').update(bundleData).digest('hex');
    if (actualChecksum !== sigManifest.bundleChecksum) {
      return { valid: false, error: 'Checksum mismatch' };
    }

    // Verify signature
    const valid = verifySignature(bundleData, sigManifest.signature, sigManifest.publicKey);
    
    return {
      valid,
      keyId: sigManifest.keyId,
      signedAt: sigManifest.signedAt,
      error: valid ? undefined : 'Signature verification failed',
    };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

/**
 * Generate and save key pair
 */
function generateAndSaveKey(outputPath: string): void {
  console.log(`\n🔐 Generating new RSA-${DEFAULT_KEY_SIZE} key pair...\n`);
  
  const keys = generateKeyPair(DEFAULT_KEY_SIZE);
  const keyId = calculateKeyId(keys.publicKey);
  
  const privateKeyPath = outputPath.endsWith('.pem') ? outputPath : `${outputPath}.pem`;
  const publicKeyPath = privateKeyPath.replace('.pem', '.pub.pem');

  // Ensure directory exists
  fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });

  // Save with appropriate permissions
  fs.writeFileSync(privateKeyPath, keys.privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, keys.publicKey, { mode: 0o644 });

  console.log('✅ Key pair generated successfully!\n');
  console.log(`   Private Key: ${privateKeyPath}`);
  console.log(`   Public Key:  ${publicKeyPath}`);
  console.log(`   Key ID:      ${keyId}`);
  console.log(`   Key Size:    ${DEFAULT_KEY_SIZE} bits`);
  console.log(`   Algorithm:   RSA-PSS\n`);
  
  console.log('📋 Next steps:');
  console.log('   1. Store private key in GCP Secret Manager:');
  console.log(`      gcloud secrets create ${GCP_SECRET_NAME} --project=${GCP_PROJECT_ID}`);
  console.log(`      gcloud secrets versions add ${GCP_SECRET_NAME} --data-file=${privateKeyPath} --project=${GCP_PROJECT_ID}`);
  console.log('   2. Distribute public key to OPA instances for verification');
  console.log('   3. Sign bundles: npx ts-node --esm scripts/policy/sign-bundle.ts sign --all');
}

/**
 * Upload key to GCP Secret Manager
 */
async function uploadKeyToGCP(keyPath: string): Promise<void> {
  const { execSync } = await import('child_process');
  const privateKeyPath = keyPath.endsWith('.pem') ? keyPath : `${keyPath}.pem`;

  if (!fs.existsSync(privateKeyPath)) {
    console.error(`❌ Private key not found: ${privateKeyPath}`);
    process.exit(1);
  }

  console.log('\n📤 Uploading private key to GCP Secret Manager...\n');

  try {
    // Check if secret exists
    try {
      execSync(`gcloud secrets describe ${GCP_SECRET_NAME} --project=${GCP_PROJECT_ID}`, {
        stdio: 'pipe',
      });
      console.log('   Secret exists, adding new version...');
    } catch {
      console.log('   Creating new secret...');
      execSync(`gcloud secrets create ${GCP_SECRET_NAME} --project=${GCP_PROJECT_ID}`, {
        stdio: 'inherit',
      });
    }

    // Add version
    execSync(
      `gcloud secrets versions add ${GCP_SECRET_NAME} --data-file=${privateKeyPath} --project=${GCP_PROJECT_ID}`,
      { stdio: 'inherit' }
    );

    console.log('\n✅ Private key uploaded to GCP Secret Manager');
    console.log(`   Secret: ${GCP_SECRET_NAME}`);
    console.log(`   Project: ${GCP_PROJECT_ID}`);
  } catch (error) {
    console.error('❌ Failed to upload key to GCP:', error);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('DIVE V3 Bundle Signing Tool');
    console.log('===========================\n');
    console.log('Commands:');
    console.log('  sign --all                   Sign all tenant bundles');
    console.log('  sign --tenant <ID>           Sign specific tenant bundle');
    console.log('  verify --all                 Verify all tenant bundles');
    console.log('  verify --tenant <ID>         Verify specific tenant bundle');
    console.log('  generate-key --output <path> Generate new signing key pair');
    console.log('  upload-key --key <path>      Upload private key to GCP Secret Manager');
    console.log('\nOptions:');
    console.log('  --key <path>                 Path to signing key file');
    console.log('\nExamples:');
    console.log('  npx ts-node --esm scripts/policy/sign-bundle.ts sign --all');
    console.log('  npx ts-node --esm scripts/policy/sign-bundle.ts generate-key --output ./certs/bundle-signing/signing-key');
    process.exit(0);
  }

  switch (command) {
    case 'sign': {
      const signAll = args.includes('--all');
      const tenantIndex = args.indexOf('--tenant');
      const tenantId = tenantIndex >= 0 ? args[tenantIndex + 1] : null;
      const keyIndex = args.indexOf('--key');
      const keyPath = keyIndex >= 0 ? args[keyIndex + 1] : undefined;

      if (!signAll && !tenantId) {
        console.error('❌ Please specify --all or --tenant <ID>');
        process.exit(1);
      }

      const tenantsToSign = signAll ? TENANTS : [tenantId!.toLowerCase()];

      console.log(`\n🔏 Signing ${tenantsToSign.length} bundle(s)...\n`);

      // Load signing key
      const keys = await loadSigningKey(keyPath);
      if (!keys) {
        console.error('\n❌ Signing key not found!');
        console.error('   Generate one with: npx ts-node --esm scripts/policy/sign-bundle.ts generate-key --output ./certs/bundle-signing/signing-key');
        console.error('   Or store in GCP Secret Manager: ' + GCP_SECRET_NAME);
        process.exit(1);
      }

      console.log(`   Key ID: ${keys.keyId}\n`);

      const results: SigningResult[] = [];
      for (const tenant of tenantsToSign) {
        console.log(`📦 Signing ${tenant.toUpperCase()} bundle...`);
        const result = await signTenantBundle(tenant, keys);
        results.push(result);
        
        if (result.success) {
          console.log(`   ✅ Signed successfully\n`);
        } else {
          console.log(`   ❌ ${result.error}\n`);
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log('='.repeat(60));
      console.log('Signing Summary');
      console.log('='.repeat(60));
      console.log(`  Total: ${results.length} bundles`);
      console.log(`  ✅ Signed: ${successful}`);
      console.log(`  ❌ Failed: ${failed}`);
      console.log(`  🔑 Key ID: ${keys.keyId}`);

      if (failed > 0) process.exit(1);
      break;
    }

    case 'verify': {
      const verifyAll = args.includes('--all');
      const tenantIndex = args.indexOf('--tenant');
      const tenantId = tenantIndex >= 0 ? args[tenantIndex + 1] : null;

      if (!verifyAll && !tenantId) {
        console.error('❌ Please specify --all or --tenant <ID>');
        process.exit(1);
      }

      const tenantsToVerify = verifyAll ? TENANTS : [tenantId!.toLowerCase()];

      console.log(`\n🔍 Verifying ${tenantsToVerify.length} bundle signature(s)...\n`);

      let allValid = true;
      for (const tenant of tenantsToVerify) {
        console.log(`📦 Verifying ${tenant.toUpperCase()} bundle...`);
        const result = verifyTenantBundle(tenant);
        
        if (result.valid) {
          console.log(`   ✅ Signature valid`);
          console.log(`   🔑 Key ID: ${result.keyId}`);
          console.log(`   📅 Signed: ${result.signedAt}\n`);
        } else {
          console.log(`   ❌ ${result.error}\n`);
          allValid = false;
        }
      }

      console.log('='.repeat(60));
      console.log(`Verification: ${allValid ? '✅ ALL VALID' : '❌ FAILURES DETECTED'}`);
      console.log('='.repeat(60));

      if (!allValid) process.exit(1);
      break;
    }

    case 'generate-key': {
      const outputIndex = args.indexOf('--output');
      const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : DEFAULT_KEY_PATH;
      generateAndSaveKey(outputPath);
      break;
    }

    case 'upload-key': {
      const keyIndex = args.indexOf('--key');
      const keyPath = keyIndex >= 0 ? args[keyIndex + 1] : DEFAULT_KEY_PATH;
      await uploadKeyToGCP(keyPath);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});





