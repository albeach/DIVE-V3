/**
 * Upload Types
 * Week 3.2: Secure File Upload with ACP-240 Compliance
 *
 * Type definitions for file upload with automatic ZTDF conversion
 */

import { ClassificationLevel, COIOperator, IZTDFObject } from './ztdf.types';

/**
 * Upload metadata (from client)
 *
 * ACP-240 Section 4.3 Enhancement:
 * Now includes originalClassification and originalCountry for classification provenance
 */
export interface IUploadMetadata {
    classification: ClassificationLevel;  // DIVE canonical (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
    originalClassification?: string;       // NEW: e.g., "GEHEIM", "SECRET DÉFENSE" (ACP-240 Section 4.3)
    originalCountry?: string;              // NEW: ISO 3166-1 alpha-3 (e.g., "DEU", "FRA") (ACP-240 Section 4.3)
    releasabilityTo: string[];             // ISO 3166-1 alpha-3 codes
    COI?: string[];                        // Communities of Interest
    coiOperator?: COIOperator;             // ALL or ANY (default: ALL)
    caveats?: string[];                    // NOFORN, RELIDO, PROPIN, etc.
    title: string;                         // Required, max 200 characters
    description?: string;                  // Optional description
}

/**
 * Uploader information (from JWT)
 */
export interface IUploaderInfo {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
}

/**
 * Upload result
 */
export interface IUploadResult {
    success: boolean;
    resourceId: string;
    ztdfObjectId: string;
    displayMarking: string;
    ztdf?: IZTDFObject;  // Include full ZTDF object for classification equivalency tests
    metadata: {
        fileSize: number;
        mimeType: string;
        originalFilename: string;
        uploadedAt: string;
        uploadedBy: string;
        classification: string;
        encrypted: boolean;
        ztdf: {
            version: string;
            policyHash: string;
            payloadHash: string;
            kaoCount: number;
        };
    };
}

/**
 * File validation result
 */
export interface IFileValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Allowed MIME types for upload
 */
export const ALLOWED_MIME_TYPES = [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    // Text
    'text/plain',
    'text/markdown',
    'text/csv',

    // Images
    'image/png',
    'image/jpeg',
    'image/gif',

    // Audio (STANAG 4774/4778 compliant)
    'audio/mpeg',        // MP3
    'audio/mp4',         // M4A
    'audio/x-m4a',       // M4A alternative MIME type
    'audio/wav',         // WAV
    'audio/x-wav',       // WAV alternative
    'audio/webm',        // WebM audio
    'audio/ogg',         // OGG Vorbis

    // Video (STANAG 4774/4778 compliant)
    'video/mp4',         // MP4
    'video/webm',        // WebM video
    'video/ogg'          // OGG Theora
];

/**
 * Valid caveats
 */
export const VALID_CAVEATS = [
    'NOFORN',      // No Foreign Nationals
    'RELIDO',      // Releasable by Information Disclosure Official
    'PROPIN',      // Caution—Proprietary Information Involved
    'ORCON',       // Originator Controlled
    'IMCON'        // Imagery Controlled
];

/**
 * Maximum file size for documents (bytes)
 */
export const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10') * 1024 * 1024;

/**
 * Maximum file size for multimedia (bytes) - larger to accommodate audio/video
 */
export const MAX_MULTIMEDIA_FILE_SIZE = parseInt(process.env.MAX_MULTIMEDIA_UPLOAD_SIZE_MB || '500') * 1024 * 1024;

/**
 * Multimedia MIME type categories
 */
export const AUDIO_MIME_TYPES = [
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',    // M4A alternative
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
];

export const VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
];

/**
 * Check if MIME type is audio
 */
export function isAudioMimeType(mimeType: string): boolean {
    return AUDIO_MIME_TYPES.includes(mimeType) || mimeType.startsWith('audio/');
}

/**
 * Check if MIME type is video
 */
export function isVideoMimeType(mimeType: string): boolean {
    return VIDEO_MIME_TYPES.includes(mimeType) || mimeType.startsWith('video/');
}

/**
 * Check if MIME type is multimedia (audio or video)
 */
export function isMultimediaMimeType(mimeType: string): boolean {
    return isAudioMimeType(mimeType) || isVideoMimeType(mimeType);
}
