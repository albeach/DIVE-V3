/**
 * Centralized Mock Utilities for Frontend Tests
 * 
 * Provides reusable mocks for common browser APIs and patterns:
 * - IntersectionObserver
 * - ResizeObserver
 * - Window.matchMedia
 * - localStorage (with correct pattern)
 */

// IntersectionObserver Mock
export const createMockIntersectionObserver = () => {
  const mockObserve = jest.fn();
  const mockUnobserve = jest.fn();
  const mockDisconnect = jest.fn();
  
  let observerCallback: IntersectionObserverCallback | null = null;
  
  const MockIntersectionObserver = jest.fn().mockImplementation((callback: IntersectionObserverCallback) => {
    observerCallback = callback;
    return {
      observe: mockObserve,
      unobserve: mockUnobserve,
      disconnect: mockDisconnect,
      callback,
      // Helper to trigger intersection
      trigger: (isIntersecting: boolean, entries?: Partial<IntersectionObserverEntry>[]) => {
        if (observerCallback) {
          const entry = {
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: {} as DOMRectReadOnly,
            rootBounds: null,
            target: document.createElement('div'),
            time: Date.now(),
            ...entries?.[0],
          } as IntersectionObserverEntry;
          observerCallback([entry], {} as IntersectionObserver);
        }
      },
    };
  });
  
  return {
    MockIntersectionObserver,
    mockObserve,
    mockUnobserve,
    mockDisconnect,
  };
};

// ResizeObserver Mock
export const createMockResizeObserver = () => {
  const mockObserve = jest.fn();
  const mockUnobserve = jest.fn();
  const mockDisconnect = jest.fn();
  
  const MockResizeObserver = jest.fn().mockImplementation(() => ({
    observe: mockObserve,
    unobserve: mockUnobserve,
    disconnect: mockDisconnect,
  }));
  
  return {
    MockResizeObserver,
    mockObserve,
    mockUnobserve,
    mockDisconnect,
  };
};

// Window.matchMedia Mock
export const createMockMatchMedia = (matches: boolean = false) => {
  const mockMatchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  
  return mockMatchMedia;
};

// localStorage Mock (with correct pattern: direct function for getItem, jest.fn for setItem)
export const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
  
  return mockLocalStorage;
};

// Setup all mocks globally
export const setupGlobalMocks = () => {
  const { MockIntersectionObserver } = createMockIntersectionObserver();
  const { MockResizeObserver } = createMockResizeObserver();
  const mockMatchMedia = createMockMatchMedia();
  
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  window.matchMedia = mockMatchMedia;
  
  return {
    IntersectionObserver: MockIntersectionObserver,
    ResizeObserver: MockResizeObserver,
    matchMedia: mockMatchMedia,
  };
};

