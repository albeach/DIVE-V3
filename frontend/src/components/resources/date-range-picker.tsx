/**
 * Date Range Picker Component - 2026 Modal Design
 *
 * Modern modal-based date range selection with:
 * - Full-screen modal for complex date selection
 * - Calendar grid with locale-aware formatting
 * - Quick preset buttons for common ranges
 * - Visual feedback for selection states
 * - Mobile-responsive design
 * - Accessibility features (WCAG 2.1 AA)
 * - Headless UI Dialog for proper modal behavior
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';
import { Dialog } from '@headlessui/react';
import { motion } from 'framer-motion';
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface DateRange {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string; // ISO date string (YYYY-MM-DD)
}

interface DateRangePickerProps {
  value?: DateRange | null;
  onChange: (range: DateRange | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// ============================================
// Component
// ============================================

export default function DateRangePicker({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
}: DateRangePickerProps) {
  const { t } = useTranslation('resources');
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionMode, setSelectionMode] = useState<'start' | 'end'>('start');
  const [tempRange, setTempRange] = useState<DateRange | null>(value || null);

  // ============================================
  // Localization Helpers
  // ============================================

  const localizedMonths = useMemo(() => {
    const date = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      date.setMonth(i);
      return date.toLocaleDateString(locale, { month: 'long' });
    });
  }, [locale]);

  const localizedDaysOfWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay()); // Start of week
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(date);
      day.setDate(date.getDate() + i);
      return day.toLocaleDateString(locale, { weekday: 'short' });
    });
  }, [locale]);

  // ============================================
  // Quick Presets
  // ============================================

  const getQuickPresets = useCallback(() => [
    {
      label: t('dateRange.today'),
      range: {
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    },
    {
      label: t('dateRange.last7Days'),
      range: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    },
    {
      label: t('dateRange.last30Days'),
      range: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      }
    },
    {
      label: t('dateRange.thisMonth'),
      range: {
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
      }
    },
    {
      label: t('dateRange.lastMonth'),
      range: {
        start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0],
        end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
      }
    }
  ], [t]);

  // ============================================
  // Calendar Logic
  // ============================================

  const getDaysInMonth = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, []);

  const isDateInRange = useCallback((date: Date, range: DateRange | null) => {
    if (!range) return false;
    const dateStr = date.toISOString().split('T')[0];
    return dateStr >= range.start && dateStr <= range.end;
  }, []);

  const isDateSelected = useCallback((date: Date, range: DateRange | null) => {
    if (!range) return false;
    const dateStr = date.toISOString().split('T')[0];
    return dateStr === range.start || dateStr === range.end;
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0];

    if (!tempRange || selectionMode === 'start') {
      // Start new selection
      setTempRange({ start: dateStr, end: dateStr });
      setSelectionMode('end');
    } else {
      // Complete selection
      const newRange = {
        start: tempRange.start <= dateStr ? tempRange.start : dateStr,
        end: tempRange.start <= dateStr ? dateStr : tempRange.start
      };
      setTempRange(newRange);
      setSelectionMode('start');
    }
  }, [tempRange, selectionMode]);

  const handlePresetClick = useCallback((preset: { range: DateRange }) => {
    setTempRange(preset.range);
    setSelectionMode('start');
  }, []);

  const handleApply = useCallback(() => {
    onChange(tempRange);
    setIsOpen(false);
  }, [tempRange, onChange]);

  const handleClear = useCallback(() => {
    setTempRange(null);
    setSelectionMode('start');
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  const formatDateForDisplay = useCallback((dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, [locale]);

  const displayValue = useMemo(() => {
    if (!value) return placeholder || t('dateRange.placeholder');
    if (value.start === value.end) {
      return formatDateForDisplay(value.start);
    }
    return `${formatDateForDisplay(value.start)} - ${formatDateForDisplay(value.end)}`;
  }, [value, placeholder, t, formatDateForDisplay]);

  // ============================================
  // Render
  // ============================================

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className={`flex items-center gap-3 px-4 py-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <Calendar className="w-5 h-5 text-gray-400" />
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
          {displayValue}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
      </button>

      {/* Modal Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="relative z-50"
      >
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Modal Content */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('dateRange.creationDate')}
                </Dialog.Title>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Quick Presets */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    {t('dateRange.quickSelect')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {getQuickPresets().map((preset, index) => (
                      <button
                        key={index}
                        onClick={() => handlePresetClick(preset)}
                        className="px-3 py-2 text-sm text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calendar */}
                <div className="mb-6">
                  {/* Month Navigation */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {localizedMonths[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                    </h2>
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Days of Week */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {localizedDaysOfWeek.map((day, index) => (
                      <div key={index} className="p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(currentMonth).map((date, index) => (
                      <button
                        key={index}
                        onClick={() => date && handleDateClick(date)}
                        disabled={!date}
                        className={`
                          p-3 text-sm rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800
                          ${date ? 'cursor-pointer' : 'cursor-default'}
                          ${date && isDateInRange(date, tempRange) ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : ''}
                          ${date && isDateSelected(date, tempRange) ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                        `}
                      >
                        {date ? date.getDate() : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selection Instructions */}
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  {selectionMode === 'start' ? t('dateRange.clickToStart') : t('dateRange.clickToComplete')}
                </div>

                {/* Current Selection */}
                {tempRange && (
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>{t('dateRange.creationDate')}:</strong> {formatDateForDisplay(tempRange.start)}
                      {tempRange.start !== tempRange.end && ` - ${formatDateForDisplay(tempRange.end)}`}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleClear}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {t('filters.clearAll')}
                </button>
                <button
                  onClick={handleApply}
                  disabled={!tempRange}
                  className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {t('bulkActions.selectAll')}
                </button>
              </div>
            </motion.div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}