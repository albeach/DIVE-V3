/**
 * Jest Setup File
 * Configures test environment and global settings
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SKIP_INTEGRATION_TESTS = 'true';
process.env.KEYCLOAK_URL = 'http://localhost:8081';
process.env.KEYCLOAK_REALM = 'dive-v3-pilot';
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

// Suppress console logs during tests (optional)
if (process.env.SILENT_TESTS === 'true') {
    global.console = {
        ...console,
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
    // Allow time for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
});

