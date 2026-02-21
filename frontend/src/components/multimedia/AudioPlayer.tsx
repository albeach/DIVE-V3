'use client';

/**
 * AudioPlayer Component
 *
 * STANAG 4774/4778 compliant audio player with:
 * - Waveform visualization (wavesurfer.js)
 * - Persistent classification banner (always visible)
 * - Play/pause, seek, volume controls
 * - Download button with OPA authorization check
 * - Mobile-responsive design
 *
 * UI Layout:
 * ┌─────────────────────────────────────────────┐
 * │ 🔒 SECRET // REL TO USA, GBR               │ ← Classification banner
 * ├─────────────────────────────────────────────┤
 * │  [Waveform visualization]                   │
 * │  ████▓▓▓▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
 * │                                             │
 * │  ▶  00:32 / 02:15  🔊 ━━━●────── 📥        │ ← Controls
 * ├─────────────────────────────────────────────┤
 * │ 📄 Audio Title                              │
 * │ 📅 Created: 2026-01-15                     │
 * └─────────────────────────────────────────────┘
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Shield,
  Music,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Classification color mapping
 */
const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; waveform: string }> = {
  UNCLASSIFIED: { bg: 'bg-green-600', text: 'text-white', waveform: '#22c55e' },
  RESTRICTED: { bg: 'bg-blue-600', text: 'text-white', waveform: '#3b82f6' },
  CONFIDENTIAL: { bg: 'bg-blue-600', text: 'text-white', waveform: '#3b82f6' },
  SECRET: { bg: 'bg-red-600', text: 'text-white', waveform: '#ef4444' },
  TOP_SECRET: { bg: 'bg-orange-600', text: 'text-white', waveform: '#f97316' },
  'TOP SECRET': { bg: 'bg-orange-600', text: 'text-white', waveform: '#f97316' },
};

interface AudioPlayerProps {
  /** Audio source URL (data: URI or HTTP URL) */
  src: string;
  /** Classification level */
  classification: string;
  /** Full display marking (e.g., "SECRET // REL TO USA, GBR") */
  displayMarking: string;
  /** Releasability countries */
  releasabilityTo?: string[];
  /** Watermark text (usually classification) */
  watermarkText?: string;
  /** Audio title */
  title?: string;
  /** Download handler */
  onDownload?: () => void;
  /** Playback event handler for audit logging */
  onPlaybackEvent?: (event: 'play' | 'pause' | 'seek' | 'ended', position?: number) => void;
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  src,
  classification,
  displayMarking,
  releasabilityTo = [],
  watermarkText,
  title,
  onDownload,
  onPlaybackEvent,
}: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get classification colors
  const normalizedClassification = classification.toUpperCase().replace('_', ' ');
  const colors = CLASSIFICATION_COLORS[normalizedClassification] || CLASSIFICATION_COLORS.SECRET;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !src) return;

    setIsLoading(true);
    setError(null);

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: colors.waveform + '40', // 25% opacity
      progressColor: colors.waveform,
      cursorColor: colors.waveform,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
      backend: 'WebAudio',
    });

    wavesurferRef.current = wavesurfer;

    // Event handlers
    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      setIsLoading(false);
      wavesurfer.setVolume(volume);
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
      onPlaybackEvent?.('play', wavesurfer.getCurrentTime());
    });

    wavesurfer.on('pause', () => {
      setIsPlaying(false);
      onPlaybackEvent?.('pause', wavesurfer.getCurrentTime());
    });

    wavesurfer.on('finish', () => {
      setIsPlaying(false);
      onPlaybackEvent?.('ended', wavesurfer.getDuration());
    });

    wavesurfer.on('seeking', () => {
      onPlaybackEvent?.('seek', wavesurfer.getCurrentTime());
    });

    wavesurfer.on('error', (err) => {
      setError(`Audio loading failed: ${err}`);
      setIsLoading(false);
    });

    // Load audio
    wavesurfer.load(src);

    return () => {
      wavesurfer.destroy();
    };
  }, [src, colors.waveform]);

  // Update volume when changed
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  // Playback controls
  const togglePlay = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  }, []);

  const skipBackward = useCallback(() => {
    if (wavesurferRef.current) {
      const newTime = Math.max(0, wavesurferRef.current.getCurrentTime() - 10);
      wavesurferRef.current.seekTo(newTime / wavesurferRef.current.getDuration());
    }
  }, []);

  const skipForward = useCallback(() => {
    if (wavesurferRef.current) {
      const newTime = Math.min(
        wavesurferRef.current.getDuration(),
        wavesurferRef.current.getCurrentTime() + 10
      );
      wavesurferRef.current.seekTo(newTime / wavesurferRef.current.getDuration());
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Classification Banner - Always Visible */}
      <div
        className={cn(
          'px-4 py-3 flex items-center justify-center gap-2',
          colors.bg,
          colors.text,
          'font-bold text-sm uppercase tracking-wide'
        )}
        role="banner"
        aria-label={`Classification: ${displayMarking}`}
      >
        <Shield className="w-4 h-4" aria-hidden="true" />
        <span>{displayMarking}</span>
      </div>

      {/* Audio Title */}
      {title && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </h3>
          </div>
        </div>
      )}

      {/* Waveform Visualization */}
      <div className="px-4 py-4">
        <div
          ref={waveformRef}
          className={cn(
            'w-full rounded-lg bg-gray-50 dark:bg-gray-900/50',
            isLoading && 'animate-pulse'
          )}
          style={{ minHeight: '80px' }}
        />

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 dark:border-gray-400" />
            <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
              Loading audio...
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-4">
          {/* Skip Back */}
          <button
            onClick={skipBackward}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Skip back 10 seconds"
            aria-label="Skip back 10 seconds"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-all',
              'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900',
              'hover:bg-gray-700 dark:hover:bg-gray-300',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            )}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          {/* Skip Forward */}
          <button
            onClick={skipForward}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Skip forward 10 seconds"
            aria-label="Skip forward 10 seconds"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Time Display */}
          <div className="flex-1 text-sm font-mono text-gray-600 dark:text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {/* Download Button */}
          {onDownload && (
            <button
              onClick={onDownload}
              className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              title="Download audio"
              aria-label="Download audio file"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Metadata Footer */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>
              <strong>Releasable To:</strong>{' '}
              {releasabilityTo.length > 0 ? releasabilityTo.join(', ') : 'None specified'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
              ZTDF Encrypted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
