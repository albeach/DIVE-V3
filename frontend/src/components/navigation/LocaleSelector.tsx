'use client';

/**
 * LocaleSelector Component
 *
 * Allows users to switch between available languages in real-time.
 * Persists selection to localStorage and triggers global locale change.
 *
 * Features:
 * - Dropdown with all supported languages
 * - Flag emoji + language name display
 * - Real-time UI updates on selection
 * - Accessible keyboard navigation
 * - Persistent across sessions
 *
 * @version 1.0.0
 * @date 2026-01-16
 */

import { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';

export function LocaleSelector() {
  const { locale, changeLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle locale change
  const handleLocaleChange = (newLocale: Locale) => {
    changeLocale(newLocale);
    setIsOpen(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-white border border-gray-300
          hover:bg-gray-50 hover:border-gray-400
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors duration-200
          text-sm font-medium text-gray-700
        "
        aria-label="Select Language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4 text-gray-600" />
        <span className="text-lg" role="img" aria-label={localeNames[locale]}>
          {localeFlags[locale]}
        </span>
        <span className="hidden sm:inline">{localeNames[locale]}</span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="
            absolute right-0 mt-2 w-56
            bg-white border border-gray-300 rounded-lg shadow-lg
            z-50
            max-h-96 overflow-y-auto
          "
          role="listbox"
          aria-label="Language options"
        >
          {locales.map((loc) => (
            <button
              key={loc}
              onClick={() => handleLocaleChange(loc)}
              className={`
                w-full flex items-center gap-3 px-4 py-3
                hover:bg-blue-50 transition-colors
                text-left
                ${locale === loc ? 'bg-blue-50' : ''}
              `}
              role="option"
              aria-selected={locale === loc}
            >
              <span className="text-2xl" role="img" aria-label={localeNames[loc]}>
                {localeFlags[loc]}
              </span>
              <span className="flex-1 font-medium text-gray-900">
                {localeNames[loc]}
              </span>
              {locale === loc && (
                <Check className="w-5 h-5 text-blue-600" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
