/**
 * useCommandPalette Hook - Keyboard shortcuts and command palette utilities
 *
 * Features:
 * - Cmd+K / Ctrl+K keyboard shortcut
 * - / key for quick search
 * - Escape key handling
 * - Recent history management
 * - Navigation tracking
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useCommandPaletteContext } from '@/contexts/CommandPaletteContext';

export interface UseCommandPaletteOptions {
  /**
   * Disable keyboard shortcuts
   * @default false
   */
  disabled?: boolean;

  /**
   * Callback when palette opens
   */
  onOpen?: () => void;

  /**
   * Callback when palette closes
   */
  onClose?: () => void;
}

/**
 * Hook for managing command palette keyboard shortcuts
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useCommandPalette({
 *     onOpen: () => console.log('Palette opened'),
 *     onClose: () => console.log('Palette closed'),
 *   });
 *
 *   return <div>Press Cmd+K to open command palette</div>;
 * }
 * ```
 */
export function useCommandPalette(options: UseCommandPaletteOptions = {}) {
  const { disabled = false, onOpen, onClose } = options;
  const { isOpen, open, close, toggle } = useCommandPaletteContext();

  // Handle keyboard shortcuts
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const isContentEditable = target.isContentEditable;

      // Cmd+K or Ctrl+K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
        return;
      }

      // / key to open (if not in input)
      if (e.key === '/' && !isInput && !isContentEditable) {
        e.preventDefault();
        if (!isOpen) {
          open();
        }
        return;
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, isOpen, open, close, toggle]);

  // Trigger callbacks
  useEffect(() => {
    if (isOpen && onOpen) {
      onOpen();
    } else if (!isOpen && onClose) {
      onClose();
    }
  }, [isOpen, onOpen, onClose]);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

/**
 * Hook for registering custom keyboard shortcuts
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useKeyboardShortcut({
 *     key: 'n',
 *     metaKey: true,
 *     action: () => console.log('Cmd+N pressed'),
 *   });
 *
 *   return <div>Press Cmd+N for custom action</div>;
 * }
 * ```
 */
export function useKeyboardShortcut(config: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  disabled?: boolean;
}) {
  const {
    key,
    metaKey = false,
    ctrlKey = false,
    shiftKey = false,
    altKey = false,
    action,
    disabled = false,
  } = config;

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const matchesKey = e.key.toLowerCase() === key.toLowerCase();
      const matchesMeta = metaKey ? e.metaKey : true;
      const matchesCtrl = ctrlKey ? e.ctrlKey : true;
      const matchesShift = shiftKey ? e.shiftKey : true;
      const matchesAlt = altKey ? e.altKey : true;

      if (matchesKey && matchesMeta && matchesCtrl && matchesShift && matchesAlt) {
        e.preventDefault();
        action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, metaKey, ctrlKey, shiftKey, altKey, action, disabled]);
}
