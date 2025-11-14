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

// CRITICAL: Force resource service to use test database (not production dive-v3)
// Include auth credentials for local MongoDB running with --auth
process.env.MONGODB_URI = 'mongodb://admin:password@localhost:27017/dive-v3-test';
process.env.MONGODB_URL = 'mongodb://admin:password@localhost:27017';
process.env.MONGODB_DATABASE = 'dive-v3-test';

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

