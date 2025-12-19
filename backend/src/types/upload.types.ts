/**
 * Upload Types
 * Week 3.2: Secure File Upload with ACP-240 Compliance
 * 
 * Type definitions for file upload with automatic ZTDF conversion
 */

import { ClassificationLevel, COIOperator } from './ztdf.types';

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
    ztdf?: any;  // Include full ZTDF object for classification equivalency tests
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
    'image/gif'
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
 * Maximum file size (bytes)
 */
export const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10') * 1024 * 1024;
