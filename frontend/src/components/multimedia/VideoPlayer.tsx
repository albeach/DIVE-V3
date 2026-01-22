'use client';

/**
 * VideoPlayer Component
 *
 * STANAG 4774/4778 compliant video player with:
 * - Top/bottom classification banners (sticky, always visible)
 * - Center watermark (semi-transparent, rotated -45°)
 * - Custom controls (play, pause, seek, volume, fullscreen)
 * - Fullscreen mode preserves classification markings
 * - Quality selector (future: HLS/DASH support)
 *
 * UI Layout:
 * ┌─────────────────────────────────────────────┐
 * │ 🔒 SECRET // REL TO USA, GBR, FRA          │ ← Top banner
 * ├─────────────────────────────────────────────┤
 * │                                             │
 * │          [Video Content]                    │
 * │     🔐 CLASSIFICATION WATERMARK             │ ← Center watermark
 * │                                             │
 * ├─────────────────────────────────────────────┤
 * │ 🔒 SECRET // REL TO USA, GBR, FRA          │ ← Bottom banner
 * ├─────────────────────────────────────────────┤
 * │  ▶  05:42 / 12:30  🔊 ━━●────  ⛶ 📥       │ ← Controls
 * └─────────────────────────────────────────────┘
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  Shield,
  Film,
  SkipBack,
  SkipForward,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Classification color mapping
 */
const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; watermark: string }> = {
  UNCLASSIFIED: { bg: 'bg-green-600', text: 'text-white', watermark: 'rgba(34, 197, 94, 0.3)' },
  RESTRICTED: { bg: 'bg-blue-600', text: 'text-white', watermark: 'rgba(59, 130, 246, 0.3)' },
  CONFIDENTIAL: { bg: 'bg-blue-600', text: 'text-white', watermark: 'rgba(59, 130, 246, 0.3)' },
  SECRET: { bg: 'bg-red-600', text: 'text-white', watermark: 'rgba(239, 68, 68, 0.3)' },
  TOP_SECRET: { bg: 'bg-orange-600', text: 'text-white', watermark: 'rgba(249, 115, 22, 0.3)' },
  'TOP SECRET': { bg: 'bg-orange-600', text: 'text-white', watermark: 'rgba(249, 115, 22, 0.3)' },
};

interface VideoPlayerProps {
  /** Video source URL (data: URI or HTTP URL) */
  src: string;
  /** Classification level */
  classification: string;
  /** Full display marking (e.g., "SECRET // REL TO USA, GBR") */
  displayMarking: string;
  /** Releasability countries */
  releasabilityTo?: string[];
  /** Watermark text (usually classification) */
  watermarkText?: string;
  /** Video title */
  title?: string;
  /** Poster image URL */
  poster?: string;
  /** Download handler */
  onDownload?: () => void;
  /** Playback event handler for audit logging */
  onPlaybackEvent?: (event: 'play' | 'pause' | 'seek' | 'ended', position?: number) => void;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  src,
  classification,
  displayMarking,
  releasabilityTo = [],
  watermarkText,
  title,
  poster,
  onDownload,
  onPlaybackEvent,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReactPlayer>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Get classification colors
  const normalizedClassification = classification.toUpperCase().replace('_', ' ');
  const colors = CLASSIFICATION_COLORS[normalizedClassification] || CLASSIFICATION_COLORS.SECRET;
  const effectiveWatermark = watermarkText || classification;

  // Convert data URL to blob URL for better video playback
  useEffect(() => {
    if (!src) {
      setError('No video source provided');
      setIsLoading(false);
      return;
    }

    if (!src.startsWith('data:')) {
      // Regular URL, use directly
      setVideoUrl(src);
      return;
    }

    try {
      // Extract MIME type and base64 data from data URL
      const match = src.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        setError('Invalid data URL format');
        setIsLoading(false);
        return;
      }

      const [, mimeType, base64Data] = match;

      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and object URL (better for large videos)
      const blob = new Blob([bytes], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      setVideoUrl(blobUrl);

      console.log('[VideoPlayer] Created blob URL:', {
        mimeType,
        blobSize: blob.size,
        blobUrl: blobUrl.substring(0, 50),
        originalSrcLength: src.length,
      });

      // Test if the video is actually playable
      const testVideo = document.createElement('video');
      testVideo.src = blobUrl;
      testVideo.addEventListener('loadedmetadata', () => {
        console.log('[VideoPlayer] Video metadata loaded successfully:', {
          duration: testVideo.duration,
          videoWidth: testVideo.videoWidth,
          videoHeight: testVideo.videoHeight,
        });
      });
      testVideo.addEventListener('error', (e) => {
        console.error('[VideoPlayer] Video element error:', {
          error: testVideo.error,
          code: testVideo.error?.code,
          message: testVideo.error?.message,
        });
      });

      // Cleanup on unmount
      return () => {
        URL.revokeObjectURL(blobUrl);
      };
    } catch (err) {
      console.error('[VideoPlayer] Error converting data URL to blob:', err);
      setError(`Failed to load video: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  }, [src]);

  // Hide controls after 3 seconds of no interaction
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      return;
    }

    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [isPlaying, showControls]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Playback handlers
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    onPlaybackEvent?.('play', currentTime);
  }, [currentTime, onPlaybackEvent]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPlaybackEvent?.('pause', currentTime);
  }, [currentTime, onPlaybackEvent]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    onPlaybackEvent?.('ended', duration);
  }, [duration, onPlaybackEvent]);

  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      if (!seeking) {
        setCurrentTime(state.playedSeconds);
      }
    },
    [seeking]
  );

  const handleError = useCallback((err: any) => {
    console.error('[VideoPlayer] Error:', err);
    const errorMessage = err?.message || err?.toString() || 'Unknown error';
    setError(`Video loading failed: ${errorMessage}`);
    setIsLoading(false);
  }, []);

  const handleReady = useCallback(() => {
    console.log('[VideoPlayer] Player ready');
    setIsLoading(false);
    // Get duration from player ref after ready
    if (playerRef.current) {
      const dur = playerRef.current.getDuration();
      if (dur && dur > 0) {
        setDuration(dur);
        console.log('[VideoPlayer] Duration set:', dur);
      }
    }
  }, []);

  // Fallback timeout if video doesn't load
  useEffect(() => {
    if (!videoUrl) return;

    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[VideoPlayer] Loading timeout - video may not be playable');
        setIsLoading(false);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [videoUrl, isLoading]);

  // Sync video element properties with state
  useEffect(() => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement) {
      videoElement.volume = volume;
      videoElement.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Control handlers
  const togglePlay = useCallback(() => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement) {
      if (isPlaying) {
        videoElement.pause();
      } else {
        videoElement.play().catch(err => {
          console.error('[VideoPlayer] Play failed:', err);
          setError(`Playback failed: ${err.message}`);
        });
      }
    }
  }, [isPlaying]);

  const skipBackward = useCallback(() => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement) {
      const newTime = Math.max(0, currentTime - 10);
      videoElement.currentTime = newTime;
      onPlaybackEvent?.('seek', newTime);
    }
  }, [currentTime, onPlaybackEvent]);

  const skipForward = useCallback(() => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement) {
      const newTime = Math.min(duration, currentTime + 10);
      videoElement.currentTime = newTime;
      onPlaybackEvent?.('seek', newTime);
    }
  }, [currentTime, duration, onPlaybackEvent]);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSeeking(true);
    setCurrentTime(parseFloat(e.target.value));
  }, []);

  const handleSeekMouseUp = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      setSeeking(false);
      const videoElement = containerRef.current?.querySelector('video');
      if (videoElement) {
        const target = e.target as HTMLInputElement;
        videoElement.currentTime = parseFloat(target.value);
        onPlaybackEvent?.('seek', parseFloat(target.value));
      }
    },
    [onPlaybackEvent]
  );

  const toggleMute = useCallback(() => {
    const videoElement = containerRef.current?.querySelector('video');
    if (videoElement) {
      videoElement.muted = !isMuted;
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      const videoElement = containerRef.current?.querySelector('video');
      if (videoElement) {
        videoElement.volume = newVolume;
        videoElement.muted = newVolume === 0;
      }
      setVolume(newVolume);
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
      }
    },
    [isMuted]
  );

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  // Classification Banner Component
  const ClassificationBanner = ({ position }: { position: 'top' | 'bottom' }) => (
    <div
      className={cn(
        'w-full px-4 py-2 flex items-center justify-center gap-2',
        colors.bg,
        colors.text,
        'font-bold text-sm uppercase tracking-wide',
        'z-20 pointer-events-none',
        position === 'top' ? 'rounded-t-xl' : ''
      )}
      role="banner"
      aria-label={`Classification: ${displayMarking}`}
    >
      <Shield className="w-4 h-4" aria-hidden="true" />
      <span>{displayMarking}</span>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full bg-black rounded-xl overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50 rounded-none'
      )}
      onMouseMove={handleMouseMove}
    >
      {/* Top Classification Banner - Always Visible */}
      <ClassificationBanner position="top" />

      {/* Video Container */}
      <div className="relative aspect-video bg-gray-900">
        {/* Native HTML5 Video (simpler, more reliable than ReactPlayer for blob URLs) */}
        {videoUrl ? (
          <video
            ref={(el) => {
              if (el && playerRef.current !== el as any) {
                // Wrap native element to match ReactPlayer ref interface
                (playerRef as any).current = {
                  getDuration: () => el.duration,
                  getCurrentTime: () => el.currentTime,
                  seekTo: (seconds: number) => { el.currentTime = seconds; },
                };
              }
            }}
            src={videoUrl}
          className="w-full h-full"
          controls={false}
          autoPlay={false}
          playsInline
          disablePictureInPicture
          controlsList="nodownload"
          poster={poster}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            handleProgress({
              played: video.currentTime / video.duration,
              playedSeconds: video.currentTime,
              loaded: video.buffered.length > 0 ? video.buffered.end(0) / video.duration : 0,
              loadedSeconds: video.buffered.length > 0 ? video.buffered.end(0) : 0,
            });
          }}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            setDuration(video.duration);
            setIsLoading(false);
            console.log('[VideoPlayer] Video loaded:', {
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            });
          }}
          onError={(e) => {
            const video = e.currentTarget;
            handleError(video.error || new Error('Video playback error'));
          }}
        />
        ) : null}

        {/* Center Watermark Overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          aria-hidden="true"
        >
          <div
            className="text-4xl md:text-6xl font-bold uppercase tracking-widest opacity-30"
            style={{
              color: colors.watermark.replace('0.3', '1'),
              transform: 'rotate(-45deg)',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {effectiveWatermark}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
              <p className="text-white text-sm">Loading video...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="text-center text-white p-4">
              <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 z-20',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          {/* Progress Bar */}
          <div className="mb-3">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeekChange}
              onMouseUp={handleSeekMouseUp}
              className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${colors.bg.replace('bg-', '')} ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) ${(currentTime / duration) * 100}%)`,
              }}
              aria-label="Video progress"
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-3">
            {/* Skip Back */}
            <button
              onClick={skipBackward}
              className="p-2 text-white/80 hover:text-white transition-colors"
              title="Skip back 10 seconds"
              aria-label="Skip back 10 seconds"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* Skip Forward */}
            <button
              onClick={skipForward}
              className="p-2 text-white/80 hover:text-white transition-colors"
              title="Skip forward 10 seconds"
              aria-label="Skip forward 10 seconds"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Time Display */}
            <div className="flex-1 text-sm font-mono text-white/80">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="p-2 text-white/80 hover:text-white transition-colors"
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
                className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                aria-label="Volume"
              />
            </div>

            {/* Settings (placeholder for future quality selector) */}
            <button
              className="p-2 text-white/80 hover:text-white transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Download */}
            {onDownload && (
              <button
                onClick={onDownload}
                className="p-2 text-white/80 hover:text-white transition-colors"
                title="Download video"
                aria-label="Download video file"
              >
                <Download className="w-5 h-5" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/80 hover:text-white transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Classification Banner - Always Visible */}
      <ClassificationBanner position="bottom" />

      {/* Metadata Footer */}
      <div className="px-4 py-3 bg-gray-900 border-t border-gray-800">
        <div className="flex items-center justify-between text-xs text-gray-400">
          {title && (
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4" />
              <span className="font-medium text-gray-200">{title}</span>
            </div>
          )}
          <div className="flex items-center gap-4">
            <span>
              <strong>REL TO:</strong>{' '}
              {releasabilityTo.length > 0 ? releasabilityTo.join(', ') : 'None'}
            </span>
            <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-medium">
              ZTDF Encrypted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
