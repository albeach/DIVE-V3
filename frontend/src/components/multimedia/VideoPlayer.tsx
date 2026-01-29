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
  const playerRef = useRef<any>(null); // ReactPlayer instance type

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
  const [actualMimeType, setActualMimeType] = useState<string>('');
  const [usingDataUrl, setUsingDataUrl] = useState(false);

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

    // Extract MIME type from data URL for validation
    const dataUrlMatch = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      setError('Invalid data URL format');
      setIsLoading(false);
      return;
    }

    const [, declaredMimeType, base64Data] = dataUrlMatch;

    // Validate MIME type is a video format
    if (!declaredMimeType.startsWith('video/')) {
      console.warn('[VideoPlayer] MIME type is not video:', declaredMimeType);
      setError(`Invalid video format: ${declaredMimeType}`);
      setIsLoading(false);
      return;
    }

    const dataUrlSize = src.length;
    const estimatedVideoSize = Math.round((base64Data.length * 3) / 4);

    console.log('[VideoPlayer] Starting video processing:', {
      declaredMimeType,
      base64Length: base64Data.length,
      dataUrlLength: dataUrlSize,
      estimatedVideoSize: `${Math.round(estimatedVideoSize / 1024 / 1024)} MB`,
      dataUrlSize: `${Math.round(dataUrlSize / 1024 / 1024)} MB`,
    });

    // CRITICAL TEST: Validate the data URL is actually valid
    const hasNewlines = base64Data.includes('\n') || base64Data.includes('\r');
    const hasSpaces = base64Data.includes(' ');
    const hasInvalidChars = !/^[A-Za-z0-9+/=]+$/.test(base64Data);

    console.log('[VideoPlayer] Data URL validation:', {
      startsWithDataVideo: src.startsWith('data:video/'),
      hasBase64Marker: src.includes(';base64,'),
      dataAfterMarker: src.indexOf(';base64,') > -1 ? base64Data.length : 0,
      first100CharsOfBase64: base64Data.substring(0, 100),
      last100CharsOfBase64: base64Data.substring(base64Data.length - 100),
      hasNewlines,
      hasSpaces,
      hasInvalidChars,
    });

    // If base64 has invalid characters, clean it
    if (hasNewlines || hasSpaces || hasInvalidChars) {
      console.warn('[VideoPlayer] Base64 data contains invalid characters, cleaning...');
      const cleanedBase64 = base64Data.replace(/[\r\n\s]/g, '');
      const cleanedSrc = `data:${declaredMimeType};base64,${cleanedBase64}`;
      console.log('[VideoPlayer] Cleaned base64, retrying with cleaned data URL');
      setVideoUrl(cleanedSrc);
      setActualMimeType(declaredMimeType);
      setUsingDataUrl(true);
      return;
    }

    // Check for data URL size limits (some browsers have limits)
    const MAX_DATA_URL_SIZE = 100 * 1024 * 1024; // 100MB limit for data URLs
    if (dataUrlSize > MAX_DATA_URL_SIZE) {
      console.warn('[VideoPlayer] Data URL exceeds 100MB, must convert to blob URL');
      // Don't return early - force blob conversion below
    } else if (dataUrlSize > 50 * 1024 * 1024) {
      console.warn('[VideoPlayer] Data URL is large (>50MB), may have issues in some browsers');
    }

    // Try blob URL if data URL is large, even for MP4
    const shouldUseBlob = dataUrlSize > MAX_DATA_URL_SIZE;

    // For videos, ALWAYS use blob URL to avoid sessionStorage quota issues
    // (sessionStorage was trying to cache 50MB+ videos and failing)
    console.log('[VideoPlayer] Using blob URL for video (avoids browser memory limits)');

    if (false) { // Disabled data URL path for videos
      // Data URLs work but can cause memory issues with large videos
      if (declaredMimeType === 'video/mp4' || declaredMimeType === 'video/webm') {
        console.log('[VideoPlayer] Using data URL directly for standard video format');

        // Verify the base64 data is valid before using
        try {
          const testDecode = atob(base64Data.substring(0, 100)); // Test first 100 chars
          console.log('[VideoPlayer] Base64 validation passed');

          // DIAGNOSTIC: Test if browser can play a minimal MP4 data URL
          // This will tell us if the issue is with the data or with the browser
          const testVideo = document.createElement('video');
          testVideo.src = src; // Use the actual data URL

          console.log('[VideoPlayer] Testing video element canPlayType:', {
            'video/mp4': testVideo.canPlayType('video/mp4'),
            'video/mp4; codecs="avc1.42E01E"': testVideo.canPlayType('video/mp4; codecs="avc1.42E01E"'),
            'video/mp4; codecs="avc1.4d401f"': testVideo.canPlayType('video/mp4; codecs="avc1.4d401f"'),
          });

          // Try to load metadata to see if the data URL is valid
          testVideo.addEventListener('loadedmetadata', () => {
            console.log('[VideoPlayer] TEST VIDEO: Metadata loaded successfully!', {
              duration: testVideo.duration,
              videoWidth: testVideo.videoWidth,
              videoHeight: testVideo.videoHeight,
            });
          });

          testVideo.addEventListener('error', (e) => {
            console.error('[VideoPlayer] TEST VIDEO: Failed to load!', {
              error: testVideo.error,
              code: testVideo.error?.code,
              message: testVideo.error?.message,
            });
          });

          testVideo.load(); // Trigger the test load

        } catch (err) {
          console.error('[VideoPlayer] Base64 validation failed:', err);
          setError('Invalid base64 encoding in video data');
          setIsLoading(false);
          return;
        }

        setVideoUrl(src);
        setActualMimeType(declaredMimeType);
        setUsingDataUrl(true);
        return;
      }
    }

    // For other formats or if we need blob URL, proceed with conversion
    try {
      const estimatedSize = Math.round((base64Data.length * 3) / 4);
      console.log('[VideoPlayer] Converting to blob URL:', {
        mimeType: declaredMimeType,
        base64Length: base64Data.length,
        estimatedSize: `${Math.round(estimatedSize / 1024 / 1024)} MB`,
        first50Chars: base64Data.substring(0, 50),
      });

      // Convert base64 to binary using more efficient method for large files
      let byteArray: Uint8Array;
      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        byteArray = new Uint8Array(byteNumbers);

        console.log('[VideoPlayer] Binary conversion successful:', {
          byteArrayLength: byteArray.length,
          first20Bytes: Array.from(byteArray.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
        });

        // Try to detect video codec from MP4 container
        if (declaredMimeType === 'video/mp4') {
          const videoData = Array.from(byteArray.slice(0, 2000)); // Check first 2KB
          const videoString = String.fromCharCode(...videoData);

          // Log the actual bytes we're searching through
          console.log('[VideoPlayer] MP4 header analysis:', {
            first100Chars: videoString.substring(0, 100),
            containsAvc1: videoString.includes('avc1'),
            containsHvc1: videoString.includes('hvc1'),
            containsHev1: videoString.includes('hev1'),
            containsVp09: videoString.includes('vp09'),
            containsAv01: videoString.includes('av01'),
            hexDump: Array.from(byteArray.slice(0, 100))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' '),
          });

          // Check for common codec identifiers in ftyp/moov boxes
          const codecs = {
            'avc1': 'H.264 (widely supported)',
            'hvc1': 'H.265/HEVC (limited browser support)',
            'hev1': 'H.265/HEVC (limited browser support)',
            'vp09': 'VP9 (good browser support)',
            'av01': 'AV1 (modern browsers only)',
          };

          let detectedCodec = 'unknown';
          for (const [codecId, codecName] of Object.entries(codecs)) {
            if (videoString.includes(codecId)) {
              detectedCodec = codecName;
              console.log(`[VideoPlayer] *** DETECTED CODEC: ${codecName} (found '${codecId}' in binary) ***`);
              break;
            }
          }

          if (detectedCodec === 'unknown') {
            console.warn('[VideoPlayer] Could not detect codec from MP4 header - assuming H.264');
            detectedCodec = 'H.264 (assumed)';
          }

          if (detectedCodec.includes('H.265') || detectedCodec.includes('HEVC')) {
            console.warn('[VideoPlayer] ⚠️ WARNING: H.265/HEVC video detected - not widely supported in browsers!');
            console.warn('[VideoPlayer] Consider re-encoding to H.264 for maximum compatibility');
          } else if (detectedCodec.includes('H.264')) {
            console.log('[VideoPlayer] ✅ H.264 detected - should work in all browsers');
          }
        }
      } catch (decodeErr) {
        console.error('[VideoPlayer] Base64 decode error:', decodeErr);
        console.log('[VideoPlayer] Falling back to data URL');
        setVideoUrl(src);
        setActualMimeType(declaredMimeType);
        setUsingDataUrl(true);
        return;
      }

      // Create blob with explicit video MIME type
      const blob = new Blob([byteArray], { type: declaredMimeType });

      // Verify blob was created successfully
      if (blob.size === 0) {
        console.error('[VideoPlayer] Blob is empty, falling back to data URL');
        setVideoUrl(src);
        setActualMimeType(declaredMimeType);
        setUsingDataUrl(true);
        return;
      }

      // Check file signature to verify format matches MIME type
      const signature = Array.from(byteArray.slice(0, 12))
        .map(b => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ');

      console.log('[VideoPlayer] File signature:', signature);

      // Common video signatures for validation
      const videoSignatures: Record<string, string[]> = {
        'video/mp4': ['0x00 0x00 0x00', 'ftyp'], // MP4 starts with ftyp box
        'video/webm': ['0x1a 0x45 0xdf 0xa3'], // WebM/Matroska EBML header
        'video/ogg': ['0x4f 0x67 0x67 0x53'], // OGG "OggS"
      };

      // Verify signature (non-blocking, just warning)
      const expectedSigs = videoSignatures[declaredMimeType];
      let detectedMimeType = declaredMimeType;

      if (expectedSigs && !expectedSigs.some(sig => signature.includes(sig))) {
        console.warn(`[VideoPlayer] File signature doesn't match expected format for ${declaredMimeType}`, {
          signature,
          expectedSignatures: expectedSigs,
        });

        // Try to detect actual format from signature
        if (signature.includes('ftyp')) {
          console.log('[VideoPlayer] Detected MP4 signature, overriding MIME type');
          detectedMimeType = 'video/mp4';
        } else if (signature.includes('0x1a 0x45 0xdf 0xa3')) {
          console.log('[VideoPlayer] Detected WebM signature, overriding MIME type');
          detectedMimeType = 'video/webm';
        } else if (signature.includes('0x4f 0x67 0x67 0x53')) {
          console.log('[VideoPlayer] Detected OGG signature, overriding MIME type');
          detectedMimeType = 'video/ogg';
        }
      }

      setActualMimeType(detectedMimeType);

      // Create blob with detected/corrected MIME type
      const blobWithCorrectType = detectedMimeType !== declaredMimeType
        ? new Blob([byteArray], { type: detectedMimeType })
        : blob;

      // Create object URL
      const blobUrl = URL.createObjectURL(blobWithCorrectType);
      setVideoUrl(blobUrl);
      setUsingDataUrl(false);

      console.log('[VideoPlayer] Created blob URL successfully:', {
        originalMimeType: declaredMimeType,
        detectedMimeType: detectedMimeType,
        blobSize: `${Math.round(blobWithCorrectType.size / 1024 / 1024)} MB`,
        blobUrl: blobUrl.substring(0, 50) + '...',
      });

      // Cleanup on unmount
      return () => {
        console.log('[VideoPlayer] Revoking blob URL');
        URL.revokeObjectURL(blobUrl);
      };
    } catch (err) {
      console.error('[VideoPlayer] Error converting data URL to blob:', err);
      console.log('[VideoPlayer] Falling back to data URL');
      // Fallback: use data URL directly
      setVideoUrl(src);
      setActualMimeType(declaredMimeType);
      setUsingDataUrl(true);
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
    (state: { playedSeconds: number; played?: number; loaded?: number; loadedSeconds?: number }) => {
      if (!seeking) {
        setCurrentTime(state.playedSeconds);
      }
    },
    [seeking]
  );

  const handleError = useCallback((err: any) => {
    console.error('[VideoPlayer] Error:', err);
    console.error('[VideoPlayer] Error context:', {
      src: src?.substring(0, 100) + '...',
      videoUrl: videoUrl?.substring(0, 100) + '...',
      actualMimeType,
      usingDataUrl,
      errorType: err?.constructor?.name,
      errorCode: err?.code,
      errorMessage: err?.message,
    });

    // Map MediaError codes to user-friendly messages
    let errorMessage = 'Unknown error';
    if (err && typeof err === 'object' && 'code' in err) {
      const mediaError = err as MediaError;
      console.error('[VideoPlayer] MediaError details:', {
        code: mediaError.code,
        message: mediaError.message,
        MEDIA_ERR_ABORTED: MediaError.MEDIA_ERR_ABORTED,
        MEDIA_ERR_NETWORK: MediaError.MEDIA_ERR_NETWORK,
        MEDIA_ERR_DECODE: MediaError.MEDIA_ERR_DECODE,
        MEDIA_ERR_SRC_NOT_SUPPORTED: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED,
      });

      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video playback aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error while loading video';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decoding error - format may be unsupported';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported by browser';
          // Add detailed codec support information
          const videoElement = document.createElement('video');
          const codecs = [
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // H.264 Baseline + AAC
            'video/mp4; codecs="avc1.4d401f"', // H.264 Main Profile
            'video/mp4; codecs="avc1.640028"', // H.264 High Profile
            'video/mp4; codecs="hvc1"', // H.265/HEVC
            'video/mp4; codecs="hev1"', // H.265/HEVC alternate
            'video/webm; codecs="vp8, vorbis"', // VP8 + Vorbis
            'video/webm; codecs="vp9"', // VP9
            'video/ogg; codecs="theora"', // Theora
          ];
          const supported = codecs.filter(c => videoElement.canPlayType(c) !== '');
          console.error('[VideoPlayer] Browser codec support:', {
            supportedCodecs: supported,
            actualMimeType: actualMimeType || 'unknown',
            allCodecTests: codecs.map(c => ({
              codec: c,
              canPlay: videoElement.canPlayType(c),
            })),
          });

          // Check if H.265 is NOT supported (common issue)
          const supportsH265 = videoElement.canPlayType('video/mp4; codecs="hvc1"') !== '';
          const supportsH264Baseline = videoElement.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '';
          const supportsH264Main = videoElement.canPlayType('video/mp4; codecs="avc1.4d401f"') !== '';
          const supportsH264High = videoElement.canPlayType('video/mp4; codecs="avc1.640028"') !== '';

          console.error('[VideoPlayer] *** BROWSER CODEC SUPPORT DETAILED ***', {
            'H.265/HEVC': supportsH265 ? '✅ SUPPORTED' : '❌ NOT SUPPORTED',
            'H.264 Baseline': supportsH264Baseline ? '✅ SUPPORTED' : '❌ NOT SUPPORTED',
            'H.264 Main': supportsH264Main ? '✅ SUPPORTED' : '❌ NOT SUPPORTED',
            'H.264 High': supportsH264High ? '✅ SUPPORTED' : '❌ NOT SUPPORTED',
          });

          if (!supportsH265) {
            console.warn('[VideoPlayer] Browser does NOT support H.265/HEVC codec');
            console.warn('[VideoPlayer] If this is an H.265 video, it needs to be re-encoded to H.264');
            errorMessage += ' (H.265/HEVC codec not supported - re-encode to H.264)';
          } else if (supported.length === 0) {
            errorMessage += ' (Browser does not support any common video codecs)';
          } else {
            errorMessage += ` (Browser supports: ${supported.map(c => c.split(';')[0]).join(', ')})`;
          }
          break;
        default:
          errorMessage = mediaError.message || 'Media element error';
      }
    } else if (err?.message) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    setError(`Video loading failed: ${errorMessage}`);
    setIsLoading(false);
  }, [actualMimeType]);

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
          preload="metadata"
          crossOrigin="anonymous"
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
            console.log('[VideoPlayer] Video loaded successfully:', {
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
              readyState: video.readyState,
              networkState: video.networkState,
            });
          }}
          onLoadStart={() => {
            console.log('[VideoPlayer] Video load started');
          }}
          onLoadedData={() => {
            console.log('[VideoPlayer] Video data loaded');
          }}
          onError={(e) => {
            const video = e.currentTarget;
            console.error('[VideoPlayer] Video error event:', {
              error: video.error,
              readyState: video.readyState,
              networkState: video.networkState,
              currentSrc: video.currentSrc?.substring(0, 100),
            });
            handleError(video.error || new Error('Video playback error'));
          }}
          onCanPlay={() => {
            console.log('[VideoPlayer] Video CAN PLAY - ready for playback');
            setIsLoading(false);
          }}
          onCanPlayThrough={() => {
            console.log('[VideoPlayer] Video CAN PLAY THROUGH - fully buffered');
          }}
          onWaiting={() => {
            console.log('[VideoPlayer] Video WAITING - buffering');
          }}
          onStalled={() => {
            console.error('[VideoPlayer] Video STALLED - network issue');
          }}
          onSuspend={() => {
            console.log('[VideoPlayer] Video SUSPEND - loading paused');
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
              <p className="text-white text-sm">
                {usingDataUrl ? 'Loading video (data URL)...' : 'Loading video (blob URL)...'}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="text-center text-white p-6 max-w-lg">
              <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-red-400 text-lg mb-4">{error}</p>
              <div className="text-sm text-gray-400 mb-4 space-y-1">
                {actualMimeType && (
                  <p>Format: <span className="font-mono">{actualMimeType}</span></p>
                )}
                <p>Method: <span className="font-mono">{usingDataUrl ? 'Data URL' : 'Blob URL'}</span></p>
              </div>
              {onDownload && (
                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-3">
                    {usingDataUrl
                      ? 'The browser cannot decode this video. This is likely an H.265/HEVC video, which most browsers do not support. Download and use VLC or re-encode to H.264.'
                      : 'Your browser may not support this video codec. Try downloading the file to play it with VLC or another media player.'}
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={onDownload}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors w-full justify-center"
                    >
                      <Download className="w-5 h-5" />
                      Download Video
                    </button>
                    <div className="text-xs text-gray-500 text-left bg-gray-900/50 p-3 rounded">
                      <p className="font-semibold mb-1">💡 If this is an H.265/HEVC video:</p>
                      <p className="font-mono text-[10px] mb-1">
                        ffmpeg -i input.mp4 -c:v libx264 -crf 23 output_h264.mp4
                      </p>
                      <p className="text-[10px]">Then re-upload the H.264 version for browser playback</p>
                    </div>
                  </div>
                </div>
              )}
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
