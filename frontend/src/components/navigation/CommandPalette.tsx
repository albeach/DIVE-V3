/**
 * Command Palette (Cmd+K) - Phase 3
 *
 * Features:
 * - Global keyboard shortcut (Cmd+K / Ctrl+K)
 * - Fuzzy search across navigation, recent items, bookmarks
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Recent searches history
 * - Mobile-friendly
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  Search,
  Home,
  FileText,
  Settings,
  LogOut,
  RefreshCw,
  Upload,
  Clock,
  Star,
  ChevronRight,
  Command as CommandIcon
} from 'lucide-react';
import { navItems, adminItems } from './nav-config';
import { getRecentItems } from '@/lib/recent-items';
import { getBookmarks } from '@/lib/bookmarks';
import { useTranslation } from '@/hooks/useTranslation';

interface CommandPaletteProps {
  user?: {
    roles?: string[];
  } | null;
  onLogout?: () => void;
  onRefreshSession?: () => void;
}

// Helper function to safely get translation with fallback to English
function safeTranslate(t: (key: string) => string, key: string): string {
  const translated = t(key);

  // If translation key is returned as-is, it means translation is missing
  if (translated === key || translated.startsWith('nav.') || translated.startsWith('admin.')) {
    // Mapping of common translation keys to English fallbacks
    const fallbackMap: Record<string, string> = {
      'navigation': 'Navigation',
      'actions': 'Actions',
      'admin': 'Admin',
      'nav.dashboard': 'Dashboard',
      'nav.dashboard.description': 'Overview and statistics',
      'nav.home': 'Home',
      'nav.documents.name': 'Documents',
      'nav.documents.shortName': 'Docs',
      'nav.documents.description': 'Browse and search documents',
      'nav.documents.browse': 'Browse',
      'nav.documents.allDocuments': 'All Documents',
      'nav.documents.recent': 'Recent',
      'nav.documents.favorites': 'Favorites',
      'nav.documents.actions': 'Actions',
      'nav.documents.myActivity': 'My Activity',
      'nav.documents.requestAccess': 'Request Access',
      'nav.upload.name': 'Upload',
      'nav.upload.shortName': 'Upload',
      'nav.upload.description': 'Upload new documents',
      'nav.policyTools.name': 'Policy Tools',
      'nav.policyTools.shortName': 'Policies',
      'nav.policyTools.description': 'Manage OPA policies',
      'nav.policyTools.explore': 'Explore',
      'nav.policyTools.policyLibrary': 'Policy Library',
      'nav.policyTools.policySandbox': 'Policy Sandbox',
      'nav.policyTools.sandboxWorkspaces': 'Sandbox Workspaces',
      'nav.policyTools.builder': 'Builder',
      'nav.policyTools.myPolicies': 'My Policies',
      'nav.policyTools.test': 'Test',
      'nav.policyTools.reference': 'Reference',
      'nav.compliance.name': 'Compliance',
      'nav.compliance.shortName': 'Compliance',
      'nav.compliance.description': 'Security and compliance',
      'nav.compliance.standards': 'Standards',
      'nav.compliance.standardsCompliance': 'Standards Compliance',
      'nav.compliance.security': 'Security',
      'nav.compliance.kas': 'KAS Configuration',
      'nav.compliance.cois': 'Communities of Interest',
      'nav.compliance.pki': 'X.509 PKI',
      'nav.compliance.classifications': 'Classifications',
    };

    if (fallbackMap[key]) {
      return fallbackMap[key];
    }

    // Last resort: humanize the key
    const parts = key.split('.');
    const lastPart = parts[parts.length - 1];
    return lastPart
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }

  return translated;
}

export function CommandPalette({ user, onLogout, onRefreshSession }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { t } = useTranslation('nav');

  // Toggle command palette with Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Handle navigation
  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  // Check if user is admin
  const isAdmin = user?.roles?.includes('admin');

  // Get recent items and bookmarks
  const recentItems = typeof window !== 'undefined' ? getRecentItems() : [];
  const bookmarks = typeof window !== 'undefined' ? getBookmarks() : [];

  return (
    <>
      {/* Compact Search Button - Matches nav item styling */}
      <button
        onClick={() => setOpen(true)}
        className={`group relative px-3 py-2 rounded-xl transition-all duration-300
                   hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100/50
                   focus:outline-none focus:ring-2 focus:ring-[#4497ac]/50 focus:ring-offset-2`}
        aria-label="Search (⌘K)"
        title="Search everything (⌘K)"
      >
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-gray-600 group-hover:text-[#4497ac] transition-colors" strokeWidth={2.5} />
          <span className="hidden xl:inline text-sm font-bold text-gray-700 group-hover:text-gray-900">
            Search
          </span>
          <kbd className={`hidden xl:inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-gray-500
                          bg-gray-100 border border-gray-200 rounded shadow-sm`}>
            ⌘K
          </kbd>
        </div>
      </button>

      {/* Command Dialog - Using Radix UI Dialog with Command components */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          {/* Backdrop */}
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

          {/* Command Palette Container */}
          <Dialog.Content
            className={`fixed left-[50%] top-[20%] z-50 w-full max-w-2xl translate-x-[-50%]
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                       data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
                       data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]
                       data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]`}
          >
            {/* Visually Hidden Title for Screen Readers */}
            <VisuallyHidden.Root asChild>
              <Dialog.Title>Search Command Menu</Dialog.Title>
            </VisuallyHidden.Root>

            <Dialog.Description className="sr-only">
              Search and navigate through the application using keyboard shortcuts
            </Dialog.Description>

            {/* Command Component */}
            <Command className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
                <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Type a command or search..."
                  className={`w-full px-4 py-4 text-base bg-transparent border-0 outline-none
                             text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus:outline-none`}
                />
                <kbd className={`hidden sm:inline-block px-2 py-1 text-xs font-semibold text-gray-500
                              bg-gray-100 dark:bg-gray-800 rounded`}>
                  ESC
                </kbd>
              </div>

              {/* Command List */}
              <Command.List className="max-h-96 overflow-y-auto p-2">
              <Command.Empty className="py-12 text-center text-sm text-gray-500">
                No results found.
              </Command.Empty>

              {/* Recent Items */}
              {recentItems.length > 0 && (
                <Command.Group
                  heading="Recent"
                  className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
                >
                  {recentItems.slice(0, 5).map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`recent-${item.title}`}
                      onSelect={() => handleSelect(() => {
                        const path = item.type === 'document' ? `/resources/${item.id}` : `/policies/${item.id}`;
                        router.push(path);
                      })}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                 data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                                 transition-colors`}
                    >
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {item.title}
                        </div>
                        {item.classification && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.classification}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Bookmarks */}
              {bookmarks.length > 0 && (
                <Command.Group
                  heading="Bookmarks"
                  className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
                >
                  {bookmarks.slice(0, 5).map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`bookmark-${item.title}`}
                      onSelect={() => handleSelect(() => {
                        const path = item.type === 'document' ? `/resources/${item.id}` : `/policies/${item.id}`;
                        router.push(path);
                      })}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                 data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                                 transition-colors`}
                    >
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {item.title}
                        </div>
                        {item.classification && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.classification}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Navigation */}
              <Command.Group
                heading={safeTranslate(t, 'navigation') || 'Navigation'}
                className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const itemName = safeTranslate(t, item.name);
                  const itemDesc = safeTranslate(t, item.description);

                  return (
                    <Command.Item
                      key={item.href}
                      value={`nav-${itemName}`}
                      keywords={[itemName, itemDesc]}
                      onSelect={() => handleSelect(() => router.push(item.href))}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                 data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                                 transition-colors`}
                    >
                      <Icon className="h-4 w-4 text-gray-400" />
                      <div className="flex-1">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {itemName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {itemDesc}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Command.Item>
                  );
                })}
                {/* Add mega menu sub-items */}
                {navItems.flatMap(item =>
                  item.megaMenuItems?.flatMap(category =>
                    category.items.map(subItem => {
                      const Icon = subItem.icon;
                      const subItemName = safeTranslate(t, subItem.name);
                      const parentName = safeTranslate(t, item.name);
                      const categoryName = safeTranslate(t, category.category);

                      return (
                        <Command.Item
                          key={subItem.href}
                          value={`nav-${subItemName}`}
                          keywords={[subItemName, parentName, categoryName]}
                          onSelect={() => handleSelect(() => router.push(subItem.href))}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                     data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                                     transition-colors`}
                        >
                          <Icon className="h-4 w-4 text-gray-400" />
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                              {subItemName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {parentName} → {categoryName}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </Command.Item>
                      );
                    })
                  ) || []
                )}
              </Command.Group>

              {/* Admin (if admin user) */}
              {isAdmin && (
                <Command.Group
                  heading={safeTranslate(t, 'admin') || 'Admin'}
                  className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
                >
                  {adminItems.map((item) => {
                    const Icon = item.icon;
                    const itemName = safeTranslate(t, item.name);
                    const itemDesc = safeTranslate(t, item.description);

                    return (
                      <Command.Item
                        key={item.href}
                        value={`admin-${itemName}`}
                        keywords={[itemName, itemDesc]}
                        onSelect={() => handleSelect(() => router.push(item.href))}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                                   data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                                   transition-colors`}
                      >
                        <Icon className="h-4 w-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {itemName}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {itemDesc}
                          </div>
                        </div>
                        {item.badge && (
                          <span className={`px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800
                                         dark:bg-red-900 dark:text-red-200 rounded-full`}>
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* Actions */}
              <Command.Group
                heading={safeTranslate(t, 'actions') || 'Actions'}
                className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
              >
                {onRefreshSession && (
                  <Command.Item
                    value="action-refresh"
                    onSelect={() => handleSelect(() => onRefreshSession())}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                               data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-800
                               transition-colors`}
                  >
                    <RefreshCw className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      Refresh Session
                    </span>
                  </Command.Item>
                )}
                {onLogout && (
                  <Command.Item
                    value="action-logout"
                    onSelect={() => handleSelect(() => onLogout())}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                               data-[selected=true]:bg-red-50 dark:data-[selected=true]:bg-red-900/20
                               transition-colors`}
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">
                      Logout
                    </span>
                  </Command.Item>
                )}
              </Command.Group>
              </Command.List>

              {/* Footer hint */}
              <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↑</kbd>
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↓</kbd>
                      <span className="ml-1">to navigate</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↵</kbd>
                      <span className="ml-1">to select</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">ESC</kbd>
                      <span className="ml-1">to close</span>
                    </div>
                  </div>
                </div>
              </div>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
