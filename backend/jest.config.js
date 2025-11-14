module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/__tests__/**',
        '!src/__mocks__/**',
        '!src/server.ts',
        '!src/scripts/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true
            }
        }]
    },
    transformIgnorePatterns: [
        'node_modules/(?!(@keycloak)/)'
    ],
    moduleNameMapper: {
        '^@keycloak/keycloak-admin-client$': '<rootDir>/src/__mocks__/keycloak-admin-client.ts'
    },
    testTimeout: 15000,
    maxWorkers: 1, // Run tests sequentially to prevent MongoDB interference
    forceExit: true,
    detectOpenHandles: false,
    globalSetup: '<rootDir>/src/__tests__/globalSetup.ts',
    globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
    // Phase 4 - Comprehensive Coverage Thresholds
    // Global thresholds: >95% for all metrics
    // Critical services require 100% coverage
    coverageThreshold: {
        global: {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        },
        // Critical services require 100% coverage
        './src/services/risk-scoring.service.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        },
        './src/services/authz-cache.service.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        },
        './src/middleware/authz.middleware.ts': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        },
        './src/services/idp-validation.service.ts': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        },
        './src/services/compliance-validation.service.ts': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        },
        './src/services/analytics.service.ts': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        },
        './src/services/health.service.ts': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        }
    }
};

