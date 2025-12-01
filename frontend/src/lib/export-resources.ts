/**
 * Resource Export Utility (2025)
 * 
 * Phase 3.4: Export Functionality
 * Export selected or all resources to CSV, JSON, or Excel formats
 * 
 * Features:
 * - CSV export with proper escaping
 * - JSON export with formatting
 * - Excel export (via CSV with .xlsx hint)
 * - Configurable columns
 * - Date formatting
 * - Client-side generation (no server required)
 */

import type { IResourceCardData } from '@/components/resources/advanced-resource-card';

// ============================================
// Types
// ============================================

export type ExportFormat = 'csv' | 'json' | 'excel';

export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Base filename (without extension) */
  filename: string;
  /** Columns to include (default: all) */
  columns?: (keyof IResourceCardData)[];
  /** Include metadata in JSON export */
  includeMetadata?: boolean;
  /** Format dates as human-readable */
  formatDates?: boolean;
  /** Custom column headers */
  customHeaders?: Partial<Record<keyof IResourceCardData, string>>;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  format: ExportFormat;
  recordCount: number;
  sizeBytes: number;
  error?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_COLUMNS: (keyof IResourceCardData)[] = [
  'resourceId',
  'title',
  'classification',
  'releasabilityTo',
  'COI',
  'encrypted',
  'creationDate',
  'displayMarking',
  'originRealm',
];

const DEFAULT_HEADERS: Partial<Record<keyof IResourceCardData, string>> = {
  resourceId: 'Resource ID',
  title: 'Title',
  classification: 'Classification',
  releasabilityTo: 'Releasable To',
  COI: 'Communities of Interest',
  encrypted: 'Encrypted (ZTDF)',
  creationDate: 'Creation Date',
  displayMarking: 'Display Marking',
  originRealm: 'Origin Instance',
  ztdfVersion: 'ZTDF Version',
  kaoCount: 'Key Access Objects',
};

// ============================================
// Utility Functions
// ============================================

/**
 * Escape a value for CSV (handles quotes, commas, newlines)
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Format a date for export
 */
function formatDate(date: string | undefined, formatDates: boolean): string {
  if (!date) return '';
  
  if (!formatDates) return date;
  
  try {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

/**
 * Format an array value for export
 */
function formatArray(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return '';
  return arr.join(', ');
}

/**
 * Get the value of a field, formatted for export
 */
function getFieldValue(
  resource: IResourceCardData,
  field: keyof IResourceCardData,
  formatDates: boolean
): string {
  const value = resource[field];
  
  switch (field) {
    case 'releasabilityTo':
    case 'COI':
      return formatArray(value as string[]);
    case 'creationDate':
      return formatDate(value as string, formatDates);
    case 'encrypted':
      return value ? 'Yes' : 'No';
    case 'classification':
      return String(value || '').replace('_', ' ');
    default:
      if (value === null || value === undefined) return '';
      return String(value);
  }
}

/**
 * Generate a timestamp for filenames
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Trigger a file download in the browser
 */
function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ============================================
// Export Functions
// ============================================

/**
 * Export resources to CSV format
 */
function exportToCSV(
  resources: IResourceCardData[],
  options: ExportOptions
): string {
  const columns = options.columns || DEFAULT_COLUMNS;
  const headers = { ...DEFAULT_HEADERS, ...options.customHeaders };
  const formatDates = options.formatDates ?? true;
  
  // Build header row
  const headerRow = columns.map(col => escapeCSV(headers[col] || col)).join(',');
  
  // Build data rows
  const dataRows = resources.map(resource => 
    columns.map(col => escapeCSV(getFieldValue(resource, col, formatDates))).join(',')
  );
  
  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  
  return BOM + [headerRow, ...dataRows].join('\r\n');
}

/**
 * Export resources to JSON format
 */
function exportToJSON(
  resources: IResourceCardData[],
  options: ExportOptions
): string {
  const columns = options.columns || DEFAULT_COLUMNS;
  const formatDates = options.formatDates ?? true;
  
  // Transform resources to include only selected columns
  const data = resources.map(resource => {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      const value = resource[col];
      
      if (col === 'creationDate' && formatDates && value) {
        obj[col] = new Date(value as string).toISOString();
      } else {
        obj[col] = value;
      }
    }
    return obj;
  });
  
  // Build export object with optional metadata
  const exportData = options.includeMetadata
    ? {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalRecords: resources.length,
          columns: columns,
          format: 'DIVE V3 Resource Export',
          version: '1.0',
        },
        resources: data,
      }
    : data;
  
  return JSON.stringify(exportData, null, 2);
}

// ============================================
// Main Export Function
// ============================================

/**
 * Export resources to the specified format and trigger download
 */
export async function exportResources(
  resources: IResourceCardData[],
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  // Merge with defaults
  const fullOptions: ExportOptions = {
    format: options.format || 'csv',
    filename: options.filename || `dive-resources-${getTimestamp()}`,
    columns: options.columns || DEFAULT_COLUMNS,
    includeMetadata: options.includeMetadata ?? true,
    formatDates: options.formatDates ?? true,
    customHeaders: options.customHeaders,
  };
  
  try {
    let content: string;
    let mimeType: string;
    let extension: string;
    
    switch (fullOptions.format) {
      case 'csv':
        content = exportToCSV(resources, fullOptions);
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
        break;
        
      case 'json':
        content = exportToJSON(resources, fullOptions);
        mimeType = 'application/json;charset=utf-8';
        extension = 'json';
        break;
        
      case 'excel':
        // For Excel, we export as CSV with .xlsx extension hint
        // Excel will open and convert it properly
        content = exportToCSV(resources, fullOptions);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        extension = 'csv'; // Using CSV since we don't have a real XLSX library
        break;
        
      default:
        throw new Error(`Unsupported export format: ${fullOptions.format}`);
    }
    
    const filename = `${fullOptions.filename}.${extension}`;
    const sizeBytes = new Blob([content]).size;
    
    // Trigger download
    downloadFile(content, filename, mimeType);
    
    return {
      success: true,
      filename,
      format: fullOptions.format,
      recordCount: resources.length,
      sizeBytes,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Export failed';
    console.error('[Export] Error:', errorMessage);
    
    return {
      success: false,
      filename: '',
      format: fullOptions.format,
      recordCount: 0,
      sizeBytes: 0,
      error: errorMessage,
    };
  }
}

// ============================================
// Utility Exports
// ============================================

/**
 * Get available export formats
 */
export function getAvailableFormats(): { format: ExportFormat; label: string; extension: string }[] {
  return [
    { format: 'csv', label: 'CSV (Comma Separated)', extension: '.csv' },
    { format: 'json', label: 'JSON', extension: '.json' },
    { format: 'excel', label: 'Excel Compatible', extension: '.csv' },
  ];
}

/**
 * Estimate export file size
 */
export function estimateExportSize(
  resources: IResourceCardData[],
  format: ExportFormat
): number {
  // Rough estimates based on average resource size
  const avgResourceSize = format === 'json' ? 500 : 200; // bytes per resource
  const overhead = format === 'json' ? 200 : 100; // header/metadata
  
  return overhead + (resources.length * avgResourceSize);
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default exportResources;

