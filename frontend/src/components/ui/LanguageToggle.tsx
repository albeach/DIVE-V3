/**
 * Language Toggle Component
 * 
 * Flag-based language switcher with:
 * - Flag icons for each language
 * - Dropdown for 3+ languages
 * - Persistent preference (localStorage)
 * - Smooth transitions
 * - Real-time updates via global context
 * 
 * Phase 4.7: Language Toggle Component
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useLocale } from '@/contexts/LocaleContext';
import { locales, Locale, localeNames, localeFlags } from '@/i18n/config';

// ============================================
// Component
// ============================================

export default function LanguageToggle() {
    const { locale, changeLocale } = useLocale(); // Use global context
    const [isOpen, setIsOpen] = useState(false);

    const handleChangeLocale = (newLocale: Locale) => {
        changeLocale(newLocale);
        setIsOpen(false);
    };

    // Simple toggle for 2 languages
    if (locales.length === 2) {
        const otherLocale = locales.find(l => l !== locale)!;

        return (
            <button
                onClick={() => handleChangeLocale(otherLocale)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title={`Switch to ${localeNames[otherLocale]}`}
            >
                <span className="text-lg">{localeFlags[locale]}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
                    {localeNames[locale]}
                </span>
                <span className="text-xs text-gray-400">↔</span>
                <span className="text-lg">{localeFlags[otherLocale]}</span>
            </button>
        );
    }

    // Dropdown for 3+ languages
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                <span className="text-lg">{localeFlags[locale]}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
                    {localeNames[locale]}
                </span>
                <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown Menu */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl z-20 overflow-hidden"
                        >
                            {locales.map((loc) => (
                                <button
                                    key={loc}
                                    onClick={() => handleChangeLocale(loc)}
                                    className={`
                                        w-full flex items-center justify-between px-4 py-2.5 transition-colors
                                        ${locale === loc
                                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg">{localeFlags[loc]}</span>
                                        <span className="text-sm font-medium">{localeNames[loc]}</span>
                                    </div>
                                    {locale === loc && (
                                        <CheckIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

