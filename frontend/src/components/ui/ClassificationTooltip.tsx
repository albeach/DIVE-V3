/**
 * Classification Tooltip Component
 * 
 * WCAG 2.1 AA Compliant Tooltip for Classification Terms
 * ACP-240 Section 4.3: Classification Equivalency Support
 * 
 * Features:
 * - Keyboard navigation (Tab, Escape)
 * - ARIA labels for screen readers
 * - High contrast ratios
 * - Bilingual support (national + NATO)
 * - Focus management
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ClassificationTooltipProps {
  /** National classification label (e.g., "GEHEIM") */
  nationalLabel: string;
  
  /** NATO equivalent label (e.g., "SECRET") */
  natoLabel: string;
  
  /** Country code (ISO 3166 alpha-3) */
  countryCode: string;
  
  /** Country name */
  countryName?: string;
  
  /** Optional additional description */
  description?: string;
  
  /** Children to wrap (trigger element) */
  children: React.ReactNode;
  
  /** Position of tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function ClassificationTooltip({
  nationalLabel,
  natoLabel,
  countryCode,
  countryName,
  description,
  children,
  position = 'top'
}: ClassificationTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setIsFocused(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        tooltipRef.current &&
        triggerRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-900'
  };

  const isDifferent = nationalLabel !== natoLabel;

  return (
    <div className="relative inline-block">
      {/* Trigger Element */}
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => !isFocused && setIsOpen(false)}
        onFocus={() => { setIsOpen(true); setIsFocused(true); }}
        onBlur={() => { setIsOpen(false); setIsFocused(false); }}
        tabIndex={0}
        role="button"
        aria-label={`Classification: ${nationalLabel} from ${countryName || countryCode}, NATO equivalent: ${natoLabel}`}
        aria-describedby={isOpen ? 'classification-tooltip' : undefined}
        className="inline-flex items-center cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
      >
        {children}
      </div>

      {/* Tooltip */}
      {isOpen && (
        <div
          ref={tooltipRef}
          id="classification-tooltip"
          role="tooltip"
          className={`absolute z-50 ${positionClasses[position]} animate-fade-in`}
        >
          {/* Tooltip Content */}
          <div className="bg-gray-900 text-white rounded-lg shadow-2xl border-2 border-gray-700 p-4 min-w-[280px] max-w-[320px]">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-700">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <h3 className="font-bold text-sm">Classification Equivalency</h3>
            </div>

            {/* National Classification */}
            <div className="mb-3">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">National Classification</p>
              <p className="text-base font-bold text-white">{nationalLabel}</p>
              <p className="text-xs text-gray-300 mt-1">from {countryName || countryCode} ({countryCode})</p>
            </div>

            {/* NATO Equivalent (only show if different) */}
            {isDifferent && (
              <>
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 border-t border-gray-700"></div>
                  <span className="text-xs text-gray-400">≈</span>
                  <div className="flex-1 border-t border-gray-700"></div>
                </div>

                <div className="mb-3">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">NATO Equivalent</p>
                  <p className="text-base font-bold text-white">{natoLabel}</p>
                  <p className="text-xs text-gray-300 mt-1">standardized level</p>
                </div>
              </>
            )}

            {/* Description */}
            {description && (
              <div className="pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
              </div>
            )}

            {/* ACP-240 Badge */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-green-300 font-semibold">ACP-240 Section 4.3 Compliant</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div 
            className={`absolute w-0 h-0 border-8 ${arrowClasses[position]}`}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
