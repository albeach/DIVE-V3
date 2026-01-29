/**
 * Policy Updates Hook (SSE)
 *
 * React hook for real-time policy update notifications via Server-Sent Events.
 * Best practice approach for event-driven UI updates.
 *
 * Phase 5, Task 5.5 - Real-Time UI Updates
 * Date: 2026-01-29
 */

'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================
// Types
// ============================================

export interface IPolicyUpdateEvent {
  type: 'policy_bundle' | 'policy_data' | 'federation_constraints' | 'trusted_issuers' | 'tenant_configs' | 'connected';
  timestamp: string;
  source?: string;
  details?: Record<string, any>;
}

export interface IPolicyUpdateStatus {
  connected: boolean;
  lastUpdate: Date | null;
  updateCount: number;
  error: string | null;
}

// ============================================
// Hook
// ============================================

/**
 * Hook to listen for real-time policy updates via Server-Sent Events
 *
 * @param onUpdate - Callback when policy update received
 * @returns Connection status and control functions
 */
export function usePolicyUpdates(
  onUpdate?: (event: IPolicyUpdateEvent) => void
): IPolicyUpdateStatus & { reconnect: () => void } {
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const connect = useCallback(() => {
    // Get backend URL from environment
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
    const sseUrl = `${backendUrl}/api/policies/stream`;

    try {
      const es = new EventSource(sseUrl);

      es.onopen = () => {
        console.log('[SSE] Connected to policy updates stream');
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const data: IPolicyUpdateEvent = JSON.parse(event.data);

          console.log('[SSE] Policy update received:', data.type);

          // Update state
          setLastUpdate(new Date(data.timestamp));
          setUpdateCount((prev) => prev + 1);

          // Call user callback
          if (onUpdate && data.type !== 'connected') {
            onUpdate(data);
          }
        } catch (err) {
          console.error('[SSE] Failed to parse event data:', err);
        }
      };

      es.onerror = (err) => {
        console.error('[SSE] Connection error:', err);
        setConnected(false);
        setError('Connection lost. Attempting to reconnect...');

        // EventSource automatically reconnects, but we track the error state
      };

      setEventSource(es);

      return es;
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      setError('Failed to connect to policy updates stream');
      return null;
    }
  }, [onUpdate]);

  const reconnect = useCallback(() => {
    if (eventSource) {
      eventSource.close();
    }
    setConnected(false);
    setError(null);
    const newEs = connect();
    setEventSource(newEs);
  }, [eventSource, connect]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    const es = connect();

    return () => {
      if (es) {
        console.log('[SSE] Closing connection');
        es.close();
      }
    };
  }, [connect]);

  return {
    connected,
    lastUpdate,
    updateCount,
    error,
    reconnect,
  };
}
