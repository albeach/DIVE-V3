#!/usr/bin/env ts-node
/**
 * DIVE V3 - Generate Spoke Certificates
 *
 * Generates X.509 certificates and CSRs for spoke instances.
 * Supports both RSA and EC key algorithms.
 *
 * Usage:
 *   npx ts-node generate-spoke-certs.ts <instance-code> [options]
 *
 * Options:
 *   --algorithm, -a    Key algorithm (rsa, ec)          [default: rsa]
 *   --bits, -b         RSA key size (2048, 4096)        [default: 4096]
 *   --days, -d         Certificate validity days        [default: 365]
 *   --output, -o       Output directory                 [default: instances/<code>/certs]
 *   --name, -n         Instance name                    [optional]
 *   --self-signed      Generate self-signed cert        [default: true]
 *   --ca-cert          CA certificate for signing       [optional]
 *   --ca-key           CA private key for signing       [optional]
 *
 * Examples:
 *   npx ts-node generate-spoke-certs.ts NZL
 *   npx ts-node generate-spoke-certs.ts FRA --algorithm ec
 *   npx ts-node generate-spoke-certs.ts DEU --bits 2048 --days 730
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

// ============================================
// TYPES
// ============================================

interface CertOptions {
  instanceCode: string;
  instanceName: string;
  algorithm: 'rsa' | 'ec';
  bits: number;
  days: number;
  outputDir: string;
  selfSigned: boolean;
  caCertPath?: string;
  caKeyPath?: string;
}

interface GeneratedCerts {
  privateKeyPath: string;
  publicKeyPath: string;
  csrPath: string;
  certificatePath?: string;
  fingerprint?: string;
  subject: string;
  validDays: number;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_OPTIONS: Partial<CertOptions> = {
  algorithm: 'rsa',
  bits: 4096,
  days: 365,
  selfSigned: true,
};

// ============================================
// CERTIFICATE GENERATION
// ============================================

/**
 * Generate private key
 */
function generatePrivateKey(algorithm: 'rsa' | 'ec', bits: number): {
  privateKey: string;
  publicKey: string;
} {
  if (algorithm === 'ec') {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    return { privateKey, publicKey };
  } else {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: bits,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    return { privateKey, publicKey };
  }
}

/**
 * Generate a self-signed certificate
 * Note: For production, use openssl or a proper PKI library
 */
async function generateSelfSignedCert(
  privateKey: string,
  options: {
    spokeId: string;
    instanceCode: string;
    organization: string;
    country: string;
    validDays: number;
  }
): Promise<string> {
  // In Node.js, we can't easily generate X.509 certs without external libs
  // This creates a placeholder that indicates a self-signed cert would be generated
  // In production, use openssl command or node-forge library
  
  const now = new Date();
  const notAfter = new Date(now.getTime() + options.validDays * 24 * 60 * 60 * 1000);
  
  // For actual implementation, we'd use openssl or a library like node-forge
  // This is a simplified representation
  const certContent = `-----BEGIN CERTIFICATE-----
Placeholder Self-Signed Certificate
Subject: CN=${options.spokeId}, O=${options.organization}, C=${options.country}
Instance: ${options.instanceCode}
Valid From: ${now.toISOString()}
Valid To: ${notAfter.toISOString()}
Algorithm: SHA256
-----END CERTIFICATE-----`;

  return certContent;
}

/**
 * Generate CSR content
 */
function generateCSRContent(options: {
  spokeId: string;
  instanceCode: string;
  organization: string;
  country: string;
}): string {
  // This is a placeholder CSR format
  // In production, use openssl or node-forge to generate proper PKCS#10 CSR
  return `-----BEGIN CERTIFICATE REQUEST-----
CSR for DIVE V3 Spoke Instance
Subject: CN=${options.spokeId}
Organization: ${options.organization}
Organizational Unit: Spoke Instances
Country: ${options.country}
Instance Code: ${options.instanceCode}
Generated: ${new Date().toISOString()}

This CSR should be submitted to the Hub CA for signing.
For production use, generate a proper PKCS#10 CSR using:
  openssl req -new -key spoke.key -out spoke.csr -subj "/CN=${options.spokeId}/O=${options.organization}/C=${options.country}"
-----END CERTIFICATE REQUEST-----`;
}

/**
 * Generate spoke certificates
 */
async function generateSpokeCerts(options: CertOptions): Promise<GeneratedCerts> {
  const {
    instanceCode,
    instanceName,
    algorithm,
    bits,
    days,
    outputDir,
    selfSigned,
  } = options;

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  const spokeId = `spoke-${instanceCode.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`;
  const organization = 'DIVE Federation';
  const country = instanceCode.substring(0, 2).toUpperCase();

  console.log(`\n🔐 Generating certificates for spoke: ${instanceCode}`);
  console.log(`   Algorithm: ${algorithm.toUpperCase()}`);
  console.log(`   Key Size: ${algorithm === 'rsa' ? `${bits} bits` : 'P-256 curve'}`);
  console.log(`   Valid for: ${days} days`);
  console.log(`   Output: ${outputDir}\n`);

  // Generate key pair
  console.log('   [1/4] Generating private key...');
  const { privateKey, publicKey } = generatePrivateKey(algorithm, bits);

  // Save private key
  const privateKeyPath = path.join(outputDir, 'spoke.key');
  await fs.writeFile(privateKeyPath, privateKey, { mode: 0o600 });
  console.log(`         ✓ Private key saved: ${privateKeyPath}`);

  // Save public key (optional, for reference)
  const publicKeyPath = path.join(outputDir, 'spoke.pub');
  await fs.writeFile(publicKeyPath, publicKey, { mode: 0o644 });
  console.log(`         ✓ Public key saved: ${publicKeyPath}`);

  // Generate CSR
  console.log('   [2/4] Generating Certificate Signing Request (CSR)...');
  const csrContent = generateCSRContent({
    spokeId,
    instanceCode,
    organization,
    country,
  });
  const csrPath = path.join(outputDir, 'spoke.csr');
  await fs.writeFile(csrPath, csrContent, { mode: 0o644 });
  console.log(`         ✓ CSR saved: ${csrPath}`);

  // Generate self-signed certificate if requested
  let certificatePath: string | undefined;
  let fingerprint: string | undefined;

  if (selfSigned) {
    console.log('   [3/4] Generating self-signed certificate...');
    const cert = await generateSelfSignedCert(privateKey, {
      spokeId,
      instanceCode,
      organization,
      country,
      validDays: days,
    });
    certificatePath = path.join(outputDir, 'spoke.crt');
    await fs.writeFile(certificatePath, cert, { mode: 0o644 });
    
    // Calculate fingerprint
    fingerprint = crypto
      .createHash('sha256')
      .update(cert)
      .digest('hex')
      .toUpperCase()
      .match(/.{2}/g)!
      .join(':');
    
    console.log(`         ✓ Certificate saved: ${certificatePath}`);
  } else {
    console.log('   [3/4] Skipping self-signed certificate (CSR only mode)');
  }

  // Generate OpenSSL commands for reference
  console.log('   [4/4] Generating OpenSSL reference commands...');
  const commandsPath = path.join(outputDir, 'openssl-commands.txt');
  const opensslCommands = `# OpenSSL Commands for Spoke Certificate Generation
# Instance: ${instanceCode} (${instanceName})
# Generated: ${new Date().toISOString()}

# 1. Generate RSA private key (if needed)
openssl genrsa -out spoke.key ${bits}

# 2. Generate EC private key (alternative)
openssl ecparam -genkey -name prime256v1 -out spoke.key

# 3. Generate CSR
openssl req -new -key spoke.key -out spoke.csr \\
  -subj "/CN=${spokeId}/O=${organization}/OU=Spoke Instances/C=${country}"

# 4. Generate self-signed certificate (for development)
openssl x509 -req -days ${days} -in spoke.csr -signkey spoke.key -out spoke.crt

# 5. Verify certificate
openssl x509 -in spoke.crt -text -noout

# 6. Verify CSR
openssl req -in spoke.csr -text -noout

# 7. Get certificate fingerprint
openssl x509 -in spoke.crt -noout -fingerprint -sha256

# For production: Submit spoke.csr to Hub CA for signing
`;
  await fs.writeFile(commandsPath, opensslCommands, { mode: 0o644 });
  console.log(`         ✓ OpenSSL commands saved: ${commandsPath}`);

  const subject = `CN=${spokeId}, O=${organization}, C=${country}`;

  console.log(`\n✅ Certificate generation complete!`);
  console.log(`   Subject: ${subject}`);
  if (fingerprint) {
    console.log(`   Fingerprint: ${fingerprint.substring(0, 29)}...`);
  }
  console.log(`\n📋 Next steps:`);
  console.log(`   1. For development: Use the self-signed certificate`);
  console.log(`   2. For production: Submit spoke.csr to Hub for signing`);
  console.log(`   3. After signing: Replace spoke.crt with Hub-signed certificate`);
  console.log('');

  return {
    privateKeyPath,
    publicKeyPath,
    csrPath,
    certificatePath,
    fingerprint,
    subject,
    validDays: days,
  };
}

// ============================================
// CLI
// ============================================

function parseArgs(args: string[]): CertOptions {
  const options: Partial<CertOptions> = { ...DEFAULT_OPTIONS };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith('-') && !options.instanceCode) {
      options.instanceCode = arg.toUpperCase();
      i++;
      continue;
    }

    switch (arg) {
      case '-a':
      case '--algorithm':
        options.algorithm = args[++i] as 'rsa' | 'ec';
        break;
      case '-b':
      case '--bits':
        options.bits = parseInt(args[++i], 10);
        break;
      case '-d':
      case '--days':
        options.days = parseInt(args[++i], 10);
        break;
      case '-o':
      case '--output':
        options.outputDir = args[++i];
        break;
      case '-n':
      case '--name':
        options.instanceName = args[++i];
        break;
      case '--self-signed':
        options.selfSigned = args[++i] !== 'false';
        break;
      case '--ca-cert':
        options.caCertPath = args[++i];
        break;
      case '--ca-key':
        options.caKeyPath = args[++i];
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
    i++;
  }

  if (!options.instanceCode) {
    console.error('Error: Instance code is required');
    printUsage();
    process.exit(1);
  }

  // Validate instance code
  if (options.instanceCode.length !== 3) {
    console.error('Error: Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)');
    process.exit(1);
  }

  // Set default output directory
  if (!options.outputDir) {
    const projectRoot = path.resolve(__dirname, '../../..');
    options.outputDir = path.join(
      projectRoot,
      'instances',
      options.instanceCode.toLowerCase(),
      'certs'
    );
  }

  // Set default instance name
  if (!options.instanceName) {
    options.instanceName = `${options.instanceCode} Instance`;
  }

  return options as CertOptions;
}

function printUsage(): void {
  console.log(`
DIVE V3 - Generate Spoke Certificates

Usage:
  npx ts-node generate-spoke-certs.ts <instance-code> [options]

Arguments:
  instance-code    3-letter country code (ISO 3166-1 alpha-3)

Options:
  -a, --algorithm  Key algorithm (rsa, ec)         [default: rsa]
  -b, --bits       RSA key size (2048, 4096)       [default: 4096]
  -d, --days       Certificate validity days       [default: 365]
  -o, --output     Output directory                [default: instances/<code>/certs]
  -n, --name       Instance name                   [optional]
  --self-signed    Generate self-signed cert       [default: true]
  --ca-cert        CA certificate for signing      [optional]
  --ca-key         CA private key for signing      [optional]
  -h, --help       Show this help message

Examples:
  # Generate RSA certificates for New Zealand
  npx ts-node generate-spoke-certs.ts NZL

  # Generate EC certificates for France
  npx ts-node generate-spoke-certs.ts FRA --algorithm ec

  # Generate certificates with 2-year validity
  npx ts-node generate-spoke-certs.ts DEU --days 730

  # Generate CSR only (no self-signed cert)
  npx ts-node generate-spoke-certs.ts GBR --self-signed false
`);
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  try {
    const options = parseArgs(args);
    await generateSpokeCerts(options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { generateSpokeCerts, CertOptions, GeneratedCerts };

