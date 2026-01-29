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
    // Set manual override with timestamp to prevent automatic locale detection from overriding user choice
    localStorage.setItem('dive-v3-locale-override', 'true');
    localStorage.setItem('dive-v3-locale-override-time', Date.now().toString());
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
      {/* Trigger Button - Compact with just flag */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="
          flex items-center gap-1.5 px-2 py-1.5 rounded-lg
          bg-white border border-gray-300
          hover:bg-gray-50 hover:border-gray-400
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors duration-200
        "
        aria-label="Select Language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={localeNames[locale]}
      >
        <span className="text-base" role="img" aria-label={localeNames[locale]}>
          {localeFlags[locale]}
        </span>
        <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu - Compact grid of flags */}
      {isOpen && (
        <div
          className="
            absolute right-0 mt-2 w-[280px]
            bg-white border border-gray-300 rounded-lg shadow-lg
            z-50
            p-2
            max-h-96 overflow-y-auto
          "
          role="listbox"
          aria-label="Language options"
        >
          <div className="grid grid-cols-7 gap-1">
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => handleLocaleChange(loc)}
                className={`
                  relative p-2 rounded-md
                  hover:bg-blue-50 transition-colors
                  ${locale === loc ? 'bg-blue-100 ring-2 ring-blue-500' : ''}
                `}
                role="option"
                aria-selected={locale === loc}
                title={localeNames[loc]}
              >
                <span className="text-2xl" role="img" aria-label={localeNames[loc]}>
                  {localeFlags[loc]}
                </span>
                {locale === loc && (
                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-600 rounded-full flex items-center justify-center">
                    <Check className="w-2 h-2 text-white" aria-hidden="true" strokeWidth={3} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
