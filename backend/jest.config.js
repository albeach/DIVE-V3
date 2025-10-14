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
    forceExit: false,
    detectOpenHandles: false,
    globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
    coverageThreshold: {
        global: {
            statements: 70,
            branches: 65,
            functions: 70,
            lines: 70
        },
        './src/middleware/authz.middleware.ts': {
            statements: 85,
            branches: 80,
            functions: 85,
            lines: 85
        },
        './src/utils/ztdf.utils.ts': {
            statements: 90,
            branches: 85,
            functions: 90,
            lines: 90
        },
        './src/services/resource.service.ts': {
            statements: 85,
            branches: 80,
            functions: 85,
            lines: 85
        }
    }
};

