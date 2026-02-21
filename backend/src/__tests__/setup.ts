/**
 * Jest Setup File
 * Configures test environment and global settings
 */

import fs from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SKIP_INTEGRATION_TESTS = 'true';
process.env.KEYCLOAK_URL = 'http://localhost:8081';
process.env.KEYCLOAK_REALM = 'dive-v3-broker-usa';
process.env.KEYCLOAK_CLIENT_ID = 'dive-v3-client';
process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
process.env.KEYCLOAK_ADMIN_USERNAME = 'admin';
process.env.KEYCLOAK_ADMIN_PASSWORD = 'admin';
process.env.OPA_URL = 'http://localhost:8181';
process.env.KAS_URL = 'https://localhost:8080'; // Session expiration fix: KAS URL for tests

// BEST PRACTICE: MongoDB connection configured by globalSetup
// globalSetup starts MongoDB Memory Server and sets MONGODB_URL/MONGODB_URI
// DON'T override here - let globalSetup be the single source of truth
// This ensures consistent behavior across local and CI environments
if (!process.env.MONGODB_URL && !process.env.MONGODB_URI) {
    // Only set if not already set by globalSetup (MongoDB Memory Server)
    process.env.MONGODB_URI = 'mongodb://localhost:27017/dive-v3-test';
    process.env.MONGODB_URL = 'mongodb://localhost:27017';
}

process.env.MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'dive-v3-test';

// Ensure test RSA keys exist for integration tests that sign RS256 JWTs
const testKeysDir = path.join(__dirname, 'keys');
const testPrivateKeyPath = path.join(testKeysDir, 'test-private-key.pem');
const testPublicKeyPath = path.join(testKeysDir, 'test-public-key.pem');

if (!fs.existsSync(testPrivateKeyPath) || !fs.existsSync(testPublicKeyPath)) {
    fs.mkdirSync(testKeysDir, { recursive: true });

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    fs.writeFileSync(testPrivateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(testPublicKeyPath, publicKey, { encoding: 'utf8', mode: 0o644 });
}

// Mock Winston logger to prevent EPIPE errors during test shutdown
// This is the primary cause of Jest hanging - Winston tries to write to closed streams
jest.mock('winston', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        add: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn(),
        close: jest.fn(),
    };

    return {
        createLogger: jest.fn(() => mockLogger),
        transports: {
            Console: jest.fn(),
            File: jest.fn(),
        },
        format: {
            combine: jest.fn(),
            timestamp: jest.fn(),
            json: jest.fn(),
            printf: jest.fn(),
            errors: jest.fn(),
            colorize: jest.fn(),
        },
    };
});

// Also mock the logger utility specifically
jest.mock('../utils/logger', () => {
    const mockLogger: any = {
        info: jest.fn(),
        warn: jest.fn((msg: any, meta: any) => console.warn(msg, meta)),
        error: jest.fn((msg: any, meta: any) => console.error(msg, meta)),
        debug: jest.fn(),
        log: jest.fn(),
    };
    mockLogger.child = jest.fn(() => mockLogger);
    return { logger: mockLogger };
});

// Global test timeout
jest.setTimeout(10000);

// Global MongoDB singleton initialization for all tests
// globalSetup runs in separate process, so we re-connect here in test worker
beforeAll(async () => {
    try {
        const { mongoSingleton } = await import('../utils/mongodb-singleton');
        if (!mongoSingleton.isConnected()) {
            await mongoSingleton.connect();
            console.log('[Test Worker] MongoDB singleton connected');
        }
    } catch (error) {
        console.warn('[Test Worker] Could not connect MongoDB singleton - tests may fail:', error);
    }
}, 30000); // Allow up to 30s for MongoDB connection

// Database connection helper for tests
export function getTestDatabase(): { mongoClient: any; db: any } | null {
    // Use the global MongoDB connection established by globalSetup
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL;
    if (!mongoUri) {
        console.warn('[Test Setup] No MongoDB connection available');
        return null;
    }

    try {
        // Return connection info - tests should NOT create their own connections
        // Global setup handles connection lifecycle
        return {
            mongoClient: null, // Global setup manages this
            db: null // Tests should use service methods, not direct DB access
        };
    } catch (error) {
        console.warn('[Test Setup] Database connection issue:', error);
        return null;
    }
}

// Memory cleanup utility for tests
export function cleanupTestResources(): void {
    // Clear all jest mocks and timers
    jest.clearAllMocks();
    jest.clearAllTimers();

    // Clear any cached modules that might hold connections
    jest.resetModules();

    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
}

// Test timeout helper
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}

// Clean up after all tests
afterAll(async () => {
    // Force cleanup of any remaining async operations
    // This prevents Jest from hanging due to unhandled promises/timers

    // Clear all jest mocks and timers FIRST
    jest.clearAllMocks();
    jest.clearAllTimers();

    // Clear any cached modules that might hold connections
    jest.resetModules();

    // Allow time for async operations to complete gracefully
    await new Promise(resolve => setTimeout(resolve, 500));

    // Force garbage collection if available (helps clean up dangling references)
    if (global.gc) {
        global.gc();
    }

    // Final cleanup delay
    await new Promise(resolve => setTimeout(resolve, 200));
}, 15000); // Reduced timeout since we have better cleanup
