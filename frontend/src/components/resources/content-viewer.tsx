'use client';

/**
 * Modern Content Viewer Component
 * Intelligently renders decrypted content based on MIME type
 * Supports: images, PDFs, text, Markdown, documents
 *
 * STANAG 4774/4778 Enhancement:
 * - Integrates MarkingRenderer for security markings
 * - Supports page banners, badges, watermarks, and portion marks
 * - Renders human-visible markings per NATO standards
 *
 * Design: 2025 modern UI patterns with glassmorphism and smooth interactions
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  FileText,
  Image as ImageIcon,
  File,
  Shield,
  FileCode,
  Music,
  Film,
} from 'lucide-react';
import { AudioPlayer, VideoPlayer } from '@/components/multimedia';
import {
  MarkingRenderer,
  TextWithPortionMarkings,
  StandaloneClassificationBadge,
  type IMarkingDisplayOptions,
  DEFAULT_MARKING_OPTIONS,
} from './MarkingRenderer';
import { generateMarkingText, getClassificationColor } from '@/lib/spif-markings';

// Dynamic import for DOCX viewer - SSR disabled to avoid Node.js module issues
const DocxViewer = dynamic(() => import('./DocxViewer'), {
  ssr: false,
  loading: () => (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-12 text-center border-2 border-blue-200">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
        <div className="w-12 h-12 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">Loading Document Viewer...</h3>
      <p className="text-gray-500 text-sm">Preparing Word document viewer.</p>
    </div>
  ),
});

/**
 * STANAG marking metadata
 */
export interface ISTANAGMarkings {
  displayMarking: string;
  portionMarkings?: Record<string, string>;
  watermarkText?: string;
}

interface ContentViewerProps {
  content: string;
  contentType: string;
  title: string;
  resourceId: string;
  classification: string;
  /** Releasability countries (ISO 3166-1 alpha-3) */
  releasabilityTo?: string[];
  /** Communities of Interest */
  COI?: string[];
  /** Caveats (NOFORN, etc.) */
  caveats?: string[];
  /** STANAG marking metadata from backend */
  stanagMarkings?: ISTANAGMarkings;
  /** Enable security marking overlays */
  showMarkings?: boolean;
  /** Custom marking display options */
  markingOptions?: Partial<IMarkingDisplayOptions>;
}

export default function ContentViewer({
  content,
  contentType,
  title,
  resourceId,
  classification,
  releasabilityTo = [],
  COI,
  caveats,
  stanagMarkings,
  showMarkings = true,
  markingOptions,
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
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType === 'text/markdown') return 'markdown';
    if (contentType.startsWith('text/')) return 'text';
    if (contentType.includes('openxmlformats') || contentType === 'application/msword') return 'docx';
    return 'document';
  };

  const category = getContentCategory();
  const dataUrl = getDataUrl();

  // Generate marking if not provided from backend
  const effectiveMarking = useMemo(() => {
    if (stanagMarkings?.displayMarking) {
      return {
        displayMarking: stanagMarkings.displayMarking,
        watermarkText: stanagMarkings.watermarkText || classification.replace(/_/g, ' '),
        portionMarkings: stanagMarkings.portionMarkings,
      };
    }
    const generated = generateMarkingText(classification, releasabilityTo, { COI, caveats });
    return {
      displayMarking: generated.displayMarking,
      watermarkText: generated.watermarkText,
      portionMarkings: undefined,
    };
  }, [stanagMarkings, classification, releasabilityTo, COI, caveats]);

  // Merge marking options
  const finalMarkingOptions: IMarkingDisplayOptions = {
    ...DEFAULT_MARKING_OPTIONS,
    ...markingOptions,
  };

  // MIME type to file extension mapping
  const getFileExtension = (mimeType: string): string => {
    const mimeToExtension: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/msword': 'doc',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.ms-powerpoint': 'ppt',
      'text/plain': 'txt',
      'text/markdown': 'md',
      'text/html': 'html',
      'text/css': 'css',
      'text/javascript': 'js',
      'application/json': 'json',
      'application/xml': 'xml',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    return mimeToExtension[mimeType] || mimeType.split('/').pop()?.split('.').pop() || 'bin';
  };

  // Download handler
  const handleDownload = () => {
    const ext = getFileExtension(contentType);

    if (!dataUrl && !isBase64) {
      // Plain text download
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resourceId}-decrypted.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const a = document.createElement('a');
    a.href = dataUrl || '';
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

  // Decode base64 text content
  const getTextContent = (): string => {
    if (isBase64 && (category === 'text' || category === 'markdown')) {
      try {
        return atob(content);
      } catch {
        return content;
      }
    }
    return content;
  };

  // Note: DOCX viewing is handled by DocxViewer component which calls backend API
  // for server-side conversion using mammoth.js (best practice approach)

  // Render image content with watermark overlay
  const renderImage = () => (
    <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl min-h-[500px] flex items-center justify-center overflow-hidden">
      {/* Loading skeleton */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600 font-medium">Loading image...</p>
          </div>
        </div>
      )}

      {/* Image with watermark wrapper */}
      <div className="relative p-8">
        {/* Watermark overlay for images */}
        {showMarkings && finalMarkingOptions.showWatermark && imageLoaded && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='rgba(0,0,0,${finalMarkingOptions.watermarkOpacity})' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodeURIComponent(effectiveMarking.watermarkText)}%3C/text%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
            }}
          />
        )}

        <img
          src={dataUrl || ''}
          alt={title}
          className={`max-w-full h-auto rounded-lg shadow-2xl transition-all duration-300 ${
            !imageLoaded ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            transform: `scale(${zoom / 100})`,
            maxHeight: isFullscreen ? '80vh' : '550px'
          }}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
    </div>
  );

  // Render PDF content with marking overlays
  const renderPDF = () => (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ height: isFullscreen ? '85vh' : '700px' }}>
      {/* PDF iframe */}
      <iframe
        src={`${dataUrl}#view=FitH&toolbar=1&navpanes=1&scrollbar=1`}
        className="w-full h-full"
        title={title}
        style={{ border: 'none' }}
      />

      {/* Watermark overlay for PDF */}
      {showMarkings && finalMarkingOptions.showWatermark && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='rgba(255,255,255,${finalMarkingOptions.watermarkOpacity * 2})' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodeURIComponent(effectiveMarking.watermarkText)}%3C/text%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />
      )}

      {/* PDF overlay hint */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 z-20">
        <FileText className="w-4 h-4" />
        PDF Document
      </div>
    </div>
  );

  // Render text content with portion markings
  const renderText = () => {
    const textContent = getTextContent();

    return (
      <div
        className="relative bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden"
        style={{ height: isFullscreen ? '85vh' : 'auto' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-purple-50/30 pointer-events-none" />

        {/* Watermark for text */}
        {showMarkings && finalMarkingOptions.showWatermark && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='rgba(0,0,0,${finalMarkingOptions.watermarkOpacity})' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodeURIComponent(effectiveMarking.watermarkText)}%3C/text%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
            }}
          />
        )}

        <div
          className="relative p-8 overflow-auto"
          style={{
            fontSize: `${zoom}%`,
            maxHeight: isFullscreen ? '85vh' : '600px'
          }}
        >
          {showMarkings && finalMarkingOptions.showPortionMarks && effectiveMarking.portionMarkings ? (
            <TextWithPortionMarkings
              content={textContent}
              portionMarkings={effectiveMarking.portionMarkings}
              defaultClassification={classification}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-gray-800 leading-relaxed">
              {textContent}
            </pre>
          )}
        </div>
      </div>
    );
  };

  // Render Markdown content
  const renderMarkdown = () => {
    const textContent = getTextContent();

    return (
      <div
        className="relative bg-white rounded-xl shadow-inner border border-gray-200 overflow-hidden"
        style={{ height: isFullscreen ? '85vh' : 'auto' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50/30 to-pink-50/30 pointer-events-none" />

        {/* Watermark */}
        {showMarkings && finalMarkingOptions.showWatermark && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='rgba(0,0,0,${finalMarkingOptions.watermarkOpacity})' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodeURIComponent(effectiveMarking.watermarkText)}%3C/text%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
            }}
          />
        )}

        <div
          className="relative p-8 overflow-auto prose prose-sm max-w-none"
          style={{
            fontSize: `${zoom}%`,
            maxHeight: isFullscreen ? '85vh' : '600px'
          }}
        >
          {/* Simple markdown rendering - for production use react-markdown */}
          <div className="font-sans text-gray-800 leading-relaxed">
            {textContent.split('\n').map((line, i) => {
              // Basic markdown parsing
              if (line.startsWith('# ')) {
                return <h1 key={i} className="text-2xl font-bold mb-4 mt-6">{line.slice(2)}</h1>;
              }
              if (line.startsWith('## ')) {
                return <h2 key={i} className="text-xl font-semibold mb-3 mt-5">{line.slice(3)}</h2>;
              }
              if (line.startsWith('### ')) {
                return <h3 key={i} className="text-lg font-medium mb-2 mt-4">{line.slice(4)}</h3>;
              }
              if (line.startsWith('- ') || line.startsWith('* ')) {
                return <li key={i} className="ml-4 mb-1">{line.slice(2)}</li>;
              }
              if (line.startsWith('```')) {
                return <code key={i} className="block bg-gray-100 p-4 rounded my-2 font-mono text-sm">{line}</code>;
              }
              if (line.trim() === '') {
                return <br key={i} />;
              }
              return <p key={i} className="mb-2">{line}</p>;
            })}
          </div>
        </div>

        {/* Markdown type indicator */}
        <div className="absolute top-4 left-4 bg-purple-600/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 z-20">
          <FileCode className="w-3.5 h-3.5" />
          Markdown
        </div>
      </div>
    );
  };

  // Render DOCX using dynamic DocxViewer component (SSR-safe)
  const renderDocx = () => {
    return (
      <DocxViewer
        content={content}
        title={title}
        classification={classification}
        onDownload={handleDownload}
        watermarkText={effectiveMarking.watermarkText}
        watermarkOpacity={finalMarkingOptions.watermarkOpacity}
        showWatermark={showMarkings && finalMarkingOptions.showWatermark}
      />
    );
  };

  // Render audio content with STANAG classification overlay
  const renderAudio = () => {
    return (
      <AudioPlayer
        src={dataUrl || ''}
        classification={classification}
        displayMarking={effectiveMarking.displayMarking}
        releasabilityTo={releasabilityTo}
        watermarkText={effectiveMarking.watermarkText}
        title={title}
        onDownload={handleDownload}
        onPlaybackEvent={(event, position) => {
          // Audit logging for multimedia playback events
          console.log(`[Audit] Audio ${event} at ${position}s - Resource: ${resourceId}`);
        }}
      />
    );
  };

  // Render video content with STANAG classification overlays
  const renderVideo = () => {
    return (
      <VideoPlayer
        src={dataUrl || ''}
        classification={classification}
        displayMarking={effectiveMarking.displayMarking}
        releasabilityTo={releasabilityTo}
        watermarkText={effectiveMarking.watermarkText}
        title={title}
        onDownload={handleDownload}
        onPlaybackEvent={(event, position) => {
          // Audit logging for multimedia playback events
          console.log(`[Audit] Video ${event} at ${position}s - Resource: ${resourceId}`);
        }}
      />
    );
  };

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

  // Render content based on category
  const renderContent = () => {
    switch (category) {
      case 'image':
        return renderImage();
      case 'pdf':
        return renderPDF();
      case 'audio':
        return renderAudio();
      case 'video':
        return renderVideo();
      case 'text':
        return renderText();
      case 'markdown':
        return renderMarkdown();
      case 'docx':
        return renderDocx();
      default:
        return renderDocument();
    }
  };

  // Get category icon
  const getCategoryIcon = () => {
    const iconClass = `w-5 h-5 ${isFullscreen ? 'text-white' : ''}`;
    switch (category) {
      case 'image':
        return <ImageIcon className={`${iconClass} ${!isFullscreen && 'text-blue-600'}`} />;
      case 'pdf':
        return <FileText className={`${iconClass} ${!isFullscreen && 'text-red-600'}`} />;
      case 'audio':
        return <Music className={`${iconClass} ${!isFullscreen && 'text-orange-600'}`} />;
      case 'video':
        return <Film className={`${iconClass} ${!isFullscreen && 'text-pink-600'}`} />;
      case 'text':
        return <FileText className={`${iconClass} ${!isFullscreen && 'text-green-600'}`} />;
      case 'markdown':
        return <FileCode className={`${iconClass} ${!isFullscreen && 'text-purple-600'}`} />;
      default:
        return <File className={`${iconClass} ${!isFullscreen && 'text-gray-600'}`} />;
    }
  };

  // Main content wrapper
  const contentWrapper = (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-lg p-6 overflow-auto' : 'relative'}`}>
      {/* Header Controls */}
      <div className={`flex items-center justify-between mb-4 ${isFullscreen ? 'sticky top-0 z-30 bg-gray-800/90 backdrop-blur-md p-4 rounded-xl' : 'bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-gray-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          {getCategoryIcon()}

          <div>
            <h4 className={`font-semibold ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
              {title}
            </h4>
            <div className={`text-xs flex items-center gap-2 ${isFullscreen ? 'text-gray-300' : 'text-gray-500'}`}>
              <StandaloneClassificationBadge classification={classification} size="sm" />
              <span>•</span>
              <span>{contentType}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls for images and text */}
          {(category === 'image' || category === 'text' || category === 'markdown') && (
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
        {renderContent()}
      </div>

      {/* Fullscreen footer hint */}
      {isFullscreen && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-6 py-3 rounded-full text-sm font-medium animate-pulse z-40">
          Press <kbd className="px-2 py-1 bg-white/20 rounded mx-1">ESC</kbd> to exit fullscreen
        </div>
      )}
    </div>
  );

  // Wrap with MarkingRenderer if markings are enabled
  if (showMarkings && finalMarkingOptions.showBanners) {
    return (
      <MarkingRenderer
        classification={classification}
        releasabilityTo={releasabilityTo}
        COI={COI}
        caveats={caveats}
        displayMarking={effectiveMarking.displayMarking}
        portionMarkings={effectiveMarking.portionMarkings}
        options={finalMarkingOptions}
        showOptionsUI={!isFullscreen}
      >
        {contentWrapper}
      </MarkingRenderer>
    );
  }

  return contentWrapper;
}
