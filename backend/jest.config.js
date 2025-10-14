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
    forceExit: true,
    detectOpenHandles: false,
    globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
    coverageThreshold: {
        global: {
            statements: 8,
            branches: 7,
            functions: 7,
            lines: 8
        },
        './src/middleware/authz.middleware.ts': {
            statements: 70,
            branches: 45,
            functions: 85,
            lines: 70
        },
        './src/utils/ztdf.utils.ts': {
            statements: 90,
            branches: 85,
            functions: 90,
            lines: 90
        },
        './src/middleware/enrichment.middleware.ts': {
            statements: 90,
            branches: 90,
            functions: 100,
            lines: 90
        },
        './src/middleware/error.middleware.ts': {
            statements: 95,
            branches: 95,
            functions: 100,
            lines: 95
        }
    }
};

