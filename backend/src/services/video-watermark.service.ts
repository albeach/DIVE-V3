/**
 * Video Watermark Service
 *
 * Burns STANAG 4774 classification markings into video files using FFmpeg.
 * This provides persistent watermarking that cannot be removed without re-encoding.
 *
 * Watermark Layout:
 * - Top banner: Classification marking (e.g., "SECRET // REL TO USA, GBR")
 * - Bottom banner: Same classification marking
 * - Center watermark: Semi-transparent diagonal text
 *
 * Reference: docs/TDR-AUDIO-VIDEO-BINDING.md
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { CLASSIFICATION_COLORS } from '../types/stanag.types';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Watermark configuration options
 */
export interface IWatermarkOptions {
  /** Classification level for color coding */
  classification: string;
  /** Full display marking text (e.g., "SECRET // REL TO USA, GBR") */
  displayMarking: string;
  /** Banner height in pixels (default: 40) */
  bannerHeight?: number;
  /** Font size for banners (default: 24) */
  bannerFontSize?: number;
  /** Center watermark font size (default: 48) */
  centerFontSize?: number;
  /** Center watermark opacity (0-1, default: 0.3) */
  centerOpacity?: number;
  /** Output quality (0-51, lower is better, default: 23) */
  outputQuality?: number;
}

/**
 * Get classification banner color
 */
function getClassificationColor(classification: string): { bg: string; text: string } {
  const normalized = classification.toUpperCase().replace('_', ' ');
  const colors = CLASSIFICATION_COLORS[normalized];

  if (colors) {
    return { bg: colors.bg, text: colors.text };
  }

  // Default to SECRET colors if not found
  return { bg: '#ef4444', text: '#ffffff' };
}

/**
 * Escape text for FFmpeg filter expressions
 */
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Burn watermarks into video file
 *
 * Uses FFmpeg to add:
 * - Top classification banner (solid background with text)
 * - Bottom classification banner (solid background with text)
 * - Center semi-transparent watermark (diagonal text)
 *
 * @param inputBuffer - Input video buffer
 * @param options - Watermark configuration options
 * @returns Watermarked video buffer
 */
export async function burnWatermarksIntoVideo(
  inputBuffer: Buffer,
  options: IWatermarkOptions
): Promise<Buffer> {
  const {
    classification,
    displayMarking,
    bannerHeight = 40,
    bannerFontSize = 24,
    centerFontSize = 48,
    centerOpacity = 0.3,
    outputQuality = 23,
  } = options;

  const tempDir = os.tmpdir();
  const inputFile = path.join(
    tempDir,
    `dive-wm-in-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`
  );
  const outputFile = path.join(
    tempDir,
    `dive-wm-out-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`
  );

  try {
    logger.info('Burning watermarks into video', {
      classification,
      displayMarking,
      inputSize: inputBuffer.length,
    });

    // Write input buffer to temp file
    fs.writeFileSync(inputFile, inputBuffer);

    // Get classification colors
    const colors = getClassificationColor(classification);
    const escapedMarking = escapeFFmpegText(displayMarking);
    const escapedClassification = escapeFFmpegText(classification);

    // Build FFmpeg filter chain
    // The filter adds:
    // 1. Top banner (black background with white text)
    // 2. Bottom banner (black background with white text)
    // 3. Center diagonal watermark (semi-transparent)
    const filterComplex = [
      // Top banner background
      `drawbox=x=0:y=0:w=iw:h=${bannerHeight}:color=black@0.8:t=fill`,
      // Top banner text
      `drawtext=text='${escapedMarking}':fontcolor=white:fontsize=${bannerFontSize}:x=(w-text_w)/2:y=${Math.floor(bannerHeight / 2) - Math.floor(bannerFontSize / 2)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
      // Bottom banner background
      `drawbox=x=0:y=ih-${bannerHeight}:w=iw:h=${bannerHeight}:color=black@0.8:t=fill`,
      // Bottom banner text
      `drawtext=text='${escapedMarking}':fontcolor=white:fontsize=${bannerFontSize}:x=(w-text_w)/2:y=h-${bannerHeight}+${Math.floor(bannerHeight / 2) - Math.floor(bannerFontSize / 2)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
      // Center watermark (semi-transparent, not rotated for simplicity)
      `drawtext=text='${escapedClassification}':fontcolor=white@${centerOpacity}:fontsize=${centerFontSize}:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
    ].join(',');

    // Process video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .outputOptions([
          '-vf',
          filterComplex,
          '-c:v',
          'libx264',
          '-crf',
          outputQuality.toString(),
          '-preset',
          'medium',
          '-c:a',
          'copy', // Copy audio without re-encoding
          '-movflags',
          '+faststart', // Enable streaming
        ])
        .output(outputFile)
        .on('start', (commandLine) => {
          logger.debug('FFmpeg started', { commandLine });
        })
        .on('progress', (progress) => {
          logger.debug('FFmpeg progress', { percent: progress.percent });
        })
        .on('end', () => {
          logger.info('Video watermarking complete');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          logger.error('FFmpeg error', {
            error: err.message,
            stdout,
            stderr,
          });
          reject(err);
        })
        .run();
    });

    // Read output file
    const outputBuffer = fs.readFileSync(outputFile);

    logger.info('Video watermarking successful', {
      inputSize: inputBuffer.length,
      outputSize: outputBuffer.length,
    });

    return outputBuffer;
  } catch (error) {
    logger.error('Failed to burn watermarks into video', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return original buffer if watermarking fails (fail-safe)
    logger.warn('Returning original video due to watermarking failure');
    return inputBuffer;
  } finally {
    // Cleanup temp files
    for (const file of [inputFile, outputFile]) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Add audio watermark (spoken classification) - Placeholder for future implementation
 *
 * This would use text-to-speech to generate a spoken classification announcement
 * at the beginning of the audio file.
 *
 * @param inputBuffer - Input audio buffer
 * @param classification - Classification level
 * @returns Audio buffer with spoken classification (or original if not implemented)
 */
export async function addAudioWatermark(
  inputBuffer: Buffer,
  classification: string
): Promise<Buffer> {
  logger.warn('Audio watermarking not yet implemented, returning original');
  return inputBuffer;
}

/**
 * Extract video thumbnail with classification overlay
 *
 * Generates a thumbnail image from the video with the classification banner.
 * Useful for preview/listing views.
 *
 * @param inputBuffer - Input video buffer
 * @param classification - Classification level
 * @param displayMarking - Full display marking text
 * @param timestamp - Timestamp to extract thumbnail from (default: 1 second)
 * @returns Thumbnail image buffer (PNG)
 */
export async function extractThumbnailWithWatermark(
  inputBuffer: Buffer,
  classification: string,
  displayMarking: string,
  timestamp: number = 1
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const inputFile = path.join(
    tempDir,
    `dive-thumb-in-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`
  );
  const outputFile = path.join(
    tempDir,
    `dive-thumb-out-${Date.now()}-${Math.random().toString(36).substring(7)}.png`
  );

  try {
    logger.debug('Extracting thumbnail with watermark', {
      classification,
      timestamp,
    });

    // Write input buffer to temp file
    fs.writeFileSync(inputFile, inputBuffer);

    const escapedMarking = escapeFFmpegText(displayMarking);

    // Extract frame and add banner
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .seekInput(timestamp)
        .outputOptions([
          '-vframes',
          '1',
          '-vf',
          `drawbox=x=0:y=0:w=iw:h=40:color=black@0.8:t=fill,drawtext=text='${escapedMarking}':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=10`,
        ])
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    // Read output file
    const thumbnailBuffer = fs.readFileSync(outputFile);

    return thumbnailBuffer;
  } catch (error) {
    logger.error('Failed to extract thumbnail', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    // Cleanup temp files
    for (const file of [inputFile, outputFile]) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Check if FFmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        logger.warn('FFmpeg not available', { error: err.message });
        resolve(false);
      } else {
        logger.debug('FFmpeg available', { formatsCount: Object.keys(formats).length });
        resolve(true);
      }
    });
  });
}

/**
 * Get video duration without full processing
 *
 * @param inputBuffer - Video buffer
 * @returns Duration in seconds
 */
export async function getVideoDuration(inputBuffer: Buffer): Promise<number> {
  const tempDir = os.tmpdir();
  const inputFile = path.join(
    tempDir,
    `dive-dur-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`
  );

  try {
    fs.writeFileSync(inputFile, inputBuffer);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  } finally {
    try {
      if (fs.existsSync(inputFile)) {
        fs.unlinkSync(inputFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
