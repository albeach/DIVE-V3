/**
 * Bookmarks Panel Component - Phase 3
 * 
 * A slide-out panel showing all bookmarked documents and policies.
 * Features:
 * - Grouped by type (documents, policies)
 * - Quick navigation to bookmarked items
 * - Remove individual bookmarks
 * - Clear all bookmarks
 * - Empty state with guidance
 * 
 * Accessibility (WCAG 2.1 AA):
 * - role="dialog" with aria-modal="true"
 * - aria-labelledby for panel title
 * - Focus trap within panel
 * - Escape key closes panel
 * - Returns focus on close
 */

'use client';

import React, { Fragment, useRef, useEffect, useId } from 'react';
import Link from 'next/link';
import { useBookmarks } from '@/hooks/useBookmarks';
import type { Bookmark } from '@/lib/bookmarks';
import { 
  Bookmark as BookmarkIcon, 
  X, 
  FileText, 
  Shield, 
  Trash2,
  ExternalLink,
  Clock,
  Star,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface BookmarksPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Classification Colors
// ============================================

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-200',
  'RESTRICTED': 'bg-blue-100 text-blue-800 border-blue-200',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-200',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-200',
};

const classificationEmoji: Record<string, string> = {
  'UNCLASSIFIED': '🟢',
  'RESTRICTED': '🔵',
  'CONFIDENTIAL': '🟡',
  'SECRET': '🟠',
  'TOP_SECRET': '🔴',
};

// ============================================
// Helper Functions
// ============================================

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ============================================
// Bookmark Item Component
// ============================================

interface BookmarkItemProps {
  bookmark: Bookmark;
  onRemove: () => void;
  onNavigate: () => void;
}

function BookmarkItem({ bookmark, onRemove, onNavigate }: BookmarkItemProps) {
  const colorClass = bookmark.classification 
    ? classificationColors[bookmark.classification] || 'bg-gray-100 text-gray-800 border-gray-200'
    : 'bg-gray-100 text-gray-800 border-gray-200';
  
  const emoji = bookmark.classification 
    ? classificationEmoji[bookmark.classification] || '📄'
    : '📄';

  return (
    <article 
      className="group relative flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
      aria-label={`${bookmark.type === 'document' ? 'Document' : 'Policy'}: ${bookmark.title}`}
    >
      {/* Icon */}
      <div 
        className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
          bookmark.type === 'document' 
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
        }`}
        aria-hidden="true"
      >
        {bookmark.type === 'document' ? (
          <FileText className="w-5 h-5" />
        ) : (
          <Shield className="w-5 h-5" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Link 
          href={bookmark.type === 'document' ? `/resources/${bookmark.id}` : `/policies/${bookmark.id}`}
          onClick={onNavigate}
          className="block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {bookmark.title}
          </h4>
        </Link>
        
        <div className="flex items-center gap-2 mt-1">
          {bookmark.classification && (
            <span 
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
              role="status"
              aria-label={`Classification: ${bookmark.classification.replace('_', ' ')}`}
            >
              <span aria-hidden="true">{emoji}</span>
              <span>{bookmark.classification.replace('_', ' ')}</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="w-3 h-3" aria-hidden="true" />
            <span>Added {formatRelativeTime(bookmark.addedAt)}</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Link
          href={bookmark.type === 'document' ? `/resources/${bookmark.id}` : `/policies/${bookmark.id}`}
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`Open ${bookmark.title}`}
        >
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </Link>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label={`Remove bookmark for ${bookmark.title}`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

// ============================================
// Empty State Component
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4">
        <Star className="w-8 h-8 text-amber-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        No Bookmarks Yet
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
        Bookmark documents and policies for quick access. Click the bookmark icon on any resource to save it here.
      </p>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function BookmarksPanel({ isOpen, onClose }: BookmarksPanelProps) {
  const { 
    bookmarks, 
    documentBookmarks, 
    policyBookmarks, 
    count, 
    maxBookmarks,
    remove, 
    clearAll 
  } = useBookmarks();
  
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Store previously focused element and restore on close
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
      // Focus close button when panel opens
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    } else {
      // Restore focus when closing
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    }
  }, [isOpen]);

  // Keyboard handling: Escape to close, focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      
      // Focus trap within panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20" aria-hidden="true">
              <BookmarkIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Bookmarks
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {count} of {maxBookmarks} saved
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {count > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all bookmarks? This cannot be undone.')) {
                    clearAll();
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Clear All
              </button>
            )}
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Close bookmarks panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {count === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {/* Documents Section */}
              {documentBookmarks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Documents
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">
                      {documentBookmarks.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {documentBookmarks.map((bookmark) => (
                      <BookmarkItem
                        key={`${bookmark.type}-${bookmark.id}`}
                        bookmark={bookmark}
                        onRemove={() => remove(bookmark.id, bookmark.type)}
                        onNavigate={onClose}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Policies Section */}
              {policyBookmarks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Policies
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold">
                      {policyBookmarks.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {policyBookmarks.map((bookmark) => (
                      <BookmarkItem
                        key={`${bookmark.type}-${bookmark.id}`}
                        bookmark={bookmark}
                        onRemove={() => remove(bookmark.id, bookmark.type)}
                        onNavigate={onClose}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            💡 Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs">B</kbd> to toggle bookmarks
          </p>
        </div>
      </div>
    </>
  );
}

// ============================================
// Bookmark Button Component (for resource cards)
// ============================================

interface BookmarkButtonProps {
  resourceId: string;
  title: string;
  classification?: string;
  type: 'document' | 'policy';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function BookmarkButton({ 
  resourceId, 
  title, 
  classification, 
  type,
  size = 'md',
  showLabel = false,
}: BookmarkButtonProps) {
  const { isItemBookmarked, toggle, canAdd } = useBookmarks();
  const [isBookmarked, setIsBookmarked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync state on mount
  React.useEffect(() => {
    setIsBookmarked(isItemBookmarked(resourceId, type));
  }, [resourceId, type, isItemBookmarked]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setError(null);
    
    const result = toggle({
      id: resourceId,
      type,
      title,
      classification,
    });
    
    setIsBookmarked(result.isBookmarked);
    
    if (result.error) {
      setError(result.error);
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  const sizeClasses = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        disabled={!canAdd && !isBookmarked}
        className={`
          ${sizeClasses[size]}
          rounded-lg transition-all duration-200
          ${isBookmarked 
            ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50' 
            : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
          ${!canAdd && !isBookmarked ? 'opacity-50 cursor-not-allowed' : ''}
          ${showLabel ? 'flex items-center gap-1.5' : ''}
        `}
        title={isBookmarked ? 'Remove bookmark' : canAdd ? 'Add bookmark' : 'Maximum bookmarks reached'}
      >
        <BookmarkIcon 
          className={`${iconSizes[size]} ${isBookmarked ? 'fill-current' : ''}`} 
        />
        {showLabel && (
          <span className="text-xs font-medium">
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </span>
        )}
      </button>
      
      {error && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-red-600 text-white text-xs rounded whitespace-nowrap z-50">
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================
// Bookmarks Trigger Button (for header/nav)
// ============================================

interface BookmarksTriggerProps {
  onClick: () => void;
}

export function BookmarksTrigger({ onClick }: BookmarksTriggerProps) {
  const { count } = useBookmarks();

  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title="Open bookmarks"
    >
      <BookmarkIcon className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
