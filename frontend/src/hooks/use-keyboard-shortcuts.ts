/**
 * Keyboard Shortcuts Hook
 * 
 * Provides keyboard shortcut functionality for admin pages.
 * Integrates with the command palette and provides per-page shortcuts.
 */

import { useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

export interface KeyboardShortcut {
  /** Key combination (e.g., 'ctrl+s', 'cmd+shift+p') */
  keys: string;
  /** Handler function */
  handler: (event: KeyboardEvent) => void;
  /** Description for help menu */
  description?: string;
  /** Prevent default browser behavior */
  preventDefault?: boolean;
  /** Condition for when shortcut is active */
  when?: () => boolean;
  /** Scope (global, admin, editor) */
  scope?: 'global' | 'admin' | 'editor';
}

type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta' | 'cmd';

interface ParsedShortcut {
  modifiers: Set<ModifierKey>;
  key: string;
}

// ============================================
// Parser
// ============================================

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const modifiers = new Set<ModifierKey>();
  let key = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (['ctrl', 'control'].includes(trimmed)) {
      modifiers.add('ctrl');
    } else if (['alt', 'option'].includes(trimmed)) {
      modifiers.add('alt');
    } else if (trimmed === 'shift') {
      modifiers.add('shift');
    } else if (['meta', 'cmd', 'command', '⌘'].includes(trimmed)) {
      modifiers.add('meta');
      modifiers.add('cmd');
    } else {
      key = trimmed;
    }
  }

  return { modifiers, key };
}

function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const { modifiers, key } = parsed;

  // Check modifiers
  const hasCtrl = event.ctrlKey || event.metaKey; // cmd on Mac = ctrl
  const hasAlt = event.altKey;
  const hasShift = event.shiftKey;
  const hasMeta = event.metaKey;

  const wantsCtrlOrCmd = modifiers.has('ctrl') || modifiers.has('cmd') || modifiers.has('meta');
  const wantsAlt = modifiers.has('alt');
  const wantsShift = modifiers.has('shift');

  if (wantsCtrlOrCmd !== hasCtrl && wantsCtrlOrCmd !== hasMeta) return false;
  if (wantsAlt !== hasAlt) return false;
  if (wantsShift !== hasShift) return false;

  // Check key
  const eventKey = event.key.toLowerCase();
  const eventCode = event.code.toLowerCase();

  // Handle special keys
  if (key === 'escape' || key === 'esc') {
    return eventKey === 'escape';
  }
  if (key === 'enter' || key === 'return') {
    return eventKey === 'enter';
  }
  if (key === 'space' || key === ' ') {
    return eventKey === ' ' || eventCode === 'space';
  }
  if (key === 'backspace') {
    return eventKey === 'backspace';
  }
  if (key === 'delete' || key === 'del') {
    return eventKey === 'delete';
  }
  if (key === 'tab') {
    return eventKey === 'tab';
  }
  if (key.startsWith('arrow')) {
    return eventKey === key;
  }
  if (key.startsWith('f') && /^f\d+$/.test(key)) {
    return eventKey === key;
  }

  // Regular key
  return eventKey === key || eventCode === `key${key.toUpperCase()}`;
}

// ============================================
// Hook
// ============================================

/**
 * Register keyboard shortcuts
 * 
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { keys: 'ctrl+s', handler: handleSave, description: 'Save changes' },
 *   { keys: 'escape', handler: handleClose },
 *   { keys: 'ctrl+shift+p', handler: openCommandPalette },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger in input fields unless explicitly allowed
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    for (const shortcut of shortcutsRef.current) {
      const parsed = parseShortcut(shortcut.keys);

      if (matchesShortcut(event, parsed)) {
        // Check condition
        if (shortcut.when && !shortcut.when()) {
          continue;
        }

        // Skip if in input and not a global shortcut
        if (isInput && shortcut.scope !== 'global') {
          continue;
        }

        // Prevent default if specified
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
          event.stopPropagation();
        }

        shortcut.handler(event);
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// ============================================
// Pre-built Shortcut Sets
// ============================================

export const adminShortcuts = {
  /**
   * Create common admin shortcuts
   */
  create: (handlers: {
    onSearch?: () => void;
    onRefresh?: () => void;
    onSave?: () => void;
    onNew?: () => void;
    onDelete?: () => void;
    onClose?: () => void;
    onHelp?: () => void;
  }): KeyboardShortcut[] => {
    const shortcuts: KeyboardShortcut[] = [];

    if (handlers.onSearch) {
      shortcuts.push({
        keys: 'ctrl+k',
        handler: handlers.onSearch,
        description: 'Open search / command palette',
        scope: 'global',
      });
      shortcuts.push({
        keys: 'cmd+k',
        handler: handlers.onSearch,
        description: 'Open search / command palette',
        scope: 'global',
      });
      shortcuts.push({
        keys: '/',
        handler: handlers.onSearch,
        description: 'Focus search',
      });
    }

    if (handlers.onRefresh) {
      shortcuts.push({
        keys: 'ctrl+r',
        handler: handlers.onRefresh,
        description: 'Refresh data',
      });
      shortcuts.push({
        keys: 'cmd+r',
        handler: handlers.onRefresh,
        description: 'Refresh data',
      });
    }

    if (handlers.onSave) {
      shortcuts.push({
        keys: 'ctrl+s',
        handler: handlers.onSave,
        description: 'Save changes',
        scope: 'global',
      });
      shortcuts.push({
        keys: 'cmd+s',
        handler: handlers.onSave,
        description: 'Save changes',
        scope: 'global',
      });
    }

    if (handlers.onNew) {
      shortcuts.push({
        keys: 'ctrl+n',
        handler: handlers.onNew,
        description: 'Create new',
      });
      shortcuts.push({
        keys: 'cmd+n',
        handler: handlers.onNew,
        description: 'Create new',
      });
    }

    if (handlers.onDelete) {
      shortcuts.push({
        keys: 'delete',
        handler: handlers.onDelete,
        description: 'Delete selected',
      });
      shortcuts.push({
        keys: 'backspace',
        handler: handlers.onDelete,
        description: 'Delete selected',
      });
    }

    if (handlers.onClose) {
      shortcuts.push({
        keys: 'escape',
        handler: handlers.onClose,
        description: 'Close / cancel',
        scope: 'global',
      });
    }

    if (handlers.onHelp) {
      shortcuts.push({
        keys: '?',
        handler: handlers.onHelp,
        description: 'Show keyboard shortcuts',
      });
      shortcuts.push({
        keys: 'f1',
        handler: handlers.onHelp,
        description: 'Show help',
        scope: 'global',
      });
    }

    return shortcuts;
  },

  /**
   * Navigation shortcuts
   */
  navigation: (handlers: {
    onGoToDashboard?: () => void;
    onGoToUsers?: () => void;
    onGoToIdPs?: () => void;
    onGoToPolicies?: () => void;
    onGoToLogs?: () => void;
    onGoToSettings?: () => void;
  }): KeyboardShortcut[] => {
    const shortcuts: KeyboardShortcut[] = [];

    if (handlers.onGoToDashboard) {
      shortcuts.push({
        keys: 'g d',
        handler: handlers.onGoToDashboard,
        description: 'Go to Dashboard',
      });
    }

    if (handlers.onGoToUsers) {
      shortcuts.push({
        keys: 'g u',
        handler: handlers.onGoToUsers,
        description: 'Go to Users',
      });
    }

    if (handlers.onGoToIdPs) {
      shortcuts.push({
        keys: 'g i',
        handler: handlers.onGoToIdPs,
        description: 'Go to Identity Providers',
      });
    }

    if (handlers.onGoToPolicies) {
      shortcuts.push({
        keys: 'g p',
        handler: handlers.onGoToPolicies,
        description: 'Go to Policies',
      });
    }

    if (handlers.onGoToLogs) {
      shortcuts.push({
        keys: 'g l',
        handler: handlers.onGoToLogs,
        description: 'Go to Audit Logs',
      });
    }

    if (handlers.onGoToSettings) {
      shortcuts.push({
        keys: 'g s',
        handler: handlers.onGoToSettings,
        description: 'Go to Settings',
      });
    }

    return shortcuts;
  },

  /**
   * Table/list shortcuts
   */
  table: (handlers: {
    onSelectAll?: () => void;
    onDeselectAll?: () => void;
    onNextPage?: () => void;
    onPrevPage?: () => void;
    onFirstPage?: () => void;
    onLastPage?: () => void;
  }): KeyboardShortcut[] => {
    const shortcuts: KeyboardShortcut[] = [];

    if (handlers.onSelectAll) {
      shortcuts.push({
        keys: 'ctrl+a',
        handler: handlers.onSelectAll,
        description: 'Select all',
      });
      shortcuts.push({
        keys: 'cmd+a',
        handler: handlers.onSelectAll,
        description: 'Select all',
      });
    }

    if (handlers.onDeselectAll) {
      shortcuts.push({
        keys: 'escape',
        handler: handlers.onDeselectAll,
        description: 'Deselect all',
      });
    }

    if (handlers.onNextPage) {
      shortcuts.push({
        keys: 'ctrl+arrowright',
        handler: handlers.onNextPage,
        description: 'Next page',
      });
    }

    if (handlers.onPrevPage) {
      shortcuts.push({
        keys: 'ctrl+arrowleft',
        handler: handlers.onPrevPage,
        description: 'Previous page',
      });
    }

    if (handlers.onFirstPage) {
      shortcuts.push({
        keys: 'ctrl+home',
        handler: handlers.onFirstPage,
        description: 'First page',
      });
    }

    if (handlers.onLastPage) {
      shortcuts.push({
        keys: 'ctrl+end',
        handler: handlers.onLastPage,
        description: 'Last page',
      });
    }

    return shortcuts;
  },
};

// ============================================
// Keyboard Shortcuts Help Component Data
// ============================================

export function getShortcutHelpSections(): Array<{
  title: string;
  shortcuts: Array<{ keys: string; description: string }>;
}> {
  return [
    {
      title: 'General',
      shortcuts: [
        { keys: '⌘/Ctrl + K', description: 'Open command palette' },
        { keys: '/', description: 'Focus search' },
        { keys: '⌘/Ctrl + S', description: 'Save changes' },
        { keys: 'Escape', description: 'Close / Cancel' },
        { keys: '?', description: 'Show keyboard shortcuts' },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        { keys: 'G then D', description: 'Go to Dashboard' },
        { keys: 'G then U', description: 'Go to Users' },
        { keys: 'G then I', description: 'Go to Identity Providers' },
        { keys: 'G then P', description: 'Go to Policies' },
        { keys: 'G then L', description: 'Go to Audit Logs' },
      ],
    },
    {
      title: 'Tables',
      shortcuts: [
        { keys: '⌘/Ctrl + A', description: 'Select all' },
        { keys: 'Delete / Backspace', description: 'Delete selected' },
        { keys: '⌘/Ctrl + ←/→', description: 'Previous / Next page' },
        { keys: '⌘/Ctrl + R', description: 'Refresh data' },
      ],
    },
  ];
}

export default useKeyboardShortcuts;
