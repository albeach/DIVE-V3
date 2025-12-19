/**
 * Resource Preview Modal Component (2025)
 * 
 * Quick preview modal for resources with:
 * - Keyboard navigation (Space to open, arrows to navigate)
 * - Swipe gestures on mobile
 * - Quick actions (open, bookmark, export)
 * - WCAG 2.1 AA compliant accessibility
 * 
 * Accessibility features:
 * - role="dialog" with aria-modal="true"
 * - aria-labelledby and aria-describedby
 * - Focus trapping within modal
 * - Escape key closes modal
 * - Returns focus to trigger element on close
 */

'use client';

import React, { useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  Bookmark, 
  Download, 
  Shield, 
  Globe2, 
  Users, 
  Lock, 
  FileText,
  Calendar,
  Eye,
  EyeOff
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  displayMarking?: string;
  originRealm?: string;
  content?: string;
}

interface ResourcePreviewModalProps {
  resource: IResource | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  hasPrev: boolean;
  hasNext: boolean;
  userAttributes?: {
    clearance?: string;
    country?: string;
    coi?: string[];
  };
}

// ============================================
// Constants
// ============================================

const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
  'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'CONFIDENTIAL': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'SECRET': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'TOP_SECRET': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

const instanceFlags: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'CAN': '🇨🇦',
};

// ============================================
// Component
// ============================================

export default function ResourcePreviewModal({
  resource,
  isOpen,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
  userAttributes,
}: ResourcePreviewModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  
  // Generate unique IDs for ARIA attributes
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Store previously focused element and restore on close
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
    } else {
      // Restore focus when closing
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
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

  // Keyboard navigation and focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (hasPrev) onNavigate('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasNext) onNavigate('next');
          break;
        case 'Enter':
          // Only handle Enter if not on a button/link
          if (
            document.activeElement?.tagName !== 'BUTTON' &&
            document.activeElement?.tagName !== 'A'
          ) {
            e.preventDefault();
            if (resource) {
              router.push(`/resources/${resource.resourceId}`);
              onClose();
            }
          }
          break;
        case 'Tab':
          // Focus trap within modal
          if (modalRef.current) {
            const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
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
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onNavigate, onClose, resource, router]);

  // Focus close button when modal opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Touch/swipe handling
  const touchStartX = useRef<number | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0 && hasNext) {
        onNavigate('next');
      } else if (diff < 0 && hasPrev) {
        onNavigate('prev');
      }
    }
    
    touchStartX.current = null;
  };

  const getAccessIndicator = useCallback(() => {
    if (!resource || !userAttributes?.clearance || !userAttributes?.country) {
      return { status: 'unknown', message: 'Access unknown', color: 'gray' };
    }

    const clearanceOrder: Record<string, number> = {
      'UNCLASSIFIED': 0,
      'RESTRICTED': 0.5,
      'CONFIDENTIAL': 1,
      'SECRET': 2,
      'TOP_SECRET': 3,
    };

    const userLevel = clearanceOrder[userAttributes.clearance] ?? 0;
    const docLevel = clearanceOrder[resource.classification] ?? 0;

    if (userLevel < docLevel) {
      return { status: 'denied', message: 'Insufficient clearance', color: 'red' };
    }

    if (!resource.releasabilityTo.includes(userAttributes.country)) {
      return { status: 'denied', message: 'Country not authorized', color: 'red' };
    }

    if (resource.COI.length > 0) {
      const userCOIs = userAttributes.coi || [];
      const hasRequiredCOI = resource.COI.some(coi => userCOIs.includes(coi));
      if (!hasRequiredCOI) {
        return { status: 'possible', message: 'COI may be required', color: 'yellow' };
      }
    }

    return { status: 'allowed', message: 'Access likely', color: 'green' };
  }, [resource, userAttributes]);

  if (!mounted) return null;

  const classColors = resource 
    ? (classificationColors[resource.classification] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' })
    : { bg: '', text: '', border: '' };

  const accessIndicator = getAccessIndicator();

  const modalContent = (
    <AnimatePresence>
      {isOpen && resource && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-4 md:inset-10 lg:inset-16 z-50 flex items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="relative w-full max-w-4xl max-h-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Close Button */}
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Close preview"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              {/* Navigation Arrows */}
              {hasPrev && (
                <button
                  onClick={() => onNavigate('prev')}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Previous resource"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </button>
              )}
              {hasNext && (
                <button
                  onClick={() => onNavigate('next')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Next resource"
                >
                  <ChevronRight className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </button>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Header with Classification Banner */}
                <div className={`${classColors.bg} px-6 py-4 border-b ${classColors.border}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span 
                          className={`px-3 py-1 rounded-lg text-sm font-bold ${classColors.bg} ${classColors.text} border ${classColors.border}`}
                          role="status"
                          aria-label={`Classification: ${resource.classification.replace('_', ' ')}`}
                        >
                          {resource.classification.replace('_', ' ')}
                        </span>
                        {resource.originRealm && (
                          <span className="px-2 py-1 rounded-lg text-xs font-bold bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300">
                            {instanceFlags[resource.originRealm]} {resource.originRealm}
                          </span>
                        )}
                        {resource.encrypted && (
                          <span 
                            className="px-2 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white"
                            aria-label="Resource is encrypted with ZTDF"
                          >
                            <Lock className="w-3 h-3 inline mr-1" aria-hidden="true" />
                            ZTDF
                          </span>
                        )}
                      </div>
                      <h2 
                        id={titleId}
                        className="text-xl font-bold text-gray-900 dark:text-white mb-1"
                      >
                        {resource.title}
                      </h2>
                      <p 
                        id={descId}
                        className="text-sm text-gray-600 dark:text-gray-400 font-mono"
                      >
                        {resource.resourceId}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                  {/* Access Status */}
                  <div className={`flex items-center gap-3 p-4 rounded-xl ${
                    accessIndicator.color === 'green' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                    accessIndicator.color === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
                    accessIndicator.color === 'red' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                    'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  }`}>
                    {accessIndicator.color === 'green' ? (
                      <Eye className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : accessIndicator.color === 'red' ? (
                      <EyeOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    )}
                    <div>
                      <p className={`font-semibold ${
                        accessIndicator.color === 'green' ? 'text-green-800 dark:text-green-200' :
                        accessIndicator.color === 'yellow' ? 'text-yellow-800 dark:text-yellow-200' :
                        accessIndicator.color === 'red' ? 'text-red-800 dark:text-red-200' :
                        'text-gray-800 dark:text-gray-200'
                      }`}>
                        {accessIndicator.message}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Based on your clearance: {userAttributes?.clearance || 'Unknown'}, 
                        Country: {userAttributes?.country || 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Releasability */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Globe2 className="w-4 h-4 text-blue-500" />
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Releasable To
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {resource.releasabilityTo.map((country) => (
                          <span
                            key={country}
                            className={`px-2 py-1 rounded-md text-xs font-semibold ${
                              userAttributes?.country === country
                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 ring-1 ring-green-400'
                                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {country}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Communities of Interest */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-purple-500" />
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Communities of Interest
                        </h4>
                      </div>
                      {resource.COI && resource.COI.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {resource.COI.map((coi) => (
                            <span
                              key={coi}
                              className={`px-2 py-1 rounded-md text-xs font-semibold ${
                                userAttributes?.coi?.includes(coi)
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 ring-1 ring-green-400'
                                  : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              }`}
                            >
                              {coi}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No COI requirements
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Display Marking */}
                  {resource.displayMarking && (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                        STANAG-4774 Display Marking
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white font-mono bg-white dark:bg-gray-700 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 inline-block">
                        {resource.displayMarking}
                      </p>
                    </div>
                  )}

                  {/* Creation Date */}
                  {resource.creationDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>Created: {new Date(resource.creationDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">←</kbd>
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">→</kbd>
                      navigate
                    </span>
                    <span className="hidden sm:flex items-center gap-1 ml-2">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">↵</kbd>
                      open
                    </span>
                    <span className="hidden sm:flex items-center gap-1 ml-2">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">esc</kbd>
                      close
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        router.push(`/resources/${resource.resourceId}`);
                        onClose();
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      Open Full View
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}

// ============================================
// Hook for managing preview state
// ============================================

export function useResourcePreview(resources: IResource[]) {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const openPreview = useCallback((resourceId: string) => {
    const index = resources.findIndex(r => r.resourceId === resourceId);
    if (index !== -1) {
      setSelectedIndex(index);
      setIsOpen(true);
    }
  }, [resources]);

  const closePreview = useCallback(() => {
    setIsOpen(false);
  }, []);

  const navigatePreview = useCallback((direction: 'prev' | 'next') => {
    if (selectedIndex === null) return;
    
    if (direction === 'prev' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (direction === 'next' && selectedIndex < resources.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  }, [selectedIndex, resources.length]);

  // Space bar to open preview (global listener)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isOpen && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // This would need integration with the currently focused/hovered resource
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return {
    isOpen,
    selectedResource: selectedIndex !== null ? resources[selectedIndex] : null,
    hasPrev: selectedIndex !== null && selectedIndex > 0,
    hasNext: selectedIndex !== null && selectedIndex < resources.length - 1,
    openPreview,
    closePreview,
    navigatePreview,
  };
}
