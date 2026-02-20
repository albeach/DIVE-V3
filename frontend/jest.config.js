const nextJest = require('next/jest')

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
    // Add more setup options before each test is run
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        // Handle module aliases (this will be automatically configured for you soon)
        '^@/(.*)$': '<rootDir>/src/$1',

        // Handle CSS imports (with CSS modules)
        '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',

        // Handle CSS imports (without CSS modules)
        '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',

        // Handle image imports
        '^.+\\.(jpg|jpeg|png|gif|webp|avif|svg)$': '<rootDir>/__mocks__/fileMock.js',
    },
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/.next/',
        '<rootDir>/src/__tests__/e2e/',
        '<rootDir>/src/__tests__/helpers/',
        '<rootDir>/src/components/admin/federation/__tests__/TokenExpiryBadge.test.tsx',
    ],
    transformIgnorePatterns: [
        '/node_modules/',
        '^.+\\.module\\.(css|sass|scss)$',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/src/__tests__/',
        '/src/types/',
        '/src/lib/auth.ts', // NextAuth config
    ],
    collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.stories.{js,jsx,ts,tsx}',
        '!src/**/__tests__/**',
    ],
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
        '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
        '!<rootDir>/src/__tests__/e2e/**',
    ],
    moduleDirectories: ['node_modules', '<rootDir>/'],

    // Performance and memory optimizations
    testTimeout: 10000, // 10 second timeout for unit tests
    maxWorkers: '50%', // Use 50% of available cores
    workerIdleMemoryLimit: '512MB', // Restart workers if they exceed memory limit

    // CI optimizations - GitHub Actions paid plan has higher limits
    ...(process.env.CI && {
        maxWorkers: 4, // GitHub Actions paid plan allows more workers
        testTimeout: 20000, // Longer timeout for CI
        workerIdleMemoryLimit: '1GB', // Higher memory limit for paid plan
        // Enable verbose output for CI debugging
        verbose: false, // Keep clean output
        bail: false, // Don't stop on first failure
        // Force exit to prevent hanging
        forceExit: true,
        detectOpenHandles: false,
    }),

    // Memory management
    // Keep setup-file mock implementations (e.g., matchMedia/IntersectionObserver)
    // stable across tests; clearMocks/restoreMocks still reset call history/state.
    resetMocks: false,
    restoreMocks: true,
    clearMocks: true,

    // Better error reporting
    notify: false, // Disable OS notifications in CI
    notifyMode: 'failure-change', // Only notify on status changes
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
