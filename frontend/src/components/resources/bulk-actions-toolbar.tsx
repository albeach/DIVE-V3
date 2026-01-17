/**
 * Bulk Actions Toolbar Component (2025)
 * 
 * Phase 3.2: Power User Features
 * Floating toolbar that appears when resources are selected
 * 
 * Features:
 * - Selection count display
 * - Export to CSV/JSON/Excel
 * - Compare selected (2-4 items)
 * - Clear selection
 * - Keyboard shortcuts
 * - Smooth animations
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  GitCompare,
  FileSpreadsheet,
  FileJson,
  ChevronDown,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import { exportResources, ExportFormat, ExportOptions } from '@/lib/export-resources';
import type { IResourceCardData } from './advanced-resource-card';

// ============================================
// Types
// ============================================

interface BulkActionsToolbarProps {
  /** Selected resources */
  selectedResources: IResourceCardData[];
  /** Total resources (for "Select All" count) */
  totalResources: number;
  /** Callback when selection is cleared */
  onClearSelection: () => void;
  /** Callback when "Select All" is clicked */
  onSelectAll?: () => void;
  /** Callback when "Compare" is clicked */
  onCompare?: (resources: IResourceCardData[]) => void;
  /** Whether all items are selected */
  allSelected?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================
// Export Dropdown Component
// ============================================

interface ExportDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options?: Partial<ExportOptions>) => void;
  isExporting: boolean;
  selectedCount: number;
}

function ExportDropdown({ 
  isOpen, 
  onClose, 
  onExport, 
  isExporting,
  selectedCount 
}: ExportDropdownProps) {
  const exportOptions = [
    { 
      format: 'csv' as ExportFormat, 
      label: 'CSV', 
      icon: FileSpreadsheet,
      description: 'Comma-separated values'
    },
    { 
      format: 'json' as ExportFormat, 
      label: 'JSON', 
      icon: FileJson,
      description: 'JavaScript Object Notation'
    },
    { 
      format: 'excel' as ExportFormat, 
      label: 'Excel', 
      icon: FileSpreadsheet,
      description: 'Microsoft Excel format'
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={onClose}
          />
          
          {/* Dropdown */}
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
          >
            <div className="p-2">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Export {selectedCount} items as
              </p>
              {exportOptions.map((option) => (
                <button
                  key={option.format}
                  onClick={() => onExport(option.format)}
                  disabled={isExporting}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left disabled:opacity-50"
                >
                  <option.icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Main Component
// ============================================

export default function BulkActionsToolbar({
  selectedResources,
  totalResources,
  onClearSelection,
  onSelectAll,
  onCompare,
  allSelected = false,
  className = '',
}: BulkActionsToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const { t } = useTranslation('resources');

  const selectedCount = selectedResources.length;
  const isVisible = selectedCount > 0;
  const canCompare = selectedCount >= 2 && selectedCount <= 4;

  // Handle export
  const handleExport = useCallback(async (format: ExportFormat) => {
    setIsExporting(true);
    setShowExportMenu(false);
    
    try {
      await exportResources(selectedResources, {
        format,
        filename: `dive-resources-${selectedCount}-items`,
        includeMetadata: true,
        formatDates: true,
      });
      
      setExportSuccess(`Exported ${selectedCount} items as ${format.toUpperCase()}`);
      setTimeout(() => setExportSuccess(null), 3000);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [selectedResources, selectedCount]);

  // Handle compare
  const handleCompare = useCallback(() => {
    if (canCompare && onCompare) {
      onCompare(selectedResources);
    }
  }, [canCompare, onCompare, selectedResources]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`fixed bottom-6 left-0 right-0 mx-auto w-fit max-w-[95vw] z-40 ${className}`}
        >
          <div className="flex items-center gap-2 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-gray-700 px-4 py-3">
            {/* Selection Count */}
            <div className="flex items-center gap-2 pr-4 border-r border-gray-700">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div className="text-sm">
                <span className="font-bold">{selectedCount}</span>
                <span className="text-gray-400 ml-1">{t('bulkActions.selected')}</span>
              </div>
            </div>

            {/* Select All / Deselect All */}
            {onSelectAll && (
              <button
                onClick={allSelected ? onClearSelection : onSelectAll}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                {allSelected ? (
                  <>
                    <Square className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('bulkActions.deselectAll')}</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('bulkActions.selectAll')} ({totalResources})</span>
                  </>
                )}
              </button>
            )}

            {/* Export Button */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{t('bulkActions.export')}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              <ExportDropdown
                isOpen={showExportMenu}
                onClose={() => setShowExportMenu(false)}
                onExport={handleExport}
                isExporting={isExporting}
                selectedCount={selectedCount}
              />
            </div>

            {/* Compare Button */}
            {onCompare && (
              <button
                onClick={handleCompare}
                disabled={!canCompare}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-semibold ${
                  canCompare
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
                title={
                  selectedCount < 2
                    ? t('bulkActions.compareTooltip.selectMin')
                    : selectedCount > 4
                      ? t('bulkActions.compareTooltip.maxItems')
                      : t('bulkActions.compareTooltip.compareSelected')
                }
              >
                <GitCompare className="w-4 h-4" />
                <span className="hidden sm:inline">{t('bulkActions.compare')}</span>
                {!canCompare && selectedCount < 2 && (
                  <span className="text-xs text-gray-500">(2+ needed)</span>
                )}
              </button>
            )}

            {/* Clear Selection */}
            <button
              onClick={onClearSelection}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
              title="Clear selection (Escape)"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Clear</span>
            </button>

            {/* Keyboard Hint */}
            <div className="hidden lg:flex items-center gap-1.5 pl-4 border-l border-gray-700 text-xs text-gray-500">
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 font-mono">x</kbd>
              <span>toggle</span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 font-mono ml-2">⌘A</kbd>
              <span>all</span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 font-mono ml-2">esc</kbd>
              <span>clear</span>
            </div>
          </div>

          {/* Export Success Toast */}
          <AnimatePresence>
            {exportSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-semibold whitespace-nowrap"
              >
                ✓ {exportSuccess}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Compact Selection Indicator
// ============================================

interface SelectionIndicatorProps {
  count: number;
  onClear: () => void;
}

export function SelectionIndicator({ count, onClear }: SelectionIndicatorProps) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-semibold"
    >
      <CheckSquare className="w-4 h-4" />
      <span>{count} selected</span>
      <button
        onClick={onClear}
        className="ml-1 p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
