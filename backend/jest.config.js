module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/__tests__/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
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
    globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts'
};

