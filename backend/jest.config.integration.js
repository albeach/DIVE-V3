/**
 * Jest Configuration for Integration Tests
 *
 * Modern Best Practice (2026):
 * - Integration tests run in a SINGLE PROCESS (no workers)
 * - No globalSetup/globalTeardown (causes serialization issues with axios/http clients)
 * - Each test file manages its own setup/teardown
 * - Tests are self-contained and can run independently
 */

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.integration.test.ts'],
    // NO globalSetup/globalTeardown - causes worker serialization issues
    setupFilesAfterEnv: [], // Integration tests don't need global setup
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true
            }
        }]
    },
    testTimeout: 30000, // Integration tests are slower
    maxWorkers: 1, // CRITICAL: Single worker to avoid serialization
    forceExit: true,
    detectOpenHandles: false,
    bail: false,
    verbose: true,
    // NO coverage for integration tests (they're about external services, not code coverage)
    collectCoverage: false,
};
