'use client';

/**
 * PowerPoint Viewer Component
 * Displays PPTX slides with navigation
 * Supports classification markings and watermarks
 */

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Download, Presentation, ChevronLeft, ChevronRight, Shield } from 'lucide-react';

interface PowerPointViewerProps {
  content: string; // Base64 encoded PPTX file
  title: string;
  classification: string;
  onDownload: () => void;
  watermarkText: string;
  watermarkOpacity?: number;
  showWatermark?: boolean;
}

interface Slide {
  number: number;
  content: string;
  notes?: string;
}

export default function PowerPointViewer({
  content,
  title,
  classification,
  onDownload,
  watermarkText,
  watermarkOpacity = 0.15,
  showWatermark = true,
}: PowerPointViewerProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!content) {
      setError('No content provided');
      setLoading(false);
      return;
    }

    parsePPTX(content);
  }, [content]);

  const parsePPTX = async (base64Content: string) => {
    try {
      // Decode base64 content
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Load PPTX as ZIP
      const zip = await JSZip.loadAsync(bytes);

      // Get slide files
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });

      if (slideFiles.length === 0) {
        setError('No slides found in presentation');
        setLoading(false);
        return;
      }

      // Extract slide content
      const slideData: Slide[] = await Promise.all(
        slideFiles.map(async (filename, index) => {
          const file = zip.files[filename];
          const xmlContent = await file.async('string');

          // Extract text from XML (simplified extraction)
          const textMatches = xmlContent.match(/<a:t>([^<]+)<\/a:t>/g) || [];
          const slideText = textMatches
            .map(match => match.replace(/<\/?a:t>/g, ''))
            .join('\n');

          return {
            number: index + 1,
            content: slideText || '(No text content)',
            notes: undefined,
          };
        })
      );

      setSlides(slideData);
      setLoading(false);
    } catch (err) {
      console.error('Error parsing PPTX file:', err);
      setError('Failed to parse PowerPoint file: ' + (err as Error).message);
      setLoading(false);
    }
  };

  const goToPrevSlide = () => {
    setCurrentSlide(prev => Math.max(0, prev - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-12 text-center border-2 border-orange-200">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-orange-100 rounded-full mb-6">
          <div className="w-12 h-12 border-4 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">Loading Presentation...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-12 text-center border-2 border-red-200">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-red-100 rounded-full mb-6">
          <Presentation className="w-12 h-12 text-red-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-3">Preview Unavailable</h3>
        <p className="text-red-600 mb-6">{error}</p>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all hover:shadow-lg"
        >
          <Download className="w-5 h-5" />
          Download Presentation
        </button>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-12 text-center border-2 border-gray-200">
        <p className="text-gray-600">No slides found in presentation</p>
      </div>
    );
  }

  const currentSlideData = slides[currentSlide];

  return (
    <div className="relative bg-white rounded-xl border-2 border-orange-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-200">
        <div className="flex items-center gap-3">
          <Presentation className="w-6 h-6 text-orange-600" />
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                {classification}
              </span>
              <span className="mx-2">•</span>
              {slides.length} slide{slides.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 transition-all hover:shadow-md"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Watermark Layer */}
      {showWatermark && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
          style={{
            background: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 200px,
              rgba(249, 115, 22, ${watermarkOpacity}) 200px,
              rgba(249, 115, 22, ${watermarkOpacity}) 400px
            )`,
          }}
        >
          <div
            className="text-6xl font-bold text-orange-700 transform -rotate-45 select-none"
            style={{ opacity: watermarkOpacity }}
          >
            {watermarkText}
          </div>
        </div>
      )}

      {/* Slide Content */}
      <div className="relative min-h-[500px] p-8 bg-gradient-to-br from-gray-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-xl p-12 min-h-[400px] border-2 border-gray-200">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Slide {currentSlideData.number}
            </h4>
            <span className="text-xs text-gray-400">
              {currentSlide + 1} / {slides.length}
            </span>
          </div>

          <div className="prose prose-lg max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
              {currentSlideData.content}
            </pre>
          </div>

          {currentSlideData.notes && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-500 mb-2">Speaker Notes:</p>
              <p className="text-sm text-gray-600">{currentSlideData.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-t border-gray-200">
        <button
          onClick={goToPrevSlide}
          disabled={currentSlide === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-orange-600 w-6'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goToNextSlide}
          disabled={currentSlide === slides.length - 1}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center gap-2 p-3 bg-orange-50 border-t border-orange-200 text-xs text-orange-700">
        <Shield className="w-4 h-4" />
        <span>Text-only preview • Full formatting preserved in download</span>
      </div>
    </div>
  );
}
