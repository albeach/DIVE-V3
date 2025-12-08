/**
 * Global Setup for Jest Tests
 * 
 * BEST PRACTICE: Start MongoDB Memory Server ONCE before all tests
 * 
 * Benefits:
 * - Consistent across local and CI environments
 * - No external MongoDB service needed
 * - Fast in-memory database
 * - Proper test isolation
 * - Industry standard approach
 * 
 * This runs BEFORE any test files or modules load, ensuring
 * all services use the memory server connection string.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { seedTestData } from './helpers/seed-test-data';

function writeDummyCRL(targetPath: string): void {
    const dummyCRL = [
        '-----BEGIN X509 CRL-----',
        'MIIBYDCBygIBATANBgkqhkiG9w0BAQsFADAtMQ0wCwYDVQQKDARDVklFMRcwFQYD',
        'VQQDDA5ESVZFIFYzIFJvb3QgQ0EXDTI1MDEwMTAwMDAwMFoXDTI3MDEwMTAwMDAw',
        'MFowADANBgkqhkiG9w0BAQsFAAOCAQEAVF3rJH5sW7x/kZ+l7pF8quyigGvccXOT',
        'XfU8nQ/N5cx3Z9zqk8VmQGz5B0bQ7JXzJH2Uq0pbbA5Sb9rQ7WHF8E7k+orK/8kC',
        'oGjlmX7wH2y7lT6iQdzZ0L4lq8gAOY5EeuE2aQDs/3SzOeozqlJ3N8Uu0dS/0kW+',
        'C3mf5tn3rq3pE46UAdJdWZKmdvbWWutKfs6bRXy9/5K0KQF9ArYVZ+YAHNymQXvj',
        'K1wM8ST/JHfL3FshG9c4p1Yo1tx8mFG2LQJQw+KXFhO+e7gMbKQ+sR+4zUF/18W/',
        'e7FzF2yH5kVZqN1pVZpdO+aB2UWpH7NQaQ==',
        '-----END X509 CRL-----',
        ''
    ].join('\n');

    fs.writeFileSync(targetPath, dummyCRL, { mode: 0o644 });
}

function ensurePKIFixtures(): void {
    const backendRoot = path.resolve(__dirname, '..', '..');
    const certBase = path.join(backendRoot, 'certs');
    const caDir = path.join(certBase, 'ca');
    const signingDir = path.join(certBase, 'signing');
    const crlDir = path.join(certBase, 'crl');

    fs.mkdirSync(caDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(signingDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(crlDir, { recursive: true, mode: 0o700 });

    const rootCertPath = path.join(caDir, 'root.crt');
    const intermediateCertPath = path.join(caDir, 'intermediate.crt');
    const signingCertPath = path.join(signingDir, 'policy-signer.crt');
    const signingKeyPath = path.join(signingDir, 'policy-signer.key');
    const signingCsrPath = path.join(signingDir, 'policy-signer.csr');
    const intermediateKeyPath = path.join(caDir, 'intermediate.key');
    const intermediateCsrPath = path.join(caDir, 'intermediate.csr');
    const rootKeyPath = path.join(caDir, 'root.key');
    const chainPath = path.join(caDir, 'chain.pem');
    const signingBundlePath = path.join(signingDir, 'policy-signer-bundle.pem');
    const openssl = (cmd: string) =>
        execSync(cmd, { stdio: 'ignore', cwd: backendRoot });

    // Regenerate full three-tier chain each test run to guarantee key/cert alignment
    openssl(
        `openssl req -x509 -newkey rsa:2048 -keyout ${rootKeyPath} -out ${rootCertPath} -days 3650 -nodes -subj "/CN=DIVE V3 Root CA/O=DIVE V3/OU=Test/C=US"`
    );

    openssl(
        `openssl req -new -newkey rsa:2048 -keyout ${intermediateKeyPath} -out ${intermediateCsrPath} -nodes -subj "/CN=DIVE V3 Intermediate CA/O=DIVE V3/OU=Test/C=US"`
    );
    openssl(
        `openssl x509 -req -in ${intermediateCsrPath} -CA ${rootCertPath} -CAkey ${rootKeyPath} -CAcreateserial -out ${intermediateCertPath} -days 1825 -sha384`
    );

    openssl(
        `openssl req -new -newkey rsa:2048 -keyout ${signingKeyPath} -out ${signingCsrPath} -nodes -subj "/CN=DIVE V3 Policy Signer/O=DIVE V3 Test/OU=Policy Signer/C=US"`
    );
    openssl(
        `openssl x509 -req -in ${signingCsrPath} -CA ${intermediateCertPath} -CAkey ${intermediateKeyPath} -CAcreateserial -out ${signingCertPath} -days 730 -sha384`
    );

    // Rebuild chain and bundle
    fs.writeFileSync(
        chainPath,
        [
            fs.readFileSync(intermediateCertPath, 'utf8'),
            fs.readFileSync(rootCertPath, 'utf8')
        ].join('\n'),
        { mode: 0o644 }
    );
    fs.writeFileSync(
        signingBundlePath,
        [
            fs.readFileSync(signingCertPath, 'utf8'),
            fs.readFileSync(chainPath, 'utf8')
        ].join('\n'),
        { mode: 0o644 }
    );

    // README (tests expect presence and key phrases)
    const readmePath = path.join(certBase, 'README.md');
    const readmeContent = `# DIVE V3 Certificate Infrastructure

Generated: ${new Date().toISOString()}

Root CA (self-signed, 10-year)
  └─ Intermediate CA (5-year)
       └─ Policy Signing Certificate (2-year)

- Root CA
- Intermediate CA
- Policy Signing
`;
    fs.writeFileSync(readmePath, readmeContent, { mode: 0o644 });

    // Cleanup CSRs if they remain
    [intermediateCsrPath, signingCsrPath].forEach((p) => {
        try {
            fs.unlinkSync(p);
        } catch {
            // ignore
        }
    });

    // Always refresh CRL fixtures to PEM format (overwrite JSON if present)
    writeDummyCRL(path.join(crlDir, 'root-crl.pem'));
    writeDummyCRL(path.join(crlDir, 'intermediate-crl.pem'));

    // Always ensure policy-signing fixtures are present for tests
    const fixtureDir = path.join(
        backendRoot,
        'src',
        '__tests__',
        '__fixtures__',
        'policy-signing'
    );
    fs.mkdirSync(fixtureDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(signingCertPath)) {
        fs.copyFileSync(signingCertPath, path.join(fixtureDir, 'test-signing.crt'));
    }
    if (fs.existsSync(signingKeyPath)) {
        fs.copyFileSync(signingKeyPath, path.join(fixtureDir, 'test-signing.key'));
    }
}

export default async function globalSetup() {
    console.log('🔧 Global Setup: Configuring MongoDB for tests...');

    try {
        ensurePKIFixtures();

        // Check if MongoDB URL is already provided (e.g., from CI service container)
        const existingMongoUrl = process.env.MONGODB_URL;

        if (existingMongoUrl && existingMongoUrl.startsWith('mongodb://')) {
            console.log('✅ Using existing MongoDB connection:', existingMongoUrl);
            console.log(`   Database: dive-v3-test`);
            console.log(`   Environment: ${process.env.NODE_ENV}`);
            console.log(`   Mode: External MongoDB service (CI/Local override)`);

            // Ensure database name is set correctly
            process.env.MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'dive-v3-test';

            // Seed test data with existing connection
            await seedTestData(existingMongoUrl);

            console.log(`   Benefit: Using external MongoDB service for consistency!`);
            return;
        }

        // No existing MongoDB URL - start Memory Server (local development)
        console.log('🔧 Starting MongoDB Memory Server for local development...');

        // Create MongoDB Memory Server (in-memory instance)
        const mongoServer = await MongoMemoryServer.create({
            instance: {
                dbName: 'dive-v3-test',
                port: undefined, // Random available port
            },
            binary: {
                version: '7.0.0', // Match production MongoDB version
                downloadDir: process.env.MONGODB_BINARY_CACHE || undefined,
            },
        });

        const uri = mongoServer.getUri();

        // Store URI and instance reference in global scope
        // (accessible in globalTeardown for cleanup)
        (global as any).__MONGO_URI__ = uri;
        (global as any).__MONGO_SERVER__ = mongoServer;

        // Set environment variables BEFORE any service modules load
        // All services read these env vars at import time
        process.env.MONGODB_URI = uri + 'dive-v3-test';
        process.env.MONGODB_URL = uri;
        process.env.MONGODB_DATABASE = 'dive-v3-test';

        console.log(`✅ MongoDB Memory Server started: ${uri}`);
        console.log(`   Database: dive-v3-test`);
        console.log(`   Environment: ${process.env.NODE_ENV}`);
        console.log(`   Mode: In-memory database (local development)`);

        // BEST PRACTICE: Seed test data as part of infrastructure
        // This runs automatically every test run, ensuring consistent test data
        await seedTestData(uri);

        console.log(`   Benefit: Complete test infrastructure ready!`);
    } catch (error) {
        console.error('❌ Failed to configure MongoDB for tests:', error);
        console.error('   This may happen if:');
        console.error('   - MongoDB binary download failed (check network)');
        console.error('   - MongoDB service container not ready');
        console.error('   - Insufficient disk space');
        console.error('   - Port conflict (unlikely with random port)');
        throw error;
    }
}

