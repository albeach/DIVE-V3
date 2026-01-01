/**
 * Custom hook for dashboard real-time updates
 *
 * Provides:
 * - Auto-refresh functionality
 * - Notification handling
 * - Last update tracking
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DashboardNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface UseDashboardUpdatesOptions {
  refreshInterval?: number; // ms
  enabled?: boolean;
  onRefresh?: () => Promise<void>;
}

interface UseDashboardUpdatesReturn {
  lastRefresh: Date;
  isRefreshing: boolean;
  notifications: DashboardNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  addNotification: (notification: Omit<DashboardNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  toggleAutoRefresh: () => void;
  autoRefreshEnabled: boolean;
}

export function useDashboardUpdates({
  refreshInterval = 30000,
  enabled = true,
  onRefresh,
}: UseDashboardUpdatesOptions = {}): UseDashboardUpdatesReturn {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(enabled);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Dashboard refresh failed:', error);
      addNotification({
        type: 'error',
        title: 'Refresh Failed',
        message: 'Could not update dashboard data. Will retry automatically.',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, onRefresh]);

  const addNotification = useCallback((
    notification: Omit<DashboardNotification, 'id' | 'timestamp' | 'read'>
  ) => {
    const newNotification: DashboardNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => !prev);
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshEnabled && refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefreshEnabled, refreshInterval, refresh]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    lastRefresh,
    isRefreshing,
    notifications,
    unreadCount,
    refresh,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    toggleAutoRefresh,
    autoRefreshEnabled,
  };
}

export default useDashboardUpdates;
