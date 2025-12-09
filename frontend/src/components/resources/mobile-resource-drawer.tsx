/**
 * Mobile Resource Drawer - Phase 4 Mobile-First Responsive Redesign
 * 
 * A bottom sheet drawer for mobile devices with:
 * - Swipe to close gesture
 * - Smooth spring animations
 * - Dark mode optimized colors
 * - Touch-friendly hit targets (48px minimum)
 * - Optimized for thumb reach
 * 
 * Inspired by iOS/Android bottom sheets
 */

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronDown,
  FileText,
  Shield,
  Lock,
  Globe2,
  Users,
  Calendar,
  ExternalLink,
  Bookmark,
  Share2,
  Download,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface MobileResourceDrawerProps {
  resource: {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
    creationDate?: string;
    originRealm?: string;
    content?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onBookmark?: () => void;
  isBookmarked?: boolean;
  userAttributes?: {
    clearance?: string;
    country?: string;
  };
}

// ============================================
// Constants
// ============================================

const DRAWER_HEIGHT = '85vh';
const CLOSE_THRESHOLD = 150; // Drag distance to trigger close

const classificationColors: Record<string, { 
  bg: string;
  text: string;
  darkBg: string;
  darkText: string;
}> = {
  UNCLASSIFIED: {
    bg: 'bg-emerald-500',
    text: 'text-white',
    darkBg: 'dark:bg-emerald-600',
    darkText: 'dark:text-white',
  },
  CONFIDENTIAL: {
    bg: 'bg-amber-500',
    text: 'text-white',
    darkBg: 'dark:bg-amber-600',
    darkText: 'dark:text-white',
  },
  SECRET: {
    bg: 'bg-orange-600',
    text: 'text-white',
    darkBg: 'dark:bg-orange-600',
    darkText: 'dark:text-white',
  },
  TOP_SECRET: {
    bg: 'bg-red-600',
    text: 'text-white',
    darkBg: 'dark:bg-red-700',
    darkText: 'dark:text-white',
  },
};

const instanceFlags: Record<string, string> = {
  USA: '🇺🇸',
  FRA: '🇫🇷',
  GBR: '🇬🇧',
  DEU: '🇩🇪',
  CAN: '🇨🇦',
};

// ============================================
// Component
// ============================================

export default function MobileResourceDrawer({
  resource,
  isOpen,
  onClose,
  onOpen,
  onBookmark,
  isBookmarked = false,
  userAttributes,
}: MobileResourceDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent body scroll when drawer is open
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

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > 500) {
      onClose();
    }
  };

  if (!mounted) return null;

  const classColors = resource 
    ? classificationColors[resource.classification] || classificationColors.UNCLASSIFIED
    : classificationColors.UNCLASSIFIED;

  const drawerContent = (
    <AnimatePresence>
      {isOpen && resource && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            style={{ height: DRAWER_HEIGHT }}
            className="fixed inset-x-0 bottom-0 z-50 md:hidden"
          >
            <div className="h-full bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
              {/* Drag Handle */}
              <div 
                className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Classification Banner */}
              <div className={`
                px-4 py-3 flex items-center justify-between
                ${classColors.bg} ${classColors.darkBg}
              `}>
                <span className={`text-sm font-black tracking-wide ${classColors.text} ${classColors.darkText}`}>
                  {resource.classification.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-2">
                  {resource.originRealm && (
                    <span className="text-sm font-medium text-white/80">
                      {instanceFlags[resource.originRealm]} {resource.originRealm}
                    </span>
                  )}
                  {resource.encrypted && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold text-white">
                      <Lock className="w-3 h-3" />
                      ZTDF
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <div className="p-4 space-y-4">
                  {/* Title */}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      {resource.title}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {resource.resourceId}
                    </p>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Releasability */}
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                          Releasable To
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {resource.releasabilityTo.slice(0, 3).map((country) => (
                          <span
                            key={country}
                            className={`
                              px-2 py-0.5 rounded text-xs font-bold
                              ${userAttributes?.country === country
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              }
                            `}
                          >
                            {instanceFlags[country] || ''} {country}
                          </span>
                        ))}
                        {resource.releasabilityTo.length > 3 && (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                            +{resource.releasabilityTo.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* COI */}
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                          Communities
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {resource.COI.length > 0 ? (
                          resource.COI.map((coi) => (
                            <span
                              key={coi}
                              className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                            >
                              {coi}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            None required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date */}
                  {resource.creationDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(resource.creationDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  {/* Encryption Info */}
                  {resource.encrypted && (
                    <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
                          <Lock className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100">
                            ZTDF Protected
                          </h4>
                          <p className="text-xs text-purple-700 dark:text-purple-300">
                            This document requires KAS key access
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar - Fixed at bottom, optimized for thumb reach */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 safe-area-pb">
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {/* Bookmark */}
                  <button
                    onClick={onBookmark}
                    className={`
                      flex flex-col items-center justify-center p-3 rounded-xl min-h-[60px] transition-colors
                      ${isBookmarked
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }
                    `}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                  >
                    <Bookmark className={`w-5 h-5 mb-1 ${isBookmarked ? 'fill-current' : ''}`} />
                    <span className="text-[10px] font-medium">
                      {isBookmarked ? 'Saved' : 'Save'}
                    </span>
                  </button>

                  {/* Share */}
                  <button
                    className="flex flex-col items-center justify-center p-3 rounded-xl min-h-[60px] bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                    aria-label="Share document"
                  >
                    <Share2 className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Share</span>
                  </button>

                  {/* Download */}
                  <button
                    className="flex flex-col items-center justify-center p-3 rounded-xl min-h-[60px] bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                    aria-label="Download document"
                  >
                    <Download className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Export</span>
                  </button>

                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="flex flex-col items-center justify-center p-3 rounded-xl min-h-[60px] bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
                    aria-label="Close drawer"
                  >
                    <ChevronDown className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Close</span>
                  </button>
                </div>

                {/* Open Full View Button */}
                <a
                  href={`/resources/${resource.resourceId}`}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Full View
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(drawerContent, document.body) : null;
}

// ============================================
// Swipe Handler Hook
// ============================================

export function useSwipeToOpen(onOpen: () => void, threshold = 100) {
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    
    // Swipe up from bottom of screen
    if (diff > threshold && touchStartY.current > window.innerHeight - 100) {
      onOpen();
    }
    
    touchStartY.current = null;
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}








