/**
 * Testing Utilities
 * 
 * Helpers for testing React Query hooks, mocking API calls,
 * and simulating user interactions.
 */

import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================
// Test Query Client
// ============================================

/**
 * Create a QueryClient configured for testing
 * - Disables retries for predictable tests
 * - Disables refetch on window focus
 * - Shorter stale time
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// ============================================
// Wrapper Components
// ============================================

interface TestWrapperProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

/**
 * Wrapper for testing components that use React Query
 */
export function createTestWrapper(queryClient?: QueryClient) {
  const client = queryClient || createTestQueryClient();
  
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  };
}

// ============================================
// Mock Response Helpers
// ============================================

/**
 * Create a successful API response
 */
export function mockSuccess<T>(data: T, delay = 0): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });
}

/**
 * Create a failed API response
 */
export function mockError(message: string, status = 500, delay = 0): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, delay);
  });
}

/**
 * Create a mock fetch implementation
 */
export function createMockFetch(responses: Record<string, unknown>) {
  return jest.fn().mockImplementation((url: string) => {
    const urlPath = new URL(url, 'http://localhost').pathname;
    const response = responses[urlPath];

    if (response === undefined) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    });
  });
}

// ============================================
// User Event Helpers
// ============================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for next tick (useful for React state updates)
 */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Session Mocking
// ============================================

export const mockSession = {
  admin: {
    user: {
      id: 'test-admin-id',
      name: 'Test Admin',
      email: 'admin@test.com',
      roles: ['super_admin', 'admin'],
      clearance: 'TOP_SECRET',
      countryOfAffiliation: 'USA',
      uniqueID: 'admin-usa-001',
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  user: {
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'user@test.com',
      roles: ['user'],
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      uniqueID: 'testuser-usa-001',
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  guest: {
    user: {
      id: 'test-guest-id',
      name: 'Guest',
      email: 'guest@test.com',
      roles: [],
      clearance: 'UNCLASSIFIED',
      countryOfAffiliation: 'USA',
      uniqueID: 'guest-usa-001',
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
};

// ============================================
// Accessibility Testing
// ============================================

/**
 * Check if element has accessible name
 */
export function hasAccessibleName(element: HTMLElement): boolean {
  const name = element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby') ||
    element.textContent?.trim();
  return !!name;
}

/**
 * Check keyboard navigation order
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
}

/**
 * Assert focus order matches expected elements
 */
export function assertFocusOrder(
  container: HTMLElement,
  expectedOrder: string[]
): void {
  const focusable = getFocusableElements(container);
  const actualOrder = focusable.map((el) => {
    return el.getAttribute('data-testid') || el.textContent?.trim() || '';
  });

  for (let i = 0; i < expectedOrder.length; i++) {
    if (actualOrder[i] !== expectedOrder[i]) {
      throw new Error(
        `Focus order mismatch at index ${i}: expected "${expectedOrder[i]}", got "${actualOrder[i]}"`
      );
    }
  }
}

// ============================================
// Performance Testing
// ============================================

/**
 * Measure render time
 */
export function measureRenderTime(
  renderFn: () => void
): { duration: number; timestamp: number } {
  const start = performance.now();
  renderFn();
  const end = performance.now();

  return {
    duration: end - start,
    timestamp: Date.now(),
  };
}

/**
 * Assert render is within threshold
 */
export function assertRenderTime(
  renderFn: () => void,
  maxMs: number
): void {
  const { duration } = measureRenderTime(renderFn);
  if (duration > maxMs) {
    throw new Error(
      `Render took ${duration.toFixed(2)}ms, exceeds threshold of ${maxMs}ms`
    );
  }
}

// ============================================
// Data Generators for Tests
// ============================================

export const testData = {
  user: (overrides = {}) => ({
    id: `user-${Date.now()}`,
    username: `testuser-${Math.random().toString(36).slice(2, 8)}`,
    email: `test${Date.now()}@dive.mil`,
    enabled: true,
    clearance: 'SECRET',
    countryOfAffiliation: 'USA',
    roles: ['user'],
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  auditLog: (overrides = {}) => ({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    eventType: 'ACCESS_GRANTED',
    subject: 'testuser-usa-001',
    resourceId: 'doc-001',
    outcome: 'success',
    ...overrides,
  }),

  idp: (overrides = {}) => ({
    alias: `idp-${Date.now()}`,
    displayName: 'Test IdP',
    providerId: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://test.idp/auth',
      tokenUrl: 'https://test.idp/token',
      clientId: 'test-client',
    },
    ...overrides,
  }),
};

export default {
  createTestQueryClient,
  createTestWrapper,
  mockSuccess,
  mockError,
  createMockFetch,
  waitFor,
  tick,
  sleep,
  mockSession,
  hasAccessibleName,
  getFocusableElements,
  assertFocusOrder,
  measureRenderTime,
  assertRenderTime,
  testData,
};

