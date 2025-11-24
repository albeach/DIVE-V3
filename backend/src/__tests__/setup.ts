/**
 * Jest Setup File
 * Configures test environment and global settings
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SKIP_INTEGRATION_TESTS = 'true';
process.env.KEYCLOAK_URL = 'http://localhost:8081';
process.env.KEYCLOAK_REALM = 'dive-v3-broker';
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
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
    },
}));

// Global test timeout
jest.setTimeout(10000);

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

