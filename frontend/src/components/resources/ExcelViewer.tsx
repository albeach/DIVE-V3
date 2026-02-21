'use client';

/**
 * Excel Viewer Component
 * Renders XLSX files in the browser using SheetJS
 * Supports classification markings and watermarks
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Download, Sheet, ChevronDown, Shield } from 'lucide-react';

interface ExcelViewerProps {
  content: string; // Base64 encoded Excel file
  title: string;
  classification: string;
  onDownload: () => void;
  watermarkText: string;
  watermarkOpacity?: number;
  showWatermark?: boolean;
}

export default function ExcelViewer({
  content,
  title,
  classification,
  onDownload,
  watermarkText,
  watermarkOpacity = 0.15,
  showWatermark = true,
}: ExcelViewerProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!content) {
      setError('No content provided');
      setLoading(false);
      return;
    }

    try {
      // Decode base64 content
      const binaryString = atob(content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Parse Excel file
      const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
      setWorkbook(wb);

      // Set first sheet as active
      if (wb.SheetNames.length > 0) {
        setActiveSheet(wb.SheetNames[0]);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error parsing Excel file:', err);
      setError('Failed to parse Excel file: ' + (err as Error).message);
      setLoading(false);
    }
  }, [content]);

  // Convert sheet to HTML table with styling
  const renderSheet = useMemo(() => {
    if (!workbook || !activeSheet) return null;

    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) return null;

    // Convert to HTML with full styling
    const html = XLSX.utils.sheet_to_html(sheet, {
      header: '',
      footer: '',
    });

    return html;
  }, [workbook, activeSheet]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-12 text-center border-2 border-green-200">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-6">
          <div className="w-12 h-12 border-4 border-green-300 border-t-green-600 rounded-full animate-spin" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">Loading Spreadsheet...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-12 text-center border-2 border-red-200">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-red-100 rounded-full mb-6">
          <Sheet className="w-12 h-12 text-red-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-3">Preview Unavailable</h3>
        <p className="text-red-600 mb-6">{error}</p>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all hover:shadow-lg"
        >
          <Download className="w-5 h-5" />
          Download Spreadsheet
        </button>
      </div>
    );
  }

  if (!workbook || !activeSheet) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-12 text-center border-2 border-gray-200">
        <p className="text-gray-600">No sheets found in workbook</p>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-xl border-2 border-green-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200">
        <div className="flex items-center gap-3">
          <Sheet className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                {classification}
              </span>
              <span className="mx-2">•</span>
              {workbook.SheetNames.length} sheet{workbook.SheetNames.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-all hover:shadow-md"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Sheet Tabs */}
      {workbook.SheetNames.length > 1 && (
        <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto">
          {workbook.SheetNames.map((sheetName) => (
            <button
              key={sheetName}
              onClick={() => setActiveSheet(sheetName)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeSheet === sheetName
                  ? 'bg-white text-green-700 shadow-sm border border-green-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>
      )}

      {/* Watermark Layer */}
      {showWatermark && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
          style={{
            background: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 200px,
              rgba(34, 197, 94, ${watermarkOpacity}) 200px,
              rgba(34, 197, 94, ${watermarkOpacity}) 400px
            )`,
          }}
        >
          <div
            className="text-6xl font-bold text-green-700 transform -rotate-45 select-none"
            style={{ opacity: watermarkOpacity }}
          >
            {watermarkText}
          </div>
        </div>
      )}

      {/* Spreadsheet Content */}
      <div className="relative overflow-auto max-h-[70vh] p-4">
        <div
          className="excel-viewer-content"
          dangerouslySetInnerHTML={{ __html: renderSheet || '' }}
        />
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 p-3 bg-green-50 border-t border-green-200 text-xs text-green-700">
        <Shield className="w-4 h-4" />
        <span>Decrypted and rendered securely in your browser</span>
      </div>

      {/* Styles for Excel table */}
      <style jsx>{`
        :global(.excel-viewer-content table) {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          background: white;
        }
        :global(.excel-viewer-content td),
        :global(.excel-viewer-content th) {
          border: 1px solid #e5e7eb;
          padding: 8px 12px;
          text-align: left;
          min-width: 100px;
        }
        :global(.excel-viewer-content th) {
          background: #f9fafb;
          font-weight: 600;
          color: #374151;
        }
        :global(.excel-viewer-content tr:hover) {
          background: #f3f4f6;
        }
      `}</style>
    </div>
  );
}
