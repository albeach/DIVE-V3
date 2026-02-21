/**
 * Presence Indicator Component
 * 
 * Displays which admin users are currently viewing a page in real-time.
 * Uses Broadcast Channel API for cross-tab synchronization.
 * 
 * Features:
 * - Real-time presence updates
 * - Avatar stacking (up to 3 visible)
 * - Tooltip with full names
 * - Animated transitions
 * - Dark mode compatible
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.5 - Real-Time Collaboration
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getPresenceManager, ActiveUser } from '@/lib/presence-manager';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';

export interface PresenceIndicatorProps {
  /** Page identifier (e.g., "dashboard", "users", "logs") */
  page: string;
  /** Custom className */
  className?: string;
  /** Maximum number of avatars to show before "+N" */
  maxAvatars?: number;
}

/**
 * Presence Indicator Component
 * 
 * Shows active users viewing the current page.
 * 
 * @example
 * ```tsx
 * <PresenceIndicator page="dashboard" />
 * ```
 */
export function PresenceIndicator({
  page,
  className = '',
  maxAvatars = 3,
}: PresenceIndicatorProps) {
  const { data: session } = useSession();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    const manager = getPresenceManager(
      session.user.id,
      session.user.name || session.user.email || 'Unknown'
    );

    // Join page
    manager.join(page);

    // Subscribe to updates
    const unsubscribe = manager.subscribe((users) => {
      const pageUsers = manager.getActiveUsers(page);
      setActiveUsers(pageUsers);
    });

    // Leave on unmount
    return () => {
      manager.leave();
      unsubscribe();
    };
  }, [session, page]);

  if (activeUsers.length === 0) return null;

  const visibleUsers = activeUsers.slice(0, maxAvatars);
  const remainingCount = Math.max(0, activeUsers.length - maxAvatars);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Presence Pills */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-full border border-gray-200 dark:border-gray-700 shadow-lg">
        {/* Eye Icon */}
        <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />

        {/* Avatar Stack */}
        <div className="flex -space-x-2">
          <AnimatePresence>
            {visibleUsers.map((user, index) => (
              <motion.div
                key={user.userId}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ delay: index * 0.05 }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-800 shadow-md"
                style={{
                  background: getUserColor(user.userId),
                }}
                title={user.userName}
              >
                {getInitials(user.userName)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Count */}
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {activeUsers.length} viewing
        </span>

        {/* +N indicator for remaining users */}
        {remainingCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            +{remainingCount}
          </span>
        )}
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && activeUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-full mt-2 right-0 z-50 min-w-[200px] max-w-xs"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Active Viewers
              </div>
              <div className="space-y-1">
                {activeUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: getUserColor(user.userId) }}
                    >
                      {getInitials(user.userName)}
                    </div>
                    <span>{user.userName}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Compact Presence Indicator
 * 
 * Minimal version with just count and icon.
 */
export function CompactPresenceIndicator({ page }: { page: string }) {
  const { data: session } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;

    const manager = getPresenceManager(
      session.user.id,
      session.user.name || session.user.email || 'Unknown'
    );

    manager.join(page);

    const unsubscribe = manager.subscribe((users) => {
      const pageUsers = manager.getActiveUsers(page);
      setCount(pageUsers.length);
    });

    return () => {
      manager.leave();
      unsubscribe();
    };
  }, [session, page]);

  if (count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium"
    >
      <Eye className="w-3 h-3" />
      <span>{count}</span>
    </motion.div>
  );
}

/**
 * Get consistent color for a user ID
 */
function getUserColor(userId: string): string {
  const colors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  ];

  // Hash user ID to get consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
