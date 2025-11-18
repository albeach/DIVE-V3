/**
 * Bookmark Button Component - Phase 3
 * 
 * Toggle bookmark for resources and policies
 * Shows star icon (empty/filled)
 * Max 20 bookmarks per user
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { addBookmark, removeBookmark, isBookmarked, canAddBookmark } from '@/lib/bookmarks';

interface BookmarkButtonProps {
  id: string;
  type: 'document' | 'policy';
  title: string;
  classification?: string;
  className?: string;
  variant?: 'icon' | 'button';
}

export function BookmarkButton({
  id,
  type,
  title,
  classification,
  className = '',
  variant = 'icon',
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check bookmark status on mount
  useEffect(() => {
    setBookmarked(isBookmarked(id, type));
  }, [id, type]);

  const handleToggle = () => {
    try {
      if (bookmarked) {
        // Remove bookmark
        removeBookmark(id, type);
        setBookmarked(false);
        setError(null);
      } else {
        // Check if can add
        if (!canAddBookmark()) {
          setError('Maximum 20 bookmarks reached');
          setTimeout(() => setError(null), 3000);
          return;
        }

        // Add bookmark
        addBookmark({ id, type, title, classification });
        setBookmarked(true);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle bookmark');
      setTimeout(() => setError(null), 3000);
    }
  };

  if (variant === 'button') {
    return (
      <div className="relative">
        <button
          onClick={handleToggle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 
                     ${bookmarked 
                       ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400' 
                       : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                     } ${className}`}
          aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
          aria-pressed={bookmarked}
        >
          <Star
            className={`h-4 w-4 transition-all duration-200 ${
              bookmarked ? 'fill-yellow-500 text-yellow-500' : 'text-gray-500'
            }`}
          />
          <span className="text-sm font-medium">
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </span>
        </button>

        {/* Error tooltip */}
        {error && (
          <div className="absolute top-full mt-2 left-0 px-3 py-2 bg-red-100 text-red-800 text-xs 
                         font-medium rounded-lg shadow-lg z-50 whitespace-nowrap animate-in fade-in">
            {error}
          </div>
        )}

        {/* Hover tooltip */}
        {isHovered && !error && (
          <div className="absolute top-full mt-2 left-0 px-3 py-2 bg-gray-900 text-white text-xs 
                         font-medium rounded-lg shadow-lg z-50 whitespace-nowrap animate-in fade-in">
            {bookmarked ? 'Remove from bookmarks' : 'Add to bookmarks'}
          </div>
        )}
      </div>
    );
  }

  // Icon variant (default)
  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`p-2 rounded-lg transition-all duration-200 
                   ${bookmarked 
                     ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400' 
                     : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                   } ${className}`}
        aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
        aria-pressed={bookmarked}
      >
        <Star
          className={`h-5 w-5 transition-all duration-200 ${
            bookmarked ? 'fill-yellow-500 scale-110' : ''
          }`}
        />
      </button>

      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full mt-2 right-0 px-3 py-2 bg-red-100 text-red-800 text-xs 
                       font-medium rounded-lg shadow-lg z-50 whitespace-nowrap animate-in fade-in">
          {error}
        </div>
      )}

      {/* Hover tooltip */}
      {isHovered && !error && (
        <div className="absolute top-full mt-2 right-0 px-3 py-2 bg-gray-900 text-white text-xs 
                       font-medium rounded-lg shadow-lg z-50 whitespace-nowrap animate-in fade-in">
          {bookmarked ? 'Remove bookmark' : 'Add bookmark'}
        </div>
      )}
    </div>
  );
}


