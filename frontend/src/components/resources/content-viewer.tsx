'use client';

/**
 * Modern Content Viewer Component
 * Intelligently renders decrypted content based on MIME type
 * Supports: images, PDFs, text, documents
 * 
 * Design: 2025 modern UI patterns with glassmorphism and smooth interactions
 */

import { useState, useEffect } from 'react';
import { 
  Download, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  FileText,
  Image as ImageIcon,
  File
} from 'lucide-react';

interface ContentViewerProps {
  content: string;
  contentType: string;
  title: string;
  resourceId: string;
  classification: string;
}

export default function ContentViewer({
  content,
  contentType,
  title,
  resourceId,
  classification
}: ContentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Detect if content is base64 encoded
  const isBase64 = !content.startsWith('data:') && /^[A-Za-z0-9+/=]+$/.test(content.substring(0, 100));

  // Get data URL for rendering
  const getDataUrl = () => {
    if (content.startsWith('data:')) {
      return content;
    }
    if (isBase64) {
      return `data:${contentType};base64,${content}`;
    }
    return null;
  };

  // Determine content category
  const getContentCategory = () => {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType.startsWith('text/')) return 'text';
    return 'document';
  };

  const category = getContentCategory();
  const dataUrl = getDataUrl();

  // Download handler
  const handleDownload = () => {
    if (!dataUrl && !isBase64) {
      // Plain text download
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resourceId}-decrypted.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const a = document.createElement('a');
    a.href = dataUrl || '';
    const ext = contentType.split('/')[1] || 'bin';
    a.download = `${resourceId}-decrypted.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleZoomReset = () => setZoom(100);

  // Fullscreen keyboard handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isFullscreen]);

  // Render image content
  const renderImage = () => (
    <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 min-h-[500px] flex items-center justify-center overflow-hidden">
      {/* Loading skeleton */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600 font-medium">Loading image...</p>
          </div>
        </div>
      )}
      
      {/* Image */}
      <img
        src={dataUrl || ''}
        alt={title}
        className={`max-w-full h-auto rounded-lg shadow-2xl transition-all duration-300 ${
          !imageLoaded ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ 
          transform: `scale(${zoom / 100})`,
          maxHeight: isFullscreen ? '90vh' : '600px'
        }}
        onLoad={() => setImageLoaded(true)}
      />
    </div>
  );

  // Render PDF content
  const renderPDF = () => (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ height: isFullscreen ? '90vh' : '700px' }}>
      <iframe
        src={`${dataUrl}#view=FitH&toolbar=1&navpanes=1&scrollbar=1`}
        className="w-full h-full"
        title={title}
        style={{ border: 'none' }}
      />
      
      {/* PDF overlay hint */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
        <FileText className="w-4 h-4" />
        PDF Document
      </div>
    </div>
  );

  // Render text content
  const renderText = () => (
    <div 
      className="relative bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden"
      style={{ height: isFullscreen ? '90vh' : 'auto' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-purple-50/30 pointer-events-none" />
      <div 
        className="relative p-8 overflow-auto prose prose-sm max-w-none"
        style={{ 
          fontSize: `${zoom}%`,
          maxHeight: isFullscreen ? '90vh' : '600px'
        }}
      >
        <pre className="whitespace-pre-wrap font-mono text-gray-800 leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );

  // Render generic document
  const renderDocument = () => (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-12 text-center border-2 border-blue-200">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
        <File className="w-12 h-12 text-blue-600" />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-3">Document Decrypted</h3>
      <p className="text-gray-600 mb-2">
        Content type: <span className="font-mono text-sm bg-white px-3 py-1 rounded border">{contentType}</span>
      </p>
      <p className="text-gray-500 text-sm mb-6">
        This document format requires external viewer. Download to view contents.
      </p>
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all hover:shadow-lg"
      >
        <Download className="w-5 h-5" />
        Download Document
      </button>
    </div>
  );

  // Main render
  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-lg p-6 overflow-auto' : 'relative'}`}>
      {/* Header Controls */}
      <div className={`flex items-center justify-between mb-4 ${isFullscreen ? 'sticky top-0 z-10 bg-gray-800/90 backdrop-blur-md p-4 rounded-xl' : 'bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-gray-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          {category === 'image' && <ImageIcon className={`w-5 h-5 ${isFullscreen ? 'text-white' : 'text-blue-600'}`} />}
          {category === 'pdf' && <FileText className={`w-5 h-5 ${isFullscreen ? 'text-white' : 'text-red-600'}`} />}
          {category === 'text' && <FileText className={`w-5 h-5 ${isFullscreen ? 'text-white' : 'text-green-600'}`} />}
          
          <div>
            <h4 className={`font-semibold ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
              {title}
            </h4>
            <p className={`text-xs ${isFullscreen ? 'text-gray-300' : 'text-gray-500'}`}>
              {classification} • {contentType}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls for images and text */}
          {(category === 'image' || category === 'text') && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                className={`p-2 rounded-lg transition-all ${
                  isFullscreen 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-30' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30'
                }`}
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleZoomReset}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isFullscreen 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {zoom}%
              </button>
              
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                className={`p-2 rounded-lg transition-all ${
                  isFullscreen 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-30' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30'
                }`}
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className={`w-px h-6 ${isFullscreen ? 'bg-gray-600' : 'bg-gray-300'}`} />
            </>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            className={`p-2 rounded-lg transition-all ${
              isFullscreen 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
            }`}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-2 rounded-lg transition-all ${
              isFullscreen 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className={isFullscreen ? 'mt-4' : ''}>
        {category === 'image' && renderImage()}
        {category === 'pdf' && renderPDF()}
        {category === 'text' && renderText()}
        {category === 'document' && renderDocument()}
      </div>

      {/* Fullscreen footer hint */}
      {isFullscreen && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm font-medium animate-pulse">
          Press <kbd className="px-2 py-1 bg-white/20 rounded mx-1">ESC</kbd> to exit fullscreen
        </div>
      )}
    </div>
  );
}

