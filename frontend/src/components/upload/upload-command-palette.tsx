/**
 * Upload Command Palette - 2026 Modern UX
 *
 * Uses cmdk library for VS Code-style command palette:
 * - Set Classification → Quick classification picker
 * - Add Country → Search and add countries
 * - Select COI → Quick COI picker
 * - Quick Presets → My Country Only, FVEY, All NATO
 * - Upload File → Trigger file picker
 * - Clear Form → Reset all fields
 * - View Preview → Jump to preview section
 *
 * Keyboard shortcuts:
 * - Cmd/Ctrl + K → Open palette
 * - Cmd/Ctrl + U → Upload file
 * - Cmd/Ctrl + Shift + C → Clear form
 * - Cmd/Ctrl + P → View preview
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Shield,
  Globe,
  Users,
  Upload,
  Trash2,
  Eye,
  Keyboard,
  ChevronRight,
  Search,
  X,
  Check,
  FileText,
  Settings,
  Zap,
} from 'lucide-react';

// Country data
const COUNTRIES = [
  { code: 'USA', name: 'United States', flag: '🇺🇸', region: 'FVEY' },
  { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧', region: 'FVEY' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', region: 'FVEY' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', region: 'FVEY' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', region: 'FVEY' },
  { code: 'FRA', name: 'France', flag: '🇫🇷', region: 'NATO' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪', region: 'NATO' },
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', region: 'NATO' },
  { code: 'ITA', name: 'Italy', flag: '🇮🇹', region: 'NATO' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱', region: 'NATO' },
];

// Classification levels
const CLASSIFICATIONS = [
  { value: 'UNCLASSIFIED', label: 'Unclassified', color: 'text-green-600', icon: '🟢' },
  { value: 'RESTRICTED', label: 'Restricted', color: 'text-blue-600', icon: '🔵' },
  { value: 'CONFIDENTIAL', label: 'Confidential', color: 'text-yellow-600', icon: '🟡' },
  { value: 'SECRET', label: 'Secret', color: 'text-orange-600', icon: '🟠' },
  { value: 'TOP_SECRET', label: 'Top Secret', color: 'text-red-600', icon: '🔴' },
];

interface UploadCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  // Form actions
  onSelectFile: () => void;
  onSetClassification: (value: string) => void;
  onToggleCountry: (country: string) => void;
  onSelectPreset: (preset: 'user' | 'fvey' | 'nato') => void;
  onClearForm: () => void;
  onViewPreview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  // Current state
  currentClassification: string;
  selectedCountries: string[];
  userCountry: string;
  userClearance: string;
  canUndo: boolean;
  canRedo: boolean;
}

type CommandPage = 'home' | 'classification' | 'countries' | 'presets';

export default function UploadCommandPalette({
  isOpen,
  onClose,
  onSelectFile,
  onSetClassification,
  onToggleCountry,
  onSelectPreset,
  onClearForm,
  onViewPreview,
  onUndo,
  onRedo,
  currentClassification,
  selectedCountries,
  userCountry,
  userClearance,
  canUndo,
  canRedo,
}: UploadCommandPaletteProps) {
  const [page, setPage] = useState<CommandPage>('home');
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setPage('home');
      setSearch('');
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (page !== 'home') {
          setPage('home');
          setSearch('');
        } else {
          onClose();
        }
      }
      if (e.key === 'Backspace' && !search && page !== 'home') {
        setPage('home');
      }
    },
    [page, search, onClose]
  );

  // Check if classification is allowed
  const isClassificationAllowed = (level: string): boolean => {
    const hierarchy: Record<string, number> = {
      UNCLASSIFIED: 0,
      RESTRICTED: 1,
      CONFIDENTIAL: 2,
      SECRET: 3,
      TOP_SECRET: 4,
    };
    return hierarchy[level] <= hierarchy[userClearance];
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50"
          >
            <Command
              className={cn(
                'bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden',
                'border border-gray-200 dark:border-gray-700'
              )}
              onKeyDown={handleKeyDown}
              loop
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                {page !== 'home' && (
                  <button
                    onClick={() => {
                      setPage('home');
                      setSearch('');
                    }}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Back to home"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180 text-gray-400" />
                  </button>
                )}
                <Search className="w-4 h-4 text-gray-400" />
                <Command.Input
                  ref={inputRef}
                  value={search}
                  onValueChange={setSearch}
                  placeholder={
                    page === 'home'
                      ? 'Type a command or search...'
                      : page === 'classification'
                      ? 'Search classifications...'
                      : page === 'countries'
                      ? 'Search countries...'
                      : 'Search presets...'
                  }
                  className={cn(
                    'flex-1 bg-transparent border-none outline-none',
                    'text-sm text-gray-900 dark:text-gray-100',
                    'placeholder:text-gray-400 dark:placeholder:text-gray-500'
                  )}
                />
                <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-gray-500 font-mono">
                  ESC
                </kbd>
              </div>

              {/* Command List */}
              <Command.List className="max-h-[300px] overflow-y-auto py-2">
                <Command.Empty className="py-6 text-center text-sm text-gray-500">
                  No results found.
                </Command.Empty>

                {/* Home Page */}
                {page === 'home' && (
                  <>
                    {/* Quick Actions */}
                    <Command.Group heading="Quick Actions">
                      <Command.Item
                        value="upload-file"
                        onSelect={() => {
                          onSelectFile();
                          onClose();
                        }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Upload className="w-4 h-4 text-blue-500" />
                        <span className="flex-1">Upload File</span>
                        <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                          ⌘U
                        </kbd>
                      </Command.Item>

                      <Command.Item
                        value="view-preview"
                        onSelect={() => {
                          onViewPreview();
                          onClose();
                        }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Eye className="w-4 h-4 text-purple-500" />
                        <span className="flex-1">View Preview</span>
                        <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                          ⌘P
                        </kbd>
                      </Command.Item>

                      <Command.Item
                        value="clear-form"
                        onSelect={() => {
                          onClearForm();
                          onClose();
                        }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                        <span className="flex-1">Clear Form</span>
                        <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                          ⌘⇧C
                        </kbd>
                      </Command.Item>
                    </Command.Group>

                    {/* Classification */}
                    <Command.Group heading="Security">
                      <Command.Item
                        value="set-classification"
                        onSelect={() => setPage('classification')}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Shield className="w-4 h-4 text-orange-500" />
                        <span className="flex-1">Set Classification</span>
                        <span className="text-xs text-gray-400">{currentClassification}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </Command.Item>

                      <Command.Item
                        value="add-countries"
                        onSelect={() => setPage('countries')}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Globe className="w-4 h-4 text-green-500" />
                        <span className="flex-1">Add Countries</span>
                        <span className="text-xs text-gray-400">
                          {selectedCountries.length} selected
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </Command.Item>

                      <Command.Item
                        value="quick-presets"
                        onSelect={() => setPage('presets')}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <Zap className="w-4 h-4 text-yellow-500" />
                        <span className="flex-1">Quick Presets</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </Command.Item>
                    </Command.Group>

                    {/* History */}
                    <Command.Group heading="History">
                      <Command.Item
                        value="undo"
                        disabled={!canUndo}
                        onSelect={() => {
                          if (canUndo) {
                            onUndo();
                            onClose();
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          !canUndo && 'opacity-50 cursor-not-allowed',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <span className="w-4 h-4 text-center">↩</span>
                        <span className="flex-1">Undo</span>
                        <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                          ⌘Z
                        </kbd>
                      </Command.Item>

                      <Command.Item
                        value="redo"
                        disabled={!canRedo}
                        onSelect={() => {
                          if (canRedo) {
                            onRedo();
                            onClose();
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 cursor-pointer',
                          'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                          !canRedo && 'opacity-50 cursor-not-allowed',
                          'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <span className="w-4 h-4 text-center">↪</span>
                        <span className="flex-1">Redo</span>
                        <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono">
                          ⌘⇧Z
                        </kbd>
                      </Command.Item>
                    </Command.Group>
                  </>
                )}

                {/* Classification Page */}
                {page === 'classification' && (
                  <Command.Group heading="Select Classification">
                    {CLASSIFICATIONS.map((cls) => {
                      const allowed = isClassificationAllowed(cls.value);
                      const selected = currentClassification === cls.value;

                      return (
                        <Command.Item
                          key={cls.value}
                          value={cls.value}
                          disabled={!allowed}
                          onSelect={() => {
                            if (allowed) {
                              onSetClassification(cls.value);
                              setPage('home');
                              setSearch('');
                            }
                          }}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2 cursor-pointer',
                            'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                            !allowed && 'opacity-50 cursor-not-allowed',
                            'text-gray-700 dark:text-gray-300'
                          )}
                        >
                          <span className="text-lg">{cls.icon}</span>
                          <span className={cn('flex-1 font-medium', cls.color)}>{cls.label}</span>
                          {selected && <Check className="w-4 h-4 text-green-500" />}
                          {!allowed && (
                            <span className="text-xs text-gray-400">Above clearance</span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* Countries Page */}
                {page === 'countries' && (
                  <Command.Group heading="Toggle Countries">
                    {COUNTRIES.map((country) => {
                      const selected = selectedCountries.includes(country.code);
                      const isUser = country.code === userCountry;

                      return (
                        <Command.Item
                          key={country.code}
                          value={`${country.code} ${country.name}`}
                          onSelect={() => {
                            onToggleCountry(country.code);
                          }}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2 cursor-pointer',
                            'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                            'text-gray-700 dark:text-gray-300'
                          )}
                        >
                          <span className="text-lg">{country.flag}</span>
                          <span className="flex-1">
                            {country.name}
                            {isUser && (
                              <span className="ml-2 text-xs text-green-500 font-medium">
                                (You)
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded',
                              country.region === 'FVEY'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600'
                            )}
                          >
                            {country.region}
                          </span>
                          {selected && <Check className="w-4 h-4 text-green-500" />}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* Presets Page */}
                {page === 'presets' && (
                  <Command.Group heading="Quick Presets">
                    <Command.Item
                      value="my-country-only"
                      onSelect={() => {
                        onSelectPreset('user');
                        setPage('home');
                        setSearch('');
                        onClose();
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 cursor-pointer',
                        'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                        'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="text-lg">
                        {COUNTRIES.find((c) => c.code === userCountry)?.flag || '🏳️'}
                      </span>
                      <span className="flex-1">My Country Only ({userCountry})</span>
                    </Command.Item>

                    <Command.Item
                      value="fvey"
                      onSelect={() => {
                        onSelectPreset('fvey');
                        setPage('home');
                        setSearch('');
                        onClose();
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 cursor-pointer',
                        'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                        'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="text-lg">👁️</span>
                      <span className="flex-1">FVEY (5 Countries)</span>
                      <span className="text-xs text-gray-400">USA, GBR, CAN, AUS, NZL</span>
                    </Command.Item>

                    <Command.Item
                      value="all-nato"
                      onSelect={() => {
                        onSelectPreset('nato');
                        setPage('home');
                        setSearch('');
                        onClose();
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 cursor-pointer',
                        'data-[selected=true]:bg-blue-50 dark:data-[selected=true]:bg-blue-900/20',
                        'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="text-lg">🌐</span>
                      <span className="flex-1">All NATO (10 Countries)</span>
                    </Command.Item>
                  </Command.Group>
                )}
              </Command.List>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↑</kbd>
                      <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↓</kbd>
                      navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↵</kbd>
                      select
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">esc</kbd>
                      close
                    </span>
                  </div>
                  <span className="text-gray-500">DIVE V3 Upload</span>
                </div>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook for keyboard shortcuts
export function useUploadKeyboardShortcuts({
  onOpenPalette,
  onUploadFile,
  onClearForm,
  onViewPreview,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  disabled = false,
}: {
  onOpenPalette: () => void;
  onUploadFile: () => void;
  onClearForm: () => void;
  onViewPreview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K → Open palette
      if (cmdKey && e.key === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // Cmd/Ctrl + U → Upload file
      if (cmdKey && e.key === 'u') {
        e.preventDefault();
        onUploadFile();
        return;
      }

      // Cmd/Ctrl + Shift + C → Clear form
      if (cmdKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onClearForm();
        return;
      }

      // Cmd/Ctrl + P → View preview
      if (cmdKey && e.key === 'p') {
        e.preventDefault();
        onViewPreview();
        return;
      }

      // Cmd/Ctrl + Z → Undo
      if (cmdKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canUndo) onUndo();
        return;
      }

      // Cmd/Ctrl + Shift + Z → Redo
      if (cmdKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canRedo) onRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    disabled,
    onOpenPalette,
    onUploadFile,
    onClearForm,
    onViewPreview,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  ]);
}
