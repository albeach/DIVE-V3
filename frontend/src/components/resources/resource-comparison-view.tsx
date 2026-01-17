/**
 * Resource Comparison View Component (2025)
 * 
 * Phase 3.5: Comparison View
 * Side-by-side comparison of 2-4 selected resources
 * 
 * Features:
 * - Side-by-side metadata comparison
 * - Difference highlighting
 * - Synchronized scrolling
 * - Sticky headers
 * - Print-friendly layout
 * - Mobile-responsive
 */

'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Maximize2,
  Minimize2,
  Printer,
  ChevronDown,
  ChevronRight,
  Shield,
  Globe2,
  Users,
  Lock,
  Calendar,
  Server,
  Check,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import type { IResourceCardData } from './advanced-resource-card';

// ============================================
// Types
// ============================================

interface ResourceComparisonViewProps {
  /** Resources to compare (2-4) */
  resources: IResourceCardData[];
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** User attributes for access checking */
  userAttributes?: {
    clearance?: string;
    country?: string;
    coi?: string[];
  };
}

interface ComparisonField {
  key: keyof IResourceCardData;
  label: string;
  icon: React.ReactNode;
  renderer: (value: unknown, resource: IResourceCardData) => React.ReactNode;
  comparator?: (values: unknown[]) => { allSame: boolean; diff: string[] };
}

// ============================================
// Constants
// ============================================

const CLASSIFICATION_COLORS: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'RESTRICTED': 'bg-blue-100 text-blue-800 border-blue-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

const INSTANCE_FLAGS: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'CAN': '🇨🇦',
};

// ============================================
// Comparison Logic
// ============================================

function compareValues(values: unknown[]): { allSame: boolean; uniqueValues: Set<string> } {
  const stringValues = values.map(v => {
    if (Array.isArray(v)) return v.sort().join(',');
    if (v === null || v === undefined) return '';
    return String(v);
  });
  
  const uniqueValues = new Set(stringValues);
  return {
    allSame: uniqueValues.size === 1,
    uniqueValues,
  };
}

function compareArrays(values: (string[] | undefined)[]): { allSame: boolean; common: string[]; diff: string[][] } {
  const arrays: string[][] = values.map(v => v || []);
  const allItems = new Set<string>(arrays.flat());
  
  const common: string[] = [];
  const diff: string[][] = arrays.map(() => []);
  
  allItems.forEach((item: string) => {
    const inAll = arrays.every(arr => arr.includes(item));
    if (inAll) {
      common.push(item);
    } else {
      arrays.forEach((arr, idx) => {
        if (arr.includes(item)) {
          diff[idx].push(item);
        }
      });
    }
  });
  
  return {
    allSame: diff.every(d => d.length === 0),
    common,
    diff,
  };
}

// ============================================
// Field Definitions
// ============================================

const COMPARISON_FIELDS: ComparisonField[] = [
  {
    key: 'resourceId',
    label: 'Resource ID',
    icon: <span className="text-gray-500">#</span>,
    renderer: (value) => (
      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
        {String(value)}
      </code>
    ),
  },
  {
    key: 'title',
    label: 'Title',
    icon: <span className="text-gray-500">📄</span>,
    renderer: (value) => (
      <span className="font-semibold text-gray-900 dark:text-gray-100">
        {String(value)}
      </span>
    ),
  },
  {
    key: 'classification',
    label: 'Classification',
    icon: <Shield className="w-4 h-4 text-gray-500" />,
    renderer: (value) => {
      const cls = String(value);
      const colorClass = CLASSIFICATION_COLORS[cls] || 'bg-gray-100 text-gray-800';
      return (
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${colorClass}`}>
          {cls.replace('_', ' ')}
        </span>
      );
    },
  },
  {
    key: 'originRealm',
    label: 'Origin Instance',
    icon: <Server className="w-4 h-4 text-gray-500" />,
    renderer: (value) => {
      const realm = String(value || 'Local');
      const flag = INSTANCE_FLAGS[realm] || '🌐';
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-semibold">
          <span>{flag}</span>
          <span>{realm}</span>
        </span>
      );
    },
  },
  {
    key: 'releasabilityTo',
    label: 'Releasable To',
    icon: <Globe2 className="w-4 h-4 text-blue-500" />,
    renderer: (value) => {
      const countries = (value as string[]) || [];
      return (
        <div className="flex flex-wrap gap-1">
          {countries.length > 0 ? (
            countries.map(country => (
              <span
                key={country}
                className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold"
              >
                {INSTANCE_FLAGS[country] || ''} {country}
              </span>
            ))
          ) : (
            <span className="text-gray-400 text-sm italic">None</span>
          )}
        </div>
      );
    },
  },
  {
    key: 'COI',
    label: 'Communities of Interest',
    icon: <Users className="w-4 h-4 text-purple-500" />,
    renderer: (value) => {
      const cois = (value as string[]) || [];
      return (
        <div className="flex flex-wrap gap-1">
          {cois.length > 0 ? (
            cois.map(coi => (
              <span
                key={coi}
                className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-semibold"
              >
                {coi}
              </span>
            ))
          ) : (
            <span className="text-gray-400 text-sm italic">None required</span>
          )}
        </div>
      );
    },
  },
  {
    key: 'encrypted',
    label: 'Encryption',
    icon: <Lock className="w-4 h-4 text-gray-500" />,
    renderer: (value) => (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
        value 
          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
      }`}>
        {value ? (
          <>
            <Lock className="w-3 h-3" />
            ZTDF Encrypted
          </>
        ) : (
          'Not Encrypted'
        )}
      </span>
    ),
  },
  {
    key: 'creationDate',
    label: 'Creation Date',
    icon: <Calendar className="w-4 h-4 text-gray-500" />,
    renderer: (value) => {
      if (!value) return <span className="text-gray-400 text-sm italic">Unknown</span>;
      try {
        const date = new Date(value as string);
        return (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        );
      } catch {
        return <span className="text-gray-400 text-sm">{String(value)}</span>;
      }
    },
  },
  {
    key: 'displayMarking',
    label: 'Display Marking',
    icon: <span className="text-gray-500">🏷️</span>,
    renderer: (value) => (
      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono text-gray-700 dark:text-gray-300">
        {String(value || 'N/A')}
      </code>
    ),
  },
];

// ============================================
// Comparison Row Component
// ============================================

interface ComparisonRowProps {
  field: ComparisonField;
  resources: IResourceCardData[];
  isExpanded?: boolean;
}

function ComparisonRow({ field, resources }: ComparisonRowProps) {
  const values = resources.map(r => r[field.key]);
  const comparison = compareValues(values);
  
  return (
    <tr className={`border-b border-gray-200 dark:border-gray-700 ${
      !comparison.allSame ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
    }`}>
      {/* Field Label */}
      <td className="sticky left-0 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-r border-gray-200 dark:border-gray-700 z-10">
        <div className="flex items-center gap-2">
          {field.icon}
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {field.label}
          </span>
          {!comparison.allSame && (
            <span className="ml-auto flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="w-3 h-3" />
              Differs
            </span>
          )}
        </div>
      </td>
      
      {/* Values */}
      {resources.map((resource, idx) => (
        <td
          key={resource.resourceId}
          className={`px-4 py-3 min-w-[200px] ${
            idx < resources.length - 1 ? 'border-r border-gray-200 dark:border-gray-700' : ''
          }`}
        >
          {field.renderer(resource[field.key], resource)}
        </td>
      ))}
    </tr>
  );
}

// ============================================
// Main Component
// ============================================

export default function ResourceComparisonView({
  resources,
  isOpen,
  onClose,
  userAttributes,
}: ResourceComparisonViewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { t } = useTranslation('resources');
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['identification', 'security', 'metadata'])
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Group fields by category
  const fieldGroups = useMemo(() => [
    {
      id: 'identification',
      label: 'Identification',
      fields: COMPARISON_FIELDS.filter(f => ['resourceId', 'title', 'originRealm'].includes(f.key)),
    },
    {
      id: 'security',
      label: 'Security Attributes',
      fields: COMPARISON_FIELDS.filter(f => ['classification', 'releasabilityTo', 'COI', 'encrypted'].includes(f.key)),
    },
    {
      id: 'metadata',
      label: t('comparison.metadata'),
      fields: COMPARISON_FIELDS.filter(f => ['creationDate', 'displayMarking'].includes(f.key)),
    },
  ], []);

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Handle print
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePrint();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrint]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Calculate differences summary - MUST be before any early returns (Rules of Hooks)
  const diffSummary = useMemo(() => {
    if (resources.length < 2) {
      return { sameCount: 0, diffCount: 0 };
    }
    
    let sameCount = 0;
    let diffCount = 0;

    COMPARISON_FIELDS.forEach(field => {
      const values = resources.map(r => r[field.key]);
      const { allSame } = compareValues(values);
      if (allSame) sameCount++;
      else diffCount++;
    });

    return { sameCount, diffCount };
  }, [resources]);

  // Early return for SSR - AFTER all hooks
  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && resources.length >= 2 && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`fixed z-50 bg-white dark:bg-gray-900 overflow-hidden flex flex-col ${
              isFullscreen
                ? 'inset-0 rounded-none'
                : 'inset-4 md:inset-8 lg:inset-12 rounded-2xl shadow-2xl'
            }`}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {t('comparison.title')}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Comparing {resources.length} resources • 
                    <span className="text-green-600 dark:text-green-400 ml-1">{diffSummary.sameCount} identical</span> • 
                    <span className="text-yellow-600 dark:text-yellow-400 ml-1">{diffSummary.diffCount} different</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Print comparison (⌘P)"
                  >
                    <Printer className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={isFullscreen ? 'Exit fullscreen (⌘F)' : 'Fullscreen (⌘F)'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <Maximize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={t('comparison.closeTooltip')}
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                {/* Column Headers (Resource Titles) */}
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="sticky left-0 bg-gray-100 dark:bg-gray-800 px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700 min-w-[180px] z-30">
                      Field
                    </th>
                    {resources.map((resource, idx) => (
                      <th
                        key={resource.resourceId}
                        className={`px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700 min-w-[200px] ${
                          idx < resources.length - 1 ? 'border-r' : ''
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {INSTANCE_FLAGS[resource.originRealm || 'USA']} Resource {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 line-clamp-2">
                            {resource.title}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Field Groups */}
                <tbody>
                  {fieldGroups.map(group => (
                    <React.Fragment key={group.id}>
                      {/* Group Header */}
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <td
                          colSpan={resources.length + 1}
                          className="px-4 py-2"
                        >
                          <button
                            onClick={() => toggleSection(group.id)}
                            className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                          >
                            {expandedSections.has(group.id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            {group.label}
                          </button>
                        </td>
                      </tr>

                      {/* Group Fields */}
                      {expandedSections.has(group.id) &&
                        group.fields.map(field => (
                          <ComparisonRow
                            key={field.key}
                            field={field}
                            resources={resources}
                          />
                        ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-100 dark:bg-yellow-900/30 rounded"></div>
                    Highlighted rows indicate differences
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono">⌘F</kbd>
                  <span>fullscreen</span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono ml-2">⌘P</kbd>
                  <span>print</span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 font-mono ml-2">esc</kbd>
                  <span>close</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}

// ============================================
// Print Styles
// ============================================

// Add print styles via CSS
const printStyles = `
  @media print {
    body * {
      visibility: hidden;
    }
    
    [data-comparison-view],
    [data-comparison-view] * {
      visibility: visible;
    }
    
    [data-comparison-view] {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
    }
  }
`;

// Inject print styles if not already present
if (typeof document !== 'undefined') {
  const styleId = 'comparison-view-print-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = printStyles;
    document.head.appendChild(style);
  }
}
