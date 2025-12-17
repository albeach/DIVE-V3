const baseConfig = require('./jest.config.js');

module.exports = {
    ...baseConfig,
    // Ensure global setup runs in CI
    globalSetup: '<rootDir>/src/__tests__/globalSetup.ts',
    globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
    // CI-specific overrides - more conservative for reliability
    testMatch: ['**/__tests__/**/*.test.ts', '!**/__tests__/e2e/**/*.test.ts'], // Exclude e2e tests from unit tests
    maxWorkers: 1, // Single worker to avoid conflicts
    testTimeout: 60000, // Longer timeout for CI environments
    workerIdleMemoryLimit: '512MB', // Reasonable memory limit
    forceExit: true,
    detectOpenHandles: false,
    // CI optimizations
    bail: false,
    verbose: false,
    // Ensure proper cleanup
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    // CI trigger: Updated test fixes - monitoring workflow performance
};
