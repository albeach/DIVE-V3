// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter() {
        return {
            push: jest.fn(),
            replace: jest.fn(),
            prefetch: jest.fn(),
            back: jest.fn(),
            pathname: '/',
            query: {},
            asPath: '/',
        }
    },
    useSearchParams() {
        return new URLSearchParams()
    },
    usePathname() {
        return '/'
    },
}))

// Mock NextAuth
jest.mock('next-auth/react', () => ({
    useSession() {
        return {
            data: {
                user: {
                    uniqueID: 'test-user',
                    name: 'Test User',
                    email: 'test@example.com',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                },
                expires: '2025-12-31',
            },
            status: 'authenticated',
        }
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
    SessionProvider: ({ children }) => children,
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { }, // Deprecated
        removeListener: () => { }, // Deprecated
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => false,
    }),
})

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: () => { },
})

// Mock window.requestAnimationFrame
global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16)
global.cancelAnimationFrame = id => clearTimeout(id)

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor(cb) {
        this.cb = cb
    }
    observe() { }
    unobserve() { }
    disconnect() { }
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor() { }
    disconnect() { }
    observe() { }
    takeRecords() {
        return []
    }
    unobserve() { }
}

// Keep native performance object intact and patch missing methods only
if (typeof window.performance.now !== 'function') {
    Object.defineProperty(window.performance, 'now', {
        configurable: true,
        value: () => Date.now(),
    })
}

Object.defineProperty(window.performance, 'mark', {
    configurable: true,
    value: jest.fn(),
})

Object.defineProperty(window.performance, 'measure', {
    configurable: true,
    value: jest.fn(),
})

Object.defineProperty(window.performance, 'getEntriesByName', {
    configurable: true,
    value: jest.fn(() => []),
})

Object.defineProperty(window.performance, 'getEntriesByType', {
    configurable: true,
    value: jest.fn(() => []),
})

// Suppress console errors/warnings in tests (optional)
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
}
