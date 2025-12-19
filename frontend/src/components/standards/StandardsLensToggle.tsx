"use client";

import { useStandardsLens } from '@/contexts/StandardsLensContext';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

/**
 * Standards Lens Dropdown (Compact)
 * 
 * Compact dropdown to switch UI perspective:
 * - 5663: Federation/Identity
 * - Unified: Both standards (default)
 * - 240: Object/Data
 * 
 * Replaces 3-button toggle with space-efficient dropdown
 */
export function StandardsLensToggle() {
  const { activeLens, setActiveLens } = useStandardsLens();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { value: '5663', label: '5663', fullLabel: 'Federation', color: 'indigo', emoji: '🔵' },
    { value: 'unified', label: 'Unified', fullLabel: 'Both', color: 'teal', emoji: '🟢' },
    { value: '240', label: '240', fullLabel: 'Object', color: 'amber', emoji: '🟠' },
  ];

  const current = options.find(o => o.value === activeLens) || options[1];

  return (
    <div ref={dropdownRef} className="relative" title="Standards Lens - Toggle between 5663/240/Unified views">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg"
        aria-label={`Standards Lens: ${current.fullLabel}`}
      >
        <span className="text-base">{current.emoji}</span>
        <span>{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 py-1">
          {options.map(option => (
            <button
              key={option.value}
              onClick={() => {
                setActiveLens(option.value as any);
                setIsOpen(false);
              }}
              className={`
                w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors
                ${activeLens === option.value
                  ? 'bg-gray-100 dark:bg-gray-700 font-bold'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }
              `}
            >
              <span>{option.emoji}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100">{option.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{option.fullLabel}</div>
              </div>
              {activeLens === option.value && (
                <span className="text-green-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
