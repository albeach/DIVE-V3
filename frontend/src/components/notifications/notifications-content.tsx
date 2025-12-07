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
  Shield,
  ShieldCheck,
  ShieldX,
  FileText,
  Upload,
  AlertCircle,
  Info,
  Clock,
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
  timestamp: Date;
  read: boolean;
  resourceId?: string;
  actionUrl?: string;
}

// Mock notifications
function generateMockNotifications(): Notification[] {
  const now = new Date();
  return [
    {
      id: '1',
      type: 'access_granted',
      title: 'Access Granted',
      message: 'Your request to access "NATO Exercise Plan Alpha" has been approved.',
      timestamp: new Date(now.getTime() - 1800000), // 30 mins ago
      read: false,
      resourceId: 'doc-123',
      actionUrl: '/resources/doc-123'
    },
    {
      id: '2',
      type: 'document_shared',
      title: 'Document Shared With You',
      message: 'Cmdr. J. Smith shared "Coalition Comms Protocol" with you.',
      timestamp: new Date(now.getTime() - 7200000), // 2 hours ago
      read: false,
      resourceId: 'doc-456',
      actionUrl: '/resources/doc-456'
    },
    {
      id: '3',
      type: 'security',
      title: 'Security Alert',
      message: 'Unusual access pattern detected. Please verify your recent activity.',
      timestamp: new Date(now.getTime() - 14400000), // 4 hours ago
      read: true,
      actionUrl: '/activity'
    },
    {
      id: '4',
      type: 'upload_complete',
      title: 'Upload Complete',
      message: 'Your document "Field Operations Report" has been successfully uploaded and encrypted.',
      timestamp: new Date(now.getTime() - 86400000), // 1 day ago
      read: true,
      resourceId: 'doc-789'
    },
    {
      id: '5',
      type: 'access_denied',
      title: 'Access Request Denied',
      message: 'Your request to access "TOP SECRET briefing" was denied due to clearance level.',
      timestamp: new Date(now.getTime() - 172800000), // 2 days ago
      read: true
    },
    {
      id: '6',
      type: 'system',
      title: 'System Maintenance',
      message: 'Scheduled maintenance will occur on Dec 5th, 2025 from 02:00-04:00 UTC.',
      timestamp: new Date(now.getTime() - 259200000), // 3 days ago
      read: true
    }
  ];
}

export function NotificationsContent({ user }: NotificationsContentProps) {
  const { theme } = useInstanceTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setNotifications(generateMockNotifications());
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.read);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
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

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
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

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            filter === 'all' 
              ? 'text-white' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={filter === 'all' ? { background: 'var(--instance-banner-bg)' } : undefined}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            filter === 'unread' 
              ? 'text-white' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={filter === 'unread' ? { background: 'var(--instance-banner-bg)' } : undefined}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <EmptyNotifications />
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification, index) => {
            const config = getNotificationConfig(notification.type);
            const Icon = config.icon;

            return (
              <div
                key={notification.id}
                className={`group relative bg-white border rounded-xl p-4 transition-all animate-fade-in ${
                  notification.read 
                    ? 'border-gray-100 hover:border-gray-200' 
                    : 'border-l-4 border-gray-200 hover:border-gray-300'
                }`}
                style={!notification.read ? { borderLeftColor: 'var(--instance-primary)' } : undefined}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color}`} strokeWidth={2} />
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
                      <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatTime(notification.timestamp)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
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






