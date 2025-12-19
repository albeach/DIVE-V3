'use client';

/**
 * Notifications Content
 * Shows user notifications and alerts
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useInstanceTheme } from '@/components/ui/theme-provider';
import { 
  Bell, 
  BellOff,
  Check,
  CheckCheck,
  ShieldCheck,
  ShieldX,
  FileText,
  Upload,
  AlertCircle,
  Info,
  ChevronRight,
  Trash2,
  Settings,
  Filter
} from 'lucide-react';

interface NotificationUser {
  uniqueID?: string | null;
}

interface NotificationsContentProps {
  user: NotificationUser;
}

type NotificationType = 'access_granted' | 'access_denied' | 'document_shared' | 'upload_complete' | 'system' | 'security';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string | Date;
  read: boolean;
  resourceId?: string;
  actionUrl?: string;
}

export function NotificationsContent({ user }: NotificationsContentProps) {
  const { theme } = useInstanceTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [prefs, setPrefs] = useState<{ emailOptIn: boolean } | null>(null);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/notifications?limit=50', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items: Notification[] = Array.isArray(data?.notifications)
          ? data.notifications.map((n: any) => ({
              ...n,
              timestamp: n.timestamp || new Date().toISOString(), // Fallback to current time if invalid
            }))
          : [];
        setNotifications(items);
        setNextCursor(data?.nextCursor || null);
        setReachedEnd(!data?.nextCursor);
        // load preferences in parallel
        try {
          const prefRes = await fetch('/api/notifications/preferences/me', { cache: 'no-store' });
          if (prefRes.ok) {
            const prefData = await prefRes.json();
            if (prefData?.data) {
              setPrefs({ emailOptIn: !!prefData.data.emailOptIn });
            }
          }
        } catch {
          // ignore pref errors silently
        }
      } catch (err) {
        // Fallback: keep UX usable with empty state and message
        setNotifications([]);
        setError('Unable to load notifications right now.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/notifications?limit=50&cursor=${encodeURIComponent(nextCursor)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: Notification[] = Array.isArray(data?.notifications)
        ? data.notifications.map((n: any) => ({
            ...n,
            timestamp: n.timestamp || new Date().toISOString(), // Fallback to current time if invalid
          }))
        : [];
      setNotifications(prev => [...prev, ...items]);
      setNextCursor(data?.nextCursor || null);
      setReachedEnd(!data?.nextCursor);
    } catch (err) {
      setError('Unable to load more notifications right now.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.read);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    }
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      // no-op; optimistic UI
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    }
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      // no-op
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    }
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } catch {
      // no-op
    }
  };

  const getNotificationConfig = (type: NotificationType) => {
    switch (type) {
      case 'access_granted':
        return { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' };
      case 'access_denied':
        return { icon: ShieldX, color: 'text-red-500', bg: 'bg-red-50' };
      case 'document_shared':
        return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' };
      case 'upload_complete':
        return { icon: Upload, color: 'text-purple-500', bg: 'bg-purple-50' };
      case 'security':
        return { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50' };
      case 'system':
        return { icon: Info, color: 'text-gray-500', bg: 'bg-gray-50' };
      default:
        return { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-50' };
    }
  };

  const formatTime = (timestamp: string | Date | null | undefined) => {
    if (!timestamp) return 'Unknown time';

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 0) return 'In the future';

    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const toggleEmailOptIn = async () => {
    if (prefs?.emailOptIn === undefined) return;
    setIsSavingPrefs(true);
    try {
      const res = await fetch('/api/notifications/preferences/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOptIn: !prefs.emailOptIn })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.data) {
          setPrefs({ emailOptIn: !!data.data.emailOptIn });
        }
      }
    } catch {
      // swallow errors
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const categories = useMemo(() => {
    const asDate = (ts: string | Date) => {
      if (!ts) return new Date(0); // Return epoch date for invalid timestamps
      const date = ts instanceof Date ? ts : new Date(ts);
      return isNaN(date.getTime()) ? new Date(0) : date;
    };

    const now = new Date().getTime();

    return {
      today: filteredNotifications.filter(n => {
        const date = asDate(n.timestamp);
        const diff = now - date.getTime();
        return diff >= 0 && diff < 24 * 3600 * 1000;
      }),
      week: filteredNotifications.filter(n => {
        const date = asDate(n.timestamp);
        const diff = now - date.getTime();
        return diff >= 24 * 3600 * 1000 && diff < 7 * 24 * 3600 * 1000;
      }),
      older: filteredNotifications.filter(n => {
        const date = asDate(n.timestamp);
        const diff = now - date.getTime();
        return diff >= 7 * 24 * 3600 * 1000;
      })
    };
  }, [filteredNotifications]);

  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner"
            style={{ background: 'var(--instance-banner-bg)' }}
          >
            <Bell className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            aria-label="Notification preferences"
          >
            <Settings className="w-4 h-4" />
            Preferences
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            aria-label="Notification filters"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors"
              style={{ background: 'var(--instance-banner-bg)' }}
              aria-label="Mark all notifications as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
          {error} We’ll keep trying—refresh to retry.
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all border ${
            filter === 'all' 
              ? 'text-white border-transparent shadow-sm'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
          style={filter === 'all' ? { background: 'var(--instance-banner-bg)' } : undefined}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all border ${
            filter === 'unread' 
              ? 'text-white border-transparent shadow-sm'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
          style={filter === 'unread' ? { background: 'var(--instance-banner-bg)' } : undefined}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Preferences stub */}
      <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-gray-900">Notification Preferences</div>
          <div className="text-xs text-gray-500">Email delivery opt-in (future use)</div>
        </div>
        <button
          onClick={toggleEmailOptIn}
          disabled={prefs === null || isSavingPrefs}
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
            prefs?.emailOptIn
              ? 'border-green-500 text-green-700 bg-green-50'
              : 'border-gray-300 text-gray-700 bg-white hover:border-gray-400'
          } disabled:opacity-60`}
          aria-pressed={prefs?.emailOptIn || false}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: prefs?.emailOptIn ? '#22c55e' : '#9ca3af' }} />
          {prefs?.emailOptIn ? 'Email opt-in enabled' : 'Email opt-in disabled'}
          {isSavingPrefs && <span className="text-gray-400">…</span>}
        </button>
      </div>

      {/* Sections by time */}
      {['today', 'week', 'older'].map((bucket) => {
        const list = (categories as any)[bucket] as Notification[];
        if (!list || list.length === 0) {
          return null;
        }

        const labelMap: Record<string, string> = {
          today: 'Today',
          week: 'Last 7 Days',
          older: 'Older'
        };

        return (
          <div key={bucket} className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--instance-banner-bg)' }} />
              {labelMap[bucket]}
            </div>

            <div className="grid gap-2">
              {list.map((notification) => {
                const config = getNotificationConfig(notification.type);
                const Icon = config.icon;

                return (
                  <div
                    key={notification.id}
                    className={`group relative bg-white/80 backdrop-blur border rounded-2xl p-4 transition-all hover:shadow-md ${
                      notification.read 
                        ? 'border-gray-100 hover:border-gray-200' 
                        : 'border-l-4 border-gray-200 hover:border-gray-300'
                    }`}
                    style={!notification.read ? { borderLeftColor: 'var(--instance-primary)' } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${config.color}`} strokeWidth={2} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className={`text-sm font-semibold ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                              {notification.title}
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                            {formatTime(notification.timestamp)}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 mt-3">
                          {notification.actionUrl && (
                            <Link
                              href={notification.actionUrl}
                              className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                              style={{ color: 'var(--instance-primary)' }}
                            >
                              View
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          )}
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                            >
                              <Check className="w-3 h-3" />
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                        title="Delete notification"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filteredNotifications.length === 0 && <EmptyNotifications />}

      {nextCursor && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 hover:border-gray-400 bg-white disabled:opacity-60"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      {!nextCursor && filteredNotifications.length > 0 && (
        <div className="text-center text-xs text-gray-400">End of notifications</div>
      )}
    </div>
  );
}

function EmptyNotifications() {
  return (
    <div className="text-center py-12">
      <div 
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'linear-gradient(to br, rgba(var(--instance-primary-rgb), 0.1), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.1))' }}
      >
        <BellOff className="w-8 h-8" style={{ color: 'var(--instance-primary)' }} />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">No notifications</h3>
      <p className="text-sm text-gray-500">
        You're all caught up! Check back later for updates.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
        >
          Browse documents
        </Link>
        <Link
          href="/upload"
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-800 hover:border-gray-400 transition-colors"
        >
          Upload
        </Link>
      </div>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div>
          <div className="h-6 w-40 bg-gray-200 rounded mb-1" />
          <div className="h-4 w-24 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-8 w-16 bg-gray-100 rounded-lg" />
        <div className="h-8 w-20 bg-gray-100 rounded-lg" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-full bg-gray-100 rounded mb-1" />
                <div className="h-3 w-2/3 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
