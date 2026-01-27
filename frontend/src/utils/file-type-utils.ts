/**
 * File Type Utilities
 * Helper functions for file type detection, categorization, and styling
 */

import {
  FileText,
  Image,
  Film,
  Music,
  Archive,
  FileCode,
  File,
  type LucideIcon,
} from 'lucide-react';

// ============================================
// Types
// ============================================

export type FileCategory = 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'other';

export interface ColorScheme {
  bg: string;
  text: string;
  border: string;
  icon: string;
  gradient: string;
  hover: string;
}

// ============================================
// File Type Color Schemes (2026 Design System)
// ============================================

export const FILE_TYPE_COLORS: Record<FileCategory, ColorScheme> = {
  document: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: 'text-blue-600',
    gradient: 'from-blue-500 to-blue-600',
    hover: 'hover:bg-blue-100',
  },
  image: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: 'text-green-600',
    gradient: 'from-green-500 to-green-600',
    hover: 'hover:bg-green-100',
  },
  video: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: 'text-purple-600',
    gradient: 'from-purple-500 to-purple-600',
    hover: 'hover:bg-purple-100',
  },
  audio: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: 'text-orange-600',
    gradient: 'from-orange-500 to-orange-600',
    hover: 'hover:bg-orange-100',
  },
  archive: {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    icon: 'text-gray-600',
    gradient: 'from-gray-500 to-gray-600',
    hover: 'hover:bg-gray-100',
  },
  code: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    icon: 'text-teal-600',
    gradient: 'from-teal-500 to-teal-600',
    hover: 'hover:bg-teal-100',
  },
  other: {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    icon: 'text-slate-600',
    gradient: 'from-slate-500 to-slate-600',
    hover: 'hover:bg-slate-100',
  },
};

// ============================================
// File Type Detection
// ============================================

/**
 * Detect file category from MIME type
 */
export function detectFileCategory(contentType?: string): FileCategory {
  if (!contentType) return 'other';

  const type = contentType.toLowerCase();

  // Images
  if (type.startsWith('image/')) return 'image';

  // Videos
  if (type.startsWith('video/')) return 'video';

  // Audio
  if (type.startsWith('audio/')) return 'audio';

  // Documents
  if (
    type.includes('pdf') ||
    type.includes('word') ||
    type.includes('document') ||
    type.includes('msword') ||
    type.includes('wordprocessingml') ||
    type.includes('spreadsheet') ||
    type.includes('excel') ||
    type.includes('presentation') ||
    type.includes('powerpoint') ||
    type === 'text/plain' ||
    type === 'text/markdown' ||
    type === 'text/rtf'
  ) {
    return 'document';
  }

  // Archives
  if (
    type.includes('zip') ||
    type.includes('tar') ||
    type.includes('gzip') ||
    type.includes('compress') ||
    type.includes('archive') ||
    type.includes('rar') ||
    type.includes('7z')
  ) {
    return 'archive';
  }

  // Code files
  if (
    type.includes('javascript') ||
    type.includes('json') ||
    type.includes('html') ||
    type.includes('xml') ||
    type.includes('css') ||
    type === 'text/css' ||
    type === 'application/xml' ||
    type === 'application/xhtml+xml'
  ) {
    return 'code';
  }

  return 'other';
}

// ============================================
// File Extension Extraction
// ============================================

/**
 * MIME type to file extension mapping
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  // Documents
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/rtf': 'rtf',

  // Images
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',

  // Videos
  'video/mp4': 'mp4',
  'video/avi': 'avi',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',

  // Audio
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/aac': 'aac',
  'audio/flac': 'flac',

  // Archives
  'application/zip': 'zip',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'application/x-bzip2': 'bz2',
  'application/x-7z-compressed': '7z',
  'application/x-rar-compressed': 'rar',

  // Code
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/json': 'json',
  'text/html': 'html',
  'application/xhtml+xml': 'xhtml',
  'text/css': 'css',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

/**
 * Extract file extension from MIME type
 * Returns uppercase extension (e.g., "PDF", "DOCX", "JPG")
 */
export function extractFileExtension(contentType?: string): string {
  if (!contentType) return 'FILE';

  const type = contentType.toLowerCase();

  // Direct lookup
  if (MIME_TO_EXTENSION[type]) {
    return MIME_TO_EXTENSION[type].toUpperCase();
  }

  // Try to extract from MIME type patterns
  if (type.startsWith('image/')) {
    const ext = type.split('/')[1]?.split('+')[0];
    return ext ? ext.toUpperCase() : 'IMG';
  }

  if (type.startsWith('video/')) {
    const ext = type.split('/')[1]?.split('+')[0];
    return ext ? ext.toUpperCase() : 'VIDEO';
  }

  if (type.startsWith('audio/')) {
    const ext = type.split('/')[1]?.split('+')[0];
    return ext ? ext.toUpperCase() : 'AUDIO';
  }

  if (type.startsWith('text/')) {
    const ext = type.split('/')[1];
    return ext ? ext.toUpperCase() : 'TXT';
  }

  // Generic fallback
  const parts = type.split('/');
  if (parts.length > 1) {
    const ext = parts[1].split('+')[0].split('.').pop();
    return ext ? ext.toUpperCase() : 'FILE';
  }

  return 'FILE';
}

// ============================================
// Icon Mapping
// ============================================

/**
 * Get Lucide icon component for file category
 */
export function getFileTypeIcon(category: FileCategory): LucideIcon {
  const iconMap: Record<FileCategory, LucideIcon> = {
    document: FileText,
    image: Image,
    video: Film,
    audio: Music,
    archive: Archive,
    code: FileCode,
    other: File,
  };

  return iconMap[category] || File;
}

// ============================================
// Color Scheme Helpers
// ============================================

/**
 * Get color scheme for file category
 */
export function getFileTypeColors(category: FileCategory): ColorScheme {
  return FILE_TYPE_COLORS[category] || FILE_TYPE_COLORS.other;
}

/**
 * Get complete Tailwind classes for a file type badge
 */
export function getFileTypeBadgeClasses(
  category: FileCategory,
  size: 'sm' | 'md' | 'lg' = 'md'
): string {
  const colors = getFileTypeColors(category);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-sm',
    lg: 'px-3 py-2 text-base',
  };

  return `inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-all duration-200 ${colors.bg} ${colors.text} ${colors.border} ${colors.hover} ${sizeClasses[size]}`;
}

// ============================================
// File Type Labels
// ============================================

/**
 * Get human-readable label for file category
 */
export function getFileCategoryLabel(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    document: 'Document',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    archive: 'Archive',
    code: 'Code File',
    other: 'File',
  };

  return labels[category];
}

// ============================================
// File Type Categories for Filtering
// ============================================

/**
 * File type category definitions for faceted filtering
 */
export const FILE_TYPE_CATEGORIES = {
  documents: {
    value: 'documents',
    label: 'Documents',
    icon: FileText,
    mimePatterns: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats',
      'text/plain',
      'text/markdown',
    ],
  },
  images: {
    value: 'images',
    label: 'Images',
    icon: Image,
    mimePatterns: ['image/'],
  },
  videos: {
    value: 'videos',
    label: 'Videos',
    icon: Film,
    mimePatterns: ['video/'],
  },
  audio: {
    value: 'audio',
    label: 'Audio',
    icon: Music,
    mimePatterns: ['audio/'],
  },
  archives: {
    value: 'archives',
    label: 'Archives',
    icon: Archive,
    mimePatterns: [
      'application/zip',
      'application/x-tar',
      'application/gzip',
      'application/x-rar',
      'application/x-7z',
    ],
  },
  code: {
    value: 'code',
    label: 'Code Files',
    icon: FileCode,
    mimePatterns: [
      'text/javascript',
      'application/json',
      'text/html',
      'text/css',
      'application/xml',
    ],
  },
};

/**
 * Check if a MIME type matches a file type category filter
 */
export function matchesFileTypeFilter(
  contentType: string | undefined,
  filterCategory: string
): boolean {
  if (!contentType) return false;

  const category = FILE_TYPE_CATEGORIES[filterCategory as keyof typeof FILE_TYPE_CATEGORIES];
  if (!category) return false;

  const type = contentType.toLowerCase();
  return category.mimePatterns.some((pattern) => {
    if (pattern.endsWith('/')) {
      // Wildcard pattern like "image/"
      return type.startsWith(pattern);
    }
    // Exact or substring match
    return type.includes(pattern);
  });
}
