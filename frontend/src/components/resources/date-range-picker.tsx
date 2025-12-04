/**
 * Date Range Picker Component (2025)
 * 
 * Phase 2 Deferred: Date Range Filtering
 * Calendar-based date range selection for resource filtering
 * 
 * Features:
 * - Visual calendar selection
 * - Quick presets (Today, Last 7 days, Last 30 days, etc.)
 * - Custom date range
 * - Keyboard navigation
 * - Mobile-friendly
 */

'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';

// ============================================
// Types
// ============================================

export interface DateRange {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string;   // ISO date string (YYYY-MM-DD)
}

interface DateRangePickerProps {
  /** Current date range value */
  value?: DateRange;
  /** Callback when date range changes */
  onChange: (range: DateRange | undefined) => void;
  /** Minimum selectable date */
  minDate?: string;
  /** Maximum selectable date */
  maxDate?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isDisabled: boolean;
}

// ============================================
// Constants
// ============================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface QuickPreset {
  label: string;
  getValue: () => DateRange;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Today',
    getValue: () => {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    },
  },
  {
    label: 'Yesterday',
    getValue: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      return { start: dateStr, end: dateStr };
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Last 30 days',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Last 90 days',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'This month',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Last month',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'This year',
    getValue: () => {
      const now = new Date();
      return {
        start: `${now.getFullYear()}-01-01`,
        end: now.toISOString().split('T')[0],
      };
    },
  },
];

// ============================================
// Utility Functions
// ============================================

function formatDateForDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getCalendarDays(
  year: number,
  month: number,
  selectedRange: DateRange | undefined,
  minDate?: string,
  maxDate?: string
): CalendarDay[] {
  const days: CalendarDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay();
  
  // Add days from previous month
  const prevMonth = new Date(year, month, 0);
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonth.getDate() - i);
    days.push(createCalendarDay(date, month, today, selectedRange, minDate, maxDate));
  }
  
  // Add days of current month
  for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
    const date = new Date(year, month, day);
    days.push(createCalendarDay(date, month, today, selectedRange, minDate, maxDate));
  }
  
  // Add days from next month to complete the grid
  const remainingDays = 42 - days.length; // 6 rows * 7 days
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day);
    days.push(createCalendarDay(date, month, today, selectedRange, minDate, maxDate));
  }
  
  return days;
}

function createCalendarDay(
  date: Date,
  currentMonth: number,
  today: Date,
  selectedRange: DateRange | undefined,
  minDate?: string,
  maxDate?: string
): CalendarDay {
  const dateStr = date.toISOString().split('T')[0];
  const isCurrentMonth = date.getMonth() === currentMonth;
  const isToday = date.getTime() === today.getTime();
  
  let isSelected = false;
  let isInRange = false;
  let isRangeStart = false;
  let isRangeEnd = false;
  
  if (selectedRange) {
    const startDate = new Date(selectedRange.start + 'T00:00:00');
    const endDate = new Date(selectedRange.end + 'T00:00:00');
    
    isRangeStart = dateStr === selectedRange.start;
    isRangeEnd = dateStr === selectedRange.end;
    isSelected = isRangeStart || isRangeEnd;
    isInRange = date >= startDate && date <= endDate;
  }
  
  let isDisabled = false;
  if (minDate && dateStr < minDate) isDisabled = true;
  if (maxDate && dateStr > maxDate) isDisabled = true;
  
  return {
    date,
    dayOfMonth: date.getDate(),
    isCurrentMonth,
    isToday,
    isSelected,
    isInRange,
    isRangeStart,
    isRangeEnd,
    isDisabled,
  };
}

// ============================================
// Calendar Component
// ============================================

interface CalendarGridProps {
  year: number;
  month: number;
  selectedRange: DateRange | undefined;
  selectionStart: string | null;
  onSelectDate: (dateStr: string) => void;
  onNavigateMonth: (direction: 'prev' | 'next') => void;
  minDate?: string;
  maxDate?: string;
}

function CalendarGrid({
  year,
  month,
  selectedRange,
  selectionStart,
  onSelectDate,
  onNavigateMonth,
  minDate,
  maxDate,
}: CalendarGridProps) {
  const days = useMemo(
    () => getCalendarDays(year, month, selectedRange, minDate, maxDate),
    [year, month, selectedRange, minDate, maxDate]
  );
  
  return (
    <div className="p-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onNavigateMonth('prev')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={() => onNavigateMonth('next')}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
      
      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(day => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-1"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Days Grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dateStr = day.date.toISOString().split('T')[0];
          
          return (
            <button
              key={idx}
              onClick={() => !day.isDisabled && onSelectDate(dateStr)}
              disabled={day.isDisabled}
              className={`
                relative p-2 text-sm text-center transition-all
                ${!day.isCurrentMonth ? 'text-gray-300 dark:text-gray-600' : ''}
                ${day.isToday && !day.isSelected ? 'font-bold text-blue-600 dark:text-blue-400' : ''}
                ${day.isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'}
                ${day.isInRange && !day.isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                ${day.isSelected ? 'bg-blue-600 text-white font-semibold' : ''}
                ${day.isRangeStart ? 'rounded-l-lg' : ''}
                ${day.isRangeEnd ? 'rounded-r-lg' : ''}
                ${day.isSelected && day.isRangeStart && day.isRangeEnd ? 'rounded-lg' : ''}
              `}
            >
              {day.dayOfMonth}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function DateRangePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date range',
  disabled = false,
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value?.start) {
      const d = new Date(value.start + 'T00:00:00');
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectionStart(null);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  // Handle date selection
  const handleSelectDate = useCallback((dateStr: string) => {
    if (!selectionStart) {
      // First click - start selection
      setSelectionStart(dateStr);
      onChange({ start: dateStr, end: dateStr });
    } else {
      // Second click - complete selection
      const start = selectionStart < dateStr ? selectionStart : dateStr;
      const end = selectionStart < dateStr ? dateStr : selectionStart;
      onChange({ start, end });
      setSelectionStart(null);
      setIsOpen(false);
    }
  }, [selectionStart, onChange]);
  
  // Handle preset selection
  const handlePresetSelect = useCallback((preset: QuickPreset) => {
    const range = preset.getValue();
    onChange(range);
    setSelectionStart(null);
    setIsOpen(false);
  }, [onChange]);
  
  // Navigate months
  const handleNavigateMonth = useCallback((direction: 'prev' | 'next') => {
    setViewDate(prev => {
      let { year, month } = prev;
      if (direction === 'prev') {
        month--;
        if (month < 0) {
          month = 11;
          year--;
        }
      } else {
        month++;
        if (month > 11) {
          month = 0;
          year++;
        }
      }
      return { year, month };
    });
  }, []);
  
  // Clear selection
  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setSelectionStart(null);
  }, [onChange]);
  
  // Display value
  const displayValue = useMemo(() => {
    if (!value) return placeholder;
    if (value.start === value.end) {
      return formatDateForDisplay(value.start);
    }
    return `${formatDateForDisplay(value.start)} - ${formatDateForDisplay(value.end)}`;
  }, [value, placeholder]);
  
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2.5 
          bg-white dark:bg-gray-800 border-2 rounded-lg text-left
          transition-all text-sm
          ${disabled 
            ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700' 
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 cursor-pointer'
          }
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className={`truncate ${value ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
            {displayValue}
          </span>
        </div>
        {value && (
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
          </button>
        )}
      </button>
      
      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="flex">
              {/* Quick Presets */}
              <div className="w-40 border-r border-gray-200 dark:border-gray-700 py-2">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Select
                </p>
                {QUICK_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePresetSelect(preset)}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              
              {/* Calendar */}
              <div>
                <CalendarGrid
                  year={viewDate.year}
                  month={viewDate.month}
                  selectedRange={value}
                  selectionStart={selectionStart}
                  onSelectDate={handleSelectDate}
                  onNavigateMonth={handleNavigateMonth}
                  minDate={minDate}
                  maxDate={maxDate}
                />
                
                {/* Selection hint */}
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    {selectionStart 
                      ? 'Click another date to complete range'
                      : 'Click a date to start selection'
                    }
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Compact Date Range Display
// ============================================

interface DateRangeDisplayProps {
  range: DateRange | undefined;
  onClear: () => void;
}

export function DateRangeDisplay({ range, onClear }: DateRangeDisplayProps) {
  if (!range) return null;
  
  const displayText = range.start === range.end
    ? formatDateForDisplay(range.start)
    : `${formatDateForDisplay(range.start)} - ${formatDateForDisplay(range.end)}`;
  
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium">
      <Calendar className="w-3.5 h-3.5" />
      {displayText}
      <button
        onClick={onClear}
        className="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}




