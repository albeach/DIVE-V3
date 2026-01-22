/**
 * Multimedia Metadata Service
 *
 * Extracts metadata from audio and video files using:
 * - music-metadata: Audio metadata extraction (MP3, M4A, WAV, OGG, WebM audio)
 * - fluent-ffmpeg: Video metadata extraction (MP4, WebM, OGG video)
 *
 * STANAG 4774/4778 Enhancement:
 * - Detects existing STANAG labels in file metadata
 * - Extracts duration, codec, bitrate for policy enforcement
 *
 * Reference: docs/TDR-AUDIO-VIDEO-BINDING.md
 */

import * as musicMetadata from 'music-metadata';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Multimedia metadata interface
 */
export interface IMultimediaMetadata {
    duration?: number;        // seconds
    bitrate?: number;         // kbps
    codec?: string;           // 'h264', 'aac', 'mp3', etc.
    resolution?: string;      // '1920x1080' for video
    sampleRate?: number;      // Hz for audio
    channels?: number;        // 1 (mono), 2 (stereo), etc.
    hasAudio?: boolean;       // for video files
    hasVideo?: boolean;       // for container formats
    format?: string;          // 'mp4', 'webm', 'mp3', etc.
    title?: string;           // existing title tag
    artist?: string;          // existing artist tag
    album?: string;           // existing album tag
    year?: number;            // existing year tag
    existingClassification?: string;  // if STANAG label found
}

/**
 * Audio metadata extraction result
 */
export interface IAudioMetadata extends IMultimediaMetadata {
    lossless?: boolean;
    bitsPerSample?: number;
    nativeTags?: Record<string, string[]>;
}

/**
 * Video metadata extraction result
 */
export interface IVideoMetadata extends IMultimediaMetadata {
    width?: number;
    height?: number;
    frameRate?: number;
    aspectRatio?: string;
    videoCodec?: string;
    audioCodec?: string;
}

/**
 * Extract metadata from audio file buffer
 *
 * Uses music-metadata library for comprehensive audio format support.
 * Supports: MP3, M4A, WAV, OGG Vorbis, WebM audio, FLAC, etc.
 *
 * @param buffer - Audio file buffer
 * @param mimeType - MIME type of the audio file
 * @returns Extracted audio metadata
 */
export async function extractAudioMetadata(
    buffer: Buffer,
    mimeType: string
): Promise<IAudioMetadata> {
    try {
        logger.debug('Extracting audio metadata', { mimeType, bufferSize: buffer.length });

        // Parse buffer directly
        const metadata = await musicMetadata.parseBuffer(buffer, { mimeType });

        // Extract native tags for STANAG label detection
        const nativeTags: Record<string, string[]> = {};
        for (const [tagType, tags] of Object.entries(metadata.native)) {
            nativeTags[tagType] = tags.map(t => `${t.id}=${t.value}`);
        }

        // Check for existing classification in tags
        const existingClassification = detectClassificationInTags(metadata);

        const result: IAudioMetadata = {
            duration: metadata.format.duration,
            bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
            codec: metadata.format.codec,
            sampleRate: metadata.format.sampleRate,
            channels: metadata.format.numberOfChannels,
            format: metadata.format.container,
            lossless: metadata.format.lossless,
            bitsPerSample: metadata.format.bitsPerSample,
            hasAudio: true,
            hasVideo: false,

            // Common tags
            title: metadata.common.title,
            artist: metadata.common.artist,
            album: metadata.common.album,
            year: metadata.common.year,

            // Native tags for debugging
            nativeTags,

            // STANAG detection
            existingClassification,
        };

        logger.info('Audio metadata extracted', {
            duration: result.duration,
            codec: result.codec,
            bitrate: result.bitrate,
            hasExistingClassification: !!existingClassification,
        });

        return result;
    } catch (error) {
        logger.error('Failed to extract audio metadata', {
            error: error instanceof Error ? error.message : 'Unknown error',
            mimeType,
        });
        throw new Error(`Audio metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extract metadata from video file buffer
 *
 * Uses fluent-ffmpeg with ffprobe for video metadata extraction.
 * Supports: MP4, WebM, OGG Theora, etc.
 *
 * @param buffer - Video file buffer
 * @param mimeType - MIME type of the video file
 * @returns Extracted video metadata
 */
export async function extractVideoMetadata(
    buffer: Buffer,
    mimeType: string
): Promise<IVideoMetadata> {
    // Write buffer to temp file for ffprobe
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `dive-video-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    try {
        logger.debug('Extracting video metadata', { mimeType, bufferSize: buffer.length });

        // Write to temp file
        fs.writeFileSync(tempFile, buffer);

        // Use ffprobe to extract metadata
        const metadata = await new Promise<IVideoMetadata>((resolve, reject) => {
            ffmpeg.ffprobe(tempFile, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Find video and audio streams
                const videoStream = data.streams.find(s => s.codec_type === 'video');
                const audioStream = data.streams.find(s => s.codec_type === 'audio');

                const result: IVideoMetadata = {
                    duration: data.format.duration,
                    bitrate: data.format.bit_rate ? Math.round(parseInt(data.format.bit_rate as string) / 1000) : undefined,
                    format: data.format.format_name,
                    hasVideo: !!videoStream,
                    hasAudio: !!audioStream,
                };

                // Video stream metadata
                if (videoStream) {
                    result.width = videoStream.width;
                    result.height = videoStream.height;
                    result.resolution = `${videoStream.width}x${videoStream.height}`;
                    result.videoCodec = videoStream.codec_name;
                    result.codec = videoStream.codec_name;

                    // Parse frame rate (can be "30/1" format)
                    if (videoStream.r_frame_rate) {
                        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                        result.frameRate = den ? num / den : num;
                    }

                    // Aspect ratio
                    if (videoStream.display_aspect_ratio) {
                        result.aspectRatio = videoStream.display_aspect_ratio;
                    }
                }

                // Audio stream metadata
                if (audioStream) {
                    result.audioCodec = audioStream.codec_name;
                    result.sampleRate = audioStream.sample_rate;
                    result.channels = audioStream.channels;
                }

                // Check format tags for title
                if (data.format.tags) {
                    result.title = (data.format.tags as any).title;
                    result.artist = (data.format.tags as any).artist;
                }

                resolve(result);
            });
        });

        logger.info('Video metadata extracted', {
            duration: metadata.duration,
            resolution: metadata.resolution,
            videoCodec: metadata.videoCodec,
            audioCodec: metadata.audioCodec,
            hasAudio: metadata.hasAudio,
        });

        return metadata;
    } catch (error) {
        logger.error('Failed to extract video metadata', {
            error: error instanceof Error ? error.message : 'Unknown error',
            mimeType,
        });
        throw new Error(`Video metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (cleanupError) {
            logger.warn('Failed to clean up temp file', { tempFile });
        }
    }
}

/**
 * Extract multimedia metadata (auto-detect audio vs video)
 *
 * @param buffer - File buffer
 * @param mimeType - MIME type
 * @returns Extracted metadata
 */
export async function extractMultimediaMetadata(
    buffer: Buffer,
    mimeType: string
): Promise<IMultimediaMetadata> {
    if (mimeType.startsWith('audio/')) {
        return extractAudioMetadata(buffer, mimeType);
    } else if (mimeType.startsWith('video/')) {
        return extractVideoMetadata(buffer, mimeType);
    } else {
        throw new Error(`Unsupported multimedia MIME type: ${mimeType}`);
    }
}

/**
 * Detect NATO classification in existing tags
 *
 * Searches common metadata fields for STANAG 4774 classification markers.
 * This enables detection of pre-labeled files.
 *
 * @param metadata - Parsed music-metadata result
 * @returns Classification string if found, undefined otherwise
 */
function detectClassificationInTags(metadata: musicMetadata.IAudioMetadata): string | undefined {
    const classificationPatterns = [
        /UNCLASSIFIED/i,
        /RESTRICTED/i,
        /CONFIDENTIAL/i,
        /SECRET/i,
        /TOP\s*SECRET/i,
    ];

    // Check common tags
    const fieldsToCheck = [
        metadata.common.title,
        metadata.common.comment?.join(' '),
        metadata.common.description?.join(' '),
        metadata.common.copyright,
    ];

    for (const field of fieldsToCheck) {
        if (!field) continue;
        for (const pattern of classificationPatterns) {
            const match = field.match(pattern);
            if (match) {
                return match[0].toUpperCase().replace(/\s+/g, '_');
            }
        }
    }

    // Check native tags
    for (const [, tags] of Object.entries(metadata.native)) {
        for (const tag of tags) {
            const value = String(tag.value);
            for (const pattern of classificationPatterns) {
                const match = value.match(pattern);
                if (match) {
                    return match[0].toUpperCase().replace(/\s+/g, '_');
                }
            }
        }
    }

    return undefined;
}

/**
 * Validate multimedia metadata against classification policy
 *
 * Enforces file size and duration limits based on classification level.
 *
 * @param metadata - Extracted metadata
 * @param classification - Target classification level
 * @param fileSize - File size in bytes
 * @returns Validation result with errors if any
 */
export function validateMultimediaForClassification(
    metadata: IMultimediaMetadata,
    classification: string,
    fileSize: number
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // File size limits by classification (MB)
    const maxSizeMB: Record<string, number> = {
        UNCLASSIFIED: 500,
        RESTRICTED: 300,
        CONFIDENTIAL: 250,
        SECRET: 100,
        TOP_SECRET: 50,
    };

    // Duration limits by classification (minutes) - video only
    const maxDurationMinutes: Record<string, number> = {
        UNCLASSIFIED: 60,
        RESTRICTED: 45,
        CONFIDENTIAL: 45,
        SECRET: 30,
        TOP_SECRET: 15,
    };

    const normalizedClassification = classification.toUpperCase().replace(' ', '_');
    const maxSize = maxSizeMB[normalizedClassification] || maxSizeMB.SECRET;
    const maxDuration = maxDurationMinutes[normalizedClassification] || maxDurationMinutes.SECRET;

    // Check file size
    const fileSizeMB = fileSize / (1024 * 1024);
    if (fileSizeMB > maxSize) {
        errors.push(`File size ${fileSizeMB.toFixed(1)}MB exceeds ${maxSize}MB limit for ${classification}`);
    }

    // Check duration (if available and video)
    if (metadata.duration && metadata.hasVideo) {
        const durationMinutes = metadata.duration / 60;
        if (durationMinutes > maxDuration) {
            errors.push(`Video duration ${durationMinutes.toFixed(1)} minutes exceeds ${maxDuration} minute limit for ${classification}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Get supported audio formats
 */
export function getSupportedAudioFormats(): string[] {
    return ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'];
}

/**
 * Get supported video formats
 */
export function getSupportedVideoFormats(): string[] {
    return ['video/mp4', 'video/webm', 'video/ogg'];
}

/**
 * Check if format supports embedded XMP
 *
 * MP4/M4A containers support XMP embedding in UUID atoms.
 * Other formats require XMP sidecar files.
 *
 * @param mimeType - MIME type to check
 * @returns true if XMP can be embedded, false if sidecar required
 */
export function supportsEmbeddedXMP(mimeType: string): boolean {
    const embeddableFormats = ['video/mp4', 'audio/mp4', 'audio/x-m4a'];
    return embeddableFormats.includes(mimeType);
}
