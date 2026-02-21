'use client';

/**
 * DOCX Viewer Component
 *
 * Best Practice Implementation:
 * - Uses server-side conversion via backend API
 * - Backend uses mammoth.js for high-fidelity DOCX to HTML
 * - No client-side parsing = no SSR issues
 * - Clean separation of concerns
 *
 * Flow:
 * 1. Component receives base64-encoded DOCX content
 * 2. Calls backend /api/documents/convert-to-html endpoint
 * 3. Backend converts using mammoth.js (Node.js)
 * 4. Component renders returned HTML with security markings
 */

import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

interface DocxViewerProps {
  content: string; // Base64 encoded DOCX content
  title: string;
  classification: string;
  onDownload: () => void;
  watermarkText?: string;
  watermarkOpacity?: number;
  showWatermark?: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export default function DocxViewer({
  content,
  title,
  classification,
  onDownload,
  watermarkText = '',
  watermarkOpacity = 0.08,
  showWatermark = true,
}: DocxViewerProps) {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversionMessages, setConversionMessages] = useState<Array<{ type: string; message: string }>>([]);

  const convertDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConversionMessages([]);

    try {
      // Call backend API for server-side conversion
      const response = await fetch(`${BACKEND_URL}/api/documents/convert-to-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.html) {
        setHtmlContent(result.html);
        if (result.messages?.length > 0) {
          setConversionMessages(result.messages);
        }
      } else {
        throw new Error(result.error || 'Conversion returned no content');
      }

    } catch (err) {
      console.error('DOCX conversion error:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert document');
    } finally {
      setLoading(false);
    }
  }, [content]);

  useEffect(() => {
    if (content) {
      convertDocument();
    }
  }, [content, convertDocument]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-12 text-center border-2 border-blue-200">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">Converting Document...</h3>
        <p className="text-gray-500 text-sm">Rendering Word document for secure viewing.</p>
      </div>
    );
  }

  // Error state with download fallback
  if (error) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-12 text-center border-2 border-amber-200">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-6">
          <AlertTriangle className="w-10 h-10 text-amber-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">Preview Unavailable</h3>
        <p className="text-gray-600 mb-2">Could not convert document for browser viewing.</p>
        <p className="text-amber-700 text-sm mb-6 font-mono bg-amber-100 px-3 py-1 rounded">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onDownload}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all hover:shadow-lg"
          >
            <Download className="w-5 h-5" />
            Download DOCX
          </button>
          <button
            onClick={convertDocument}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all"
          >
            <RefreshCw className="w-5 h-5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Success - render converted HTML
  return (
    <div className="relative bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden">
      {/* Document header badge */}
      <div className="absolute top-4 left-4 bg-blue-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 z-20">
        <FileText className="w-3.5 h-3.5" />
        Word Document
      </div>

      {/* Download button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>

      {/* Conversion warnings (if any) */}
      {conversionMessages.length > 0 && (
        <div className="absolute top-14 left-4 right-4 z-20">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800">
            {conversionMessages.length} conversion note(s) - some formatting may differ from original
          </div>
        </div>
      )}

      {/* Watermark overlay */}
      {showWatermark && watermarkText && (
        <div
          className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='150'%3E%3Ctext x='150' y='75' font-family='Arial, sans-serif' font-size='14' fill='rgba(0,0,0,${watermarkOpacity})' text-anchor='middle' transform='rotate(-30, 150, 75)'%3E${encodeURIComponent(watermarkText)}%3C/text%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />
      )}

      {/* Document content - rendered HTML from mammoth conversion */}
      <div
        className="relative p-8 pt-16 overflow-auto"
        style={{ maxHeight: '70vh' }}
      >
        {/* Apply Tailwind typography for proper styling */}
        <div
          className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-table:border-collapse prose-td:border prose-td:border-gray-300 prose-td:p-2 prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-th:bg-gray-100"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
  );
}
