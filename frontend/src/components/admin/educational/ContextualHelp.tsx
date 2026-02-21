/**
 * Contextual Help System for Admin UI
 *
 * Provides inline help tooltips for complex form fields and admin actions
 * Features:
 * - Field-level help tooltips
 * - Slide-out help panels
 * - Quick tips carousel
 * - Documentation links
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Info,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  BookOpen,
} from 'lucide-react';
import { adminAnimations, adminZIndex } from '@/components/admin/shared/theme-tokens';

/**
 * Help tooltip variant types
 */
export type HelpVariant = 'info' | 'warning' | 'success' | 'help';

/**
 * Help content interface
 */
export interface HelpContent {
  title: string;
  description: string;
  examples?: string[];
  warnings?: string[];
  tips?: string[];
  learnMoreUrl?: string;
  learnMoreLabel?: string;
}

/**
 * Inline Help Tooltip Component
 *
 * @example
 * ```tsx
 * <InlineHelp
 *   variant="info"
 *   content={{
 *     title: "OIDC Discovery URL",
 *     description: "The endpoint where OIDC provider configuration is available",
 *     examples: ["https://accounts.google.com/.well-known/openid-configuration"],
 *     learnMoreUrl: "/docs/oidc-configuration"
 *   }}
 * />
 * ```
 */
export function InlineHelp({
  variant = 'help',
  content,
  position = 'top',
  size = 'md',
}: {
  variant?: HelpVariant;
  content: HelpContent;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Icon mapping
  const icons = {
    info: Info,
    warning: AlertTriangle,
    success: CheckCircle,
    help: HelpCircle,
  };

  // Color mapping
  const colors = {
    info: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30',
    warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
    help: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
  };

  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const Icon = icons[variant];

  // Position classes
  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex items-center justify-center ${sizes[size]} rounded-full transition-colors ${colors[variant]}`}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Show help"
      >
        <Icon className={`${sizes[size]}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...adminAnimations.fadeIn}
            className={`absolute ${positionClasses[position]} w-80 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[${adminZIndex.tooltip}]`}
          >
            {/* Title */}
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {content.title}
            </h4>

            {/* Description */}
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
              {content.description}
            </p>

            {/* Examples */}
            {content.examples && content.examples.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Example:
                </div>
                <div className="space-y-1">
                  {content.examples.map((example, idx) => (
                    <code
                      key={idx}
                      className="block px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-300 font-mono"
                    >
                      {example}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {content.warnings && content.warnings.length > 0 && (
              <div className="mb-3">
                {content.warnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">{warning}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tips */}
            {content.tips && content.tips.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tips:
                </div>
                <ul className="space-y-1">
                  {content.tips.map((tip, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400"
                    >
                      <span className="text-indigo-600 dark:text-indigo-400">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Learn More Link */}
            {content.learnMoreUrl && (
              <a
                href={content.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                {content.learnMoreLabel || 'Learn more'}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Arrow */}
            <div
              className={`absolute w-2 h-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rotate-45 ${
                position === 'top'
                  ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r'
                  : position === 'bottom'
                    ? 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l'
                    : position === 'left'
                      ? 'right-[-5px] top-1/2 -translate-y-1/2 border-r border-t'
                      : 'left-[-5px] top-1/2 -translate-y-1/2 border-l border-b'
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Slide-out Help Panel Component
 *
 * @example
 * ```tsx
 * <HelpPanel
 *   isOpen={isHelpOpen}
 *   onClose={() => setIsHelpOpen(false)}
 *   title="IdP Configuration Guide"
 *   sections={[
 *     {
 *       title: "OIDC Configuration",
 *       content: "...",
 *       items: [...]
 *     }
 *   ]}
 * />
 * ```
 */
export interface HelpPanelSection {
  title: string;
  content: string;
  items?: Array<{
    label: string;
    description: string;
    example?: string;
  }>;
}

export function HelpPanel({
  isOpen,
  onClose,
  title,
  sections,
  position = 'right',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sections: HelpPanelSection[];
  position?: 'left' | 'right';
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm z-[999]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: position === 'right' ? 100 : -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: position === 'right' ? 100 : -100 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`fixed top-0 ${position === 'right' ? 'right-0' : 'left-0'} h-full w-full md:w-96 bg-white dark:bg-slate-900 shadow-2xl z-[1000] flex flex-col`}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {title}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Quick reference guide
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
                  aria-label="Close help panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-6">
                {sections.map((section, idx) => (
                  <div key={idx}>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      {section.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                      {section.content}
                    </p>

                    {section.items && section.items.length > 0 && (
                      <div className="space-y-3">
                        {section.items.map((item, itemIdx) => (
                          <div
                            key={itemIdx}
                            className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg"
                          >
                            <div className="font-medium text-sm text-slate-900 dark:text-slate-100 mb-1">
                              {item.label}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                              {item.description}
                            </p>
                            {item.example && (
                              <code className="block px-2 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-300 font-mono">
                                {item.example}
                              </code>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded font-mono">ESC</kbd> to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Quick Tips Carousel Component
 *
 * @example
 * ```tsx
 * <QuickTipsCarousel
 *   tips={[
 *     { title: "Tip 1", content: "..." },
 *     { title: "Tip 2", content: "..." }
 *   ]}
 * />
 * ```
 */
export interface QuickTip {
  title: string;
  content: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  actionUrl?: string;
}

export function QuickTipsCarousel({
  tips,
  autoRotate = true,
  interval = 8000,
}: {
  tips: QuickTip[];
  autoRotate?: boolean;
  interval?: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotation
  useEffect(() => {
    if (!autoRotate || isPaused || tips.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, interval);

    return () => clearInterval(timer);
  }, [autoRotate, isPaused, tips.length, interval]);

  const currentTip = tips[currentIndex];

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % tips.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
  };

  if (tips.length === 0) return null;

  return (
    <div
      className="relative px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex items-start gap-3"
        >
          {currentTip.icon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              {currentTip.icon}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              💡 {currentTip.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {currentTip.content}
            </p>

            {currentTip.actionLabel && currentTip.actionUrl && (
              <a
                href={currentTip.actionUrl}
                className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                {currentTip.actionLabel}
                <ChevronRight className="w-3 h-3" />
              </a>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {tips.length > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              className="p-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-slate-600 dark:text-slate-400 transition-colors"
              aria-label="Previous tip"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToNext}
              className="p-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-slate-600 dark:text-slate-400 transition-colors"
              aria-label="Next tip"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {tips.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  idx === currentIndex
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-indigo-300 dark:bg-indigo-700 hover:bg-indigo-400 dark:hover:bg-indigo-600'
                }`}
                aria-label={`Go to tip ${idx + 1}`}
              />
            ))}
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {currentIndex + 1} / {tips.length}
          </span>
        </div>
      )}
    </div>
  );
}

export default InlineHelp;
