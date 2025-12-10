/**
 * useAbortController Hook
 * 
 * Phase 1: Performance Foundation
 * Request cancellation utilities for API calls
 * 
 * Features:
 * - Automatic cleanup on unmount
 * - Request deduplication
 * - Timeout support
 * - Multiple concurrent request management
 */

import { useRef, useCallback, useEffect, useState } from 'react';

// ============================================
// Types
// ============================================

export interface UseAbortControllerOptions {
  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;
  /** Whether to cancel on cleanup */
  cancelOnUnmount?: boolean;
}

export interface UseAbortControllerReturn {
  /** Get a new AbortSignal for a request */
  getSignal: (requestId?: string) => AbortSignal;
  /** Cancel a specific request by ID */
  cancel: (requestId?: string) => void;
  /** Cancel all pending requests */
  cancelAll: () => void;
  /** Check if a specific request is pending */
  isPending: (requestId?: string) => boolean;
}

// ============================================
// Single Controller Hook
// ============================================

/**
 * Simple hook for single request cancellation
 */
export function useAbortController({
  timeout = 0,
  cancelOnUnmount = true,
}: UseAbortControllerOptions = {}): UseAbortControllerReturn {
  const controllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch (err) {
        console.debug('[useAbortController] AbortController cleanup:', err);
      }
      controllerRef.current = null;
    }
  }, []);

  const getSignal = useCallback((_requestId?: string): AbortSignal => {
    // Cancel any existing request
    cleanup();
    
    // Create new controller
    controllerRef.current = new AbortController();
    
    // Set timeout if specified
    if (timeout > 0) {
      timeoutRef.current = setTimeout(() => {
        controllerRef.current?.abort('Request timeout');
      }, timeout);
    }
    
    return controllerRef.current.signal;
  }, [cleanup, timeout]);

  const cancel = useCallback((_requestId?: string) => {
    cleanup();
  }, [cleanup]);

  const cancelAll = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const isPending = useCallback((_requestId?: string): boolean => {
    return controllerRef.current !== null && !controllerRef.current.signal.aborted;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelOnUnmount) {
        cleanup();
      }
    };
  }, [cancelOnUnmount, cleanup]);

  return {
    getSignal,
    cancel,
    cancelAll,
    isPending,
  };
}

// ============================================
// Multiple Controllers Hook
// ============================================

/**
 * Hook for managing multiple concurrent requests
 */
export function useAbortControllers({
  timeout = 0,
  cancelOnUnmount = true,
}: UseAbortControllerOptions = {}): UseAbortControllerReturn {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const cleanupOne = useCallback((requestId: string) => {
    const timeout = timeoutsRef.current.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(requestId);
    }

    const controller = controllersRef.current.get(requestId);
    if (controller) {
      try {
        controller.abort();
      } catch (err) {
        console.debug('[useAbortController] AbortController cleanup:', err);
      }
      controllersRef.current.delete(requestId);
    }
  }, []);

  const cleanupAll = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();

    controllersRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch (err) {
        console.debug('[useAbortController] AbortController cleanup:', err);
      }
    });
    controllersRef.current.clear();
  }, []);

  const getSignal = useCallback((requestId: string = 'default'): AbortSignal => {
    // Cancel any existing request with same ID
    cleanupOne(requestId);
    
    // Create new controller
    const controller = new AbortController();
    controllersRef.current.set(requestId, controller);
    
    // Set timeout if specified
    if (timeout > 0) {
      const timeoutId = setTimeout(() => {
        controller.abort('Request timeout');
        controllersRef.current.delete(requestId);
        timeoutsRef.current.delete(requestId);
      }, timeout);
      timeoutsRef.current.set(requestId, timeoutId);
    }
    
    return controller.signal;
  }, [cleanupOne, timeout]);

  const cancel = useCallback((requestId: string = 'default') => {
    cleanupOne(requestId);
  }, [cleanupOne]);

  const cancelAll = useCallback(() => {
    cleanupAll();
  }, [cleanupAll]);

  const isPending = useCallback((requestId: string = 'default'): boolean => {
    const controller = controllersRef.current.get(requestId);
    return controller !== null && controller !== undefined && !controller.signal.aborted;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelOnUnmount) {
        cleanupAll();
      }
    };
  }, [cancelOnUnmount, cleanupAll]);

  return {
    getSignal,
    cancel,
    cancelAll,
    isPending,
  };
}

// ============================================
// Debounced Fetch Hook
// ============================================

export interface UseDebouncedFetchOptions<T> {
  /** Debounce delay in milliseconds */
  delay?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Initial data */
  initialData?: T | null;
}

export interface UseDebouncedFetchReturn<T> {
  /** Current data */
  data: T | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Fetch function (will be debounced) */
  fetch: (url: string, options?: RequestInit) => void;
  /** Cancel pending request */
  cancel: () => void;
}

/**
 * Hook for debounced fetch requests with cancellation
 */
export function useDebouncedFetch<T>({
  delay = 300,
  timeout = 30000,
  initialData = null,
}: UseDebouncedFetchOptions<T> = {}): UseDebouncedFetchReturn<T | null> {
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (err) {
        console.debug('[useDebouncedFetch] AbortController cleanup:', err);
      }
      abortControllerRef.current = null;
    }
  }, []);

  const fetchFn = useCallback((url: string, options?: RequestInit) => {
    cleanup();
    setError(null);
    
    debounceTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      abortControllerRef.current = new AbortController();
      
      // Set request timeout
      if (timeout > 0) {
        requestTimeoutRef.current = setTimeout(() => {
          abortControllerRef.current?.abort('Request timeout');
        }, timeout);
      }
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: abortControllerRef.current.signal,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        setData(result);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setIsLoading(false);
        if (requestTimeoutRef.current) {
          clearTimeout(requestTimeoutRef.current);
          requestTimeoutRef.current = null;
        }
      }
    }, delay);
  }, [cleanup, delay, timeout]);

  const cancel = useCallback(() => {
    cleanup();
    setIsLoading(false);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    data,
    isLoading,
    error,
    fetch: fetchFn,
    cancel,
  };
}

// ============================================
// Exports
// ============================================

export default useAbortController;

