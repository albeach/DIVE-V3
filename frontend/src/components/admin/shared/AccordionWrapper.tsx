/**
 * AccordionWrapper Component - Reusable accordion with state persistence
 * 
 * Phase 3.7: Progressive Disclosure
 * Reduces cognitive load with collapsible sections
 * 
 * Features:
 * - Radix UI Accordion (accessible, keyboard navigation)
 * - localStorage state persistence
 * - Smooth animations with Framer Motion
 * - Chevron rotation indicator
 * - Single/multiple expansion modes
 * - Dark mode compatible
 * - TypeScript strict
 * 
 * @version 1.0.0
 * @date 2026-02-05
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { collapseVariants } from '@/lib/animations';

// ============================================
// TYPES
// ============================================

export interface AccordionWrapperProps {
  /** Unique storage key for persisting state */
  storageKey: string;
  
  /** Allow multiple items to be open simultaneously */
  multiple?: boolean;
  
  /** Default open items (used on first render) */
  defaultOpen?: string[];
  
  /** Children AccordionItem components */
  children: React.ReactNode;
  
  /** Additional CSS classes */
  className?: string;
  
  /** Disable state persistence */
  disablePersistence?: boolean;
}

export interface AccordionItemProps {
  /** Unique value for this item */
  value: string;
  
  /** Title shown in the trigger */
  title: string;
  
  /** Optional subtitle/description */
  subtitle?: string;
  
  /** Optional badge content */
  badge?: React.ReactNode;
  
  /** Content to show when expanded */
  children: React.ReactNode;
  
  /** Additional CSS classes for content */
  className?: string;
  
  /** Disable this item */
  disabled?: boolean;
}

// ============================================
// STORAGE UTILITIES
// ============================================

/**
 * Load accordion state from localStorage
 */
function loadAccordionState(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[AccordionWrapper] Failed to load state:', error);
  }
  
  return [];
}

/**
 * Save accordion state to localStorage
 */
function saveAccordionState(storageKey: string, value: string[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.error('[AccordionWrapper] Failed to save state:', error);
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * AccordionWrapper Component
 * 
 * @example Single expansion mode
 * ```tsx
 * <AccordionWrapper storageKey="dive-v3-accordion-clearance">
 *   <AccordionItem value="usa" title="USA Clearance Mapping">
 *     <p>Mapping details...</p>
 *   </AccordionItem>
 *   <AccordionItem value="fra" title="France Clearance Mapping">
 *     <p>Mapping details...</p>
 *   </AccordionItem>
 * </AccordionWrapper>
 * ```
 * 
 * @example Multiple expansion mode with default open
 * ```tsx
 * <AccordionWrapper 
 *   storageKey="dive-v3-accordion-compliance" 
 *   multiple 
 *   defaultOpen={['critical', 'high']}
 * >
 *   <AccordionItem value="critical" title="Critical Findings" badge={<Badge>3</Badge>}>
 *     <FindingsList severity="critical" />
 *   </AccordionItem>
 *   <AccordionItem value="high" title="High Findings" badge={<Badge>12</Badge>}>
 *     <FindingsList severity="high" />
 *   </AccordionItem>
 * </AccordionWrapper>
 * ```
 */
export function AccordionWrapper({
  storageKey,
  multiple = false,
  defaultOpen = [],
  children,
  className,
  disablePersistence = false,
}: AccordionWrapperProps) {
  // Load persisted state or use defaultOpen
  const [openItems, setOpenItems] = useState<string[]>(() => {
    if (disablePersistence) return defaultOpen;
    const persisted = loadAccordionState(storageKey);
    return persisted.length > 0 ? persisted : defaultOpen;
  });

  // Save state to localStorage when it changes
  useEffect(() => {
    if (!disablePersistence) {
      saveAccordionState(storageKey, openItems);
    }
  }, [storageKey, openItems, disablePersistence]);

  // Handle value change
  const handleValueChange = useCallback((value: string | string[]) => {
    const newValue = Array.isArray(value) ? value : [value];
    setOpenItems(newValue);
  }, []);

  return (
    <Accordion.Root
      type={multiple ? 'multiple' : 'single'}
      value={multiple ? openItems : openItems[0]}
      onValueChange={handleValueChange as any}
      className={cn('space-y-3', className)}
      collapsible={!multiple}
    >
      {children}
    </Accordion.Root>
  );
}

/**
 * AccordionItem Component
 * 
 * Must be used as child of AccordionWrapper
 */
export function AccordionItem({
  value,
  title,
  subtitle,
  badge,
  children,
  className,
  disabled = false,
}: AccordionItemProps) {
  return (
    <Accordion.Item
      value={value}
      disabled={disabled}
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-700',
        'bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl',
        'shadow-sm hover:shadow-md transition-shadow duration-200',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <Accordion.Header>
        <Accordion.Trigger
          className={cn(
            'group flex w-full items-center justify-between',
            'px-5 py-4 text-left',
            'hover:bg-gray-50/50 dark:hover:bg-gray-700/30',
            'transition-colors duration-200',
            'rounded-t-xl',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
            disabled && 'cursor-not-allowed'
          )}
          disabled={disabled}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              {badge && <div className="flex-shrink-0">{badge}</div>}
            </div>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>

          {/* Chevron indicator */}
          <motion.div
            className="flex-shrink-0 ml-4"
            initial={false}
            animate={{ rotate: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <ChevronDown
              className={cn(
                'h-5 w-5 text-gray-500 dark:text-gray-400',
                'group-hover:text-gray-700 dark:group-hover:text-gray-300',
                'transition-colors duration-200',
                'group-data-[state=open]:rotate-180',
                'transition-transform duration-200'
              )}
            />
          </motion.div>
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content
        className={cn(
          'overflow-hidden',
          'data-[state=closed]:animate-accordion-up',
          'data-[state=open]:animate-accordion-down'
        )}
      >
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ============================================
// UTILITY COMPONENTS
// ============================================

/**
 * Expand/Collapse All Controls
 * Optional companion component for AccordionWrapper
 * 
 * @example
 * ```tsx
 * <AccordionControls
 *   onExpandAll={() => setOpenItems(['item1', 'item2', 'item3'])}
 *   onCollapseAll={() => setOpenItems([])}
 * />
 * ```
 */
export interface AccordionControlsProps {
  /** Callback when "Expand All" is clicked */
  onExpandAll: () => void;
  
  /** Callback when "Collapse All" is clicked */
  onCollapseAll: () => void;
  
  /** Additional CSS classes */
  className?: string;
}

export function AccordionControls({
  onExpandAll,
  onCollapseAll,
  className,
}: AccordionControlsProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <button
        onClick={onExpandAll}
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
      >
        Expand All
      </button>
      <span className="text-gray-400 dark:text-gray-600">|</span>
      <button
        onClick={onCollapseAll}
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
      >
        Collapse All
      </button>
    </div>
  );
}

export default AccordionWrapper;
