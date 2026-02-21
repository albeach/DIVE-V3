/**
 * Notification Bell Component
 *
 * Shows notification count badge in navigation header.
 * Opens notification drawer when clicked.
 *
 * 2026 Design: Glassmorphism, micro-interactions, and instance theming.
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bell, BellRing, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useInstanceTheme } from '@/components/ui/theme-provider';

interface NotificationBellProps {
  /** Initial unread count (optional, will use live data if hook is available) */
  initialCount?: number;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'access_granted' | 'access_denied' | 'document_shared' | 'upload_complete' | 'system' | 'security';
  title: string;
  message: string;
  read: boolean;
  timestamp?: string | Date;
  createdAt?: string;
  actionUrl?: string;
}

export function NotificationBell({ initialCount = 0 }: NotificationBellProps) {
  const { theme } = useInstanceTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch notification count
  useEffect(() => {
    if (!isAuthorized) return;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications-count', { credentials: 'include' });
        if (res.status === 401) {
          // Stop polling when the user is not authenticated (or lacks tokens).
          setIsAuthorized(false);
          setUnreadCount(0);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const newCount = data.count || 0;
          if (newCount > unreadCount && unreadCount > 0) {
            setHasNewNotification(true);
            setTimeout(() => setHasNewNotification(false), 2000);
          }
          setUnreadCount(newCount);
        }
      } catch {
        // Fail silently
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, [unreadCount, isAuthorized]);

  // Listen for notification updates
  useEffect(() => {
    const handleUpdate = () => {
      if (!isAuthorized) return;
      fetch('/api/notifications-count', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setUnreadCount(data.count || 0);
        })
        .catch(() => {});
    };

    window.addEventListener('notifications-updated', handleUpdate);
    return () => window.removeEventListener('notifications-updated', handleUpdate);
  }, []);

  // Fetch notifications when opening
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // Fail silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle open/close
  const togglePanel = useCallback(() => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  }, [isOpen, fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Mark as read
  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch {
      // Revert on error
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch {
      // Revert on error
    }
  }, []);

  // Format time
  const formatTime = (timestamp: string | Date | null | undefined) => {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  // Get notification icon color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
      case 'access_granted':
        return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30';
      case 'error':
      case 'access_denied':
        return 'text-red-500 bg-red-50 dark:bg-red-900/30';
      case 'warning':
      case 'security':
        return 'text-amber-500 bg-amber-50 dark:bg-amber-900/30';
      default:
        return 'text-blue-500 bg-blue-50 dark:bg-blue-900/30';
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className={`relative p-2 rounded-xl transition-all duration-300 group
                   ${isOpen
                     ? 'bg-gray-100 dark:bg-gray-800'
                     : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                   }
                   focus:outline-none focus:ring-2 focus:ring-offset-2`}
        style={{ '--tw-ring-color': 'rgba(var(--instance-primary-rgb, 68, 151, 172), 0.4)' } as React.CSSProperties}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {/* Bell icon with animation */}
        <div className={`transition-transform duration-300 ${hasNewNotification ? 'animate-wiggle' : ''}`}>
          {unreadCount > 0 ? (
            <BellRing
              className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors"
              strokeWidth={2}
            />
          ) : (
            <Bell
              className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors"
              strokeWidth={2}
            />
          )}
        </div>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className={[
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center',
              'text-[10px] font-bold text-white rounded-full shadow-lg',
              'animate-scale-in',
            ].join(' ')}
            style={{
              background: 'var(--instance-primary, #ef4444)',
              boxShadow: '0 2px 4px rgba(var(--instance-primary-rgb, 239, 68, 68), 0.4)'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Pulse animation for new notifications */}
        {hasNewNotification && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full animate-ping opacity-75"
            style={{ background: 'var(--instance-primary, #ef4444)' }}
          />
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className={`absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-32px)]
                       bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700
                       z-50 overflow-hidden animate-fade-in-up`}
            style={{
              boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)'
            }}
            role="dialog"
            aria-label="Notifications"
          >
            {/* Header */}
            <div
              className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between"
              style={{
                background: 'linear-gradient(to right, rgba(var(--instance-primary-rgb), 0.05), transparent)'
              }}
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: 'var(--instance-primary)' }} />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                {unreadCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-bold rounded-full text-white"
                    style={{ background: 'var(--instance-primary)' }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-200
                               hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors`}
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-200
                             hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors`}
                  aria-label="Close notifications"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Loading...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(var(--instance-primary-rgb), 0.1)' }}
                  >
                    <Bell className="w-6 h-6" style={{ color: 'var(--instance-primary)' }} />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">All caught up!</p>
                  <p className="text-xs text-gray-500 mt-1">No new notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors
                                 ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                    >
                      <div className="flex gap-3">
                        {/* Type indicator */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getTypeColor(notification.type)}`}>
                          <Bell className="w-4 h-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium ${notification.read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>
                              {notification.title}
                            </p>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                              {formatTime(notification.timestamp || notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>

                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-2">
                            {notification.actionUrl && (
                              <Link
                                href={notification.actionUrl}
                                className="text-[11px] font-medium hover:underline"
                                style={{ color: 'var(--instance-primary)' }}
                                onClick={() => setIsOpen(false)}
                              >
                                View details →
                              </Link>
                            )}
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-0.5"
                              >
                                <Check className="w-3 h-3" />
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Unread indicator */}
                        {!notification.read && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
                            style={{ background: 'var(--instance-primary)' }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <Link
                href="/notifications"
                className="block text-center text-sm font-medium hover:underline transition-colors"
                style={{ color: 'var(--instance-primary)' }}
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Custom animations */}
      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-15deg); }
          30% { transform: rotate(12deg); }
          45% { transform: rotate(-10deg); }
          60% { transform: rotate(8deg); }
          75% { transform: rotate(-5deg); }
        }
        .animate-wiggle {
          animation: wiggle 0.6s ease-in-out;
        }
        @keyframes scale-in {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default NotificationBell;
