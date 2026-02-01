/**
 * KeyboardShortcutsModal - Categorized shortcut reference
 *
 * Triggered by pressing ? or via the useKeyboardNavigation hook.
 * Shows all available keyboard shortcuts grouped by category.
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KEYBOARD_SHORTCUTS, type KeyboardShortcut } from '@/hooks/use-keyboard-navigation';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  navigation: { label: 'Navigation', description: 'Press g then a letter to jump to a page' },
  list: { label: 'List Navigation', description: 'Navigate items in lists and tables' },
  action: { label: 'Actions', description: 'Quick actions and search' },
  modal: { label: 'General', description: 'Modals and help' },
};

const CATEGORY_ORDER = ['list', 'navigation', 'action', 'modal'];

function groupByCategory(shortcuts: KeyboardShortcut[]) {
  const groups: Record<string, KeyboardShortcut[]> = {};
  for (const shortcut of shortcuts) {
    if (!groups[shortcut.category]) {
      groups[shortcut.category] = [];
    }
    groups[shortcut.category].push(shortcut);
  }
  return groups;
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs font-mono font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const grouped = groupByCategory(KEYBOARD_SHORTCUTS);

  const backdropMotion = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const panelMotion = prefersReducedMotion
    ? {}
    : {
        initial: { scale: 0.95, opacity: 0, y: 20 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.95, opacity: 0, y: 20 },
        transition: { type: 'spring', stiffness: 300, damping: 25 },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          {...backdropMotion}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            {...panelMotion}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                aria-label="Close shortcuts"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {CATEGORY_ORDER.map((category) => {
                const shortcuts = grouped[category];
                if (!shortcuts) return null;
                const meta = CATEGORY_LABELS[category];

                return (
                  <div key={category}>
                    <div className="mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {meta?.label ?? category}
                      </h3>
                      {meta?.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {meta.description}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.label}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {shortcut.description}
                          </span>
                          <div className="flex items-center gap-1">
                            {shortcut.chord && (
                              <>
                                <KbdKey>{shortcut.chord}</KbdKey>
                                <span className="text-xs text-gray-400 mx-0.5">then</span>
                              </>
                            )}
                            <KbdKey>{shortcut.key}</KbdKey>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Press <KbdKey>?</KbdKey> anywhere to toggle this panel
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default KeyboardShortcutsModal;
