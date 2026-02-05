/**
 * File Type Badge Component (2026 Design)
 *
 * A reusable badge component that displays file type information with:
 * - Icon representation from Lucide React
 * - File extension label (PDF, DOCX, JPG, etc.)
 * - Color-coded by category (blue=docs, green=images, purple=videos, orange=audio)
 * - Smooth micro-interactions using Framer Motion
 * - Responsive sizing (sm, md, lg)
 * - Optional animations (entrance, hover)
 */

'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  detectFileCategory,
  extractFileExtension,
  getFileTypeIcon,
  getFileTypeColors,
  getFileCategoryLabel,
  type FileCategory,
} from '@/utils/file-type-utils';

// ============================================
// Types
// ============================================

export interface FileTypeBadgeProps {
  /** MIME type from backend (e.g., "application/pdf", "image/png") */
  contentType?: string;
  /** Pre-calculated file extension (e.g., "PDF", "DOCX") - optional, will be derived if not provided */
  fileExtension?: string;
  /** Badge size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show extension label text (if false, icon only) */
  showLabel?: boolean;
  /** Enable Framer Motion animations (entrance and hover effects) */
  animated?: boolean;
  /** Custom className to merge with badge styles */
  className?: string;
  /** Accessibility label override */
  ariaLabel?: string;
}

// ============================================
// Component
// ============================================

export function FileTypeBadge({
  contentType,
  fileExtension,
  size = 'md',
  showLabel = true,
  animated = true,
  className = '',
  ariaLabel,
}: FileTypeBadgeProps) {
  // Memoize expensive computations
  const category: FileCategory = useMemo(
    () => detectFileCategory(contentType),
    [contentType]
  );

  const extension = useMemo(
    () => fileExtension || extractFileExtension(contentType),
    [fileExtension, contentType]
  );

  const Icon = useMemo(() => getFileTypeIcon(category), [category]);

  const colors = useMemo(() => getFileTypeColors(category), [category]);

  const categoryLabel = useMemo(() => getFileCategoryLabel(category), [category]);

  // Size-based styling
  const sizeClasses = {
    sm: {
      container: 'px-2 py-1 text-xs gap-1',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'px-2.5 py-1.5 text-xs gap-1.5',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'px-3 py-2 text-sm gap-2',
      icon: 'w-5 h-5',
    },
  };

  const currentSize = sizeClasses[size];

  // Accessibility
  const effectiveAriaLabel = ariaLabel || `${extension} ${categoryLabel}`;

  // Badge content (without animation wrapper)
  const badgeContent = (
    <div
      className={`inline-flex items-center rounded-lg border font-semibold transition-all duration-200 ${colors.bg} ${colors.text} ${colors.border} ${colors.hover} ${currentSize.container} ${className}`}
      role="img"
      aria-label={effectiveAriaLabel}
      title={effectiveAriaLabel}
    >
      <Icon className={`${currentSize.icon} ${colors.icon} flex-shrink-0`} />
      {showLabel && (
        <span className="uppercase font-bold tracking-wide">{extension}</span>
      )}
    </div>
  );

  // Return with or without animation
  if (!animated) {
    return badgeContent;
  }

  // Animated version with Framer Motion
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        delay: 0.05,
      }}
      whileHover={{
        scale: 1.08,
        rotate: [0, -1, 1, -1, 0],
        transition: { duration: 0.3, ease: 'easeInOut' },
      }}
      whileTap={{ scale: 0.95 }}
      className="inline-flex"
    >
      {badgeContent}
    </motion.div>
  );
}

// ============================================
// Badge Group Component (for multiple badges)
// ============================================

interface FileTypeBadgeGroupProps {
  badges: Array<{
    contentType?: string;
    fileExtension?: string;
    id?: string;
  }>;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  animated?: boolean;
  maxVisible?: number; // Show only first N badges, then "+X more"
  className?: string;
}

export function FileTypeBadgeGroup({
  badges,
  size = 'md',
  showLabels = true,
  animated = true,
  maxVisible = 3,
  className = '',
}: FileTypeBadgeGroupProps) {
  const visibleBadges = badges.slice(0, maxVisible);
  const hiddenCount = badges.length - maxVisible;

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {visibleBadges.map((badge, index) => (
        <FileTypeBadge
          key={badge.id || `badge-${index}`}
          contentType={badge.contentType}
          fileExtension={badge.fileExtension}
          size={size}
          showLabel={showLabels}
          animated={animated}
        />
      ))}
      {hiddenCount > 0 && (
        <span className="text-xs text-gray-500 font-semibold">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

// ============================================
// Compact Badge (Icon Only, No Border)
// ============================================

interface CompactFileTypeBadgeProps {
  contentType?: string;
  size?: number; // Icon size in pixels
  className?: string;
}

export function CompactFileTypeBadge({
  contentType,
  size = 16,
  className = '',
}: CompactFileTypeBadgeProps) {
  const category = useMemo(() => detectFileCategory(contentType), [contentType]);
  const Icon = useMemo(() => getFileTypeIcon(category), [category]);
  const colors = useMemo(() => getFileTypeColors(category), [category]);
  const extension = useMemo(() => extractFileExtension(contentType), [contentType]);

  return (
    <Icon
      className={`flex-shrink-0 ${colors.icon} ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${extension} file`}
    />
  );
}

// ============================================
// Export default
// ============================================

export default FileTypeBadge;
