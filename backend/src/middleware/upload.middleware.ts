/**
 * Upload Middleware
 * Week 3.2: File Upload Validation and Configuration
 * 
 * Handles file upload with Multer, validates file type and size
 * ACP-240 compliant with fail-closed security
 */

import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ValidationError } from './error.middleware';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../types/upload.types';

/**
 * Configure Multer for in-memory storage
 * Security: Process files in memory without writing to disk
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate MIME types
 */
const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    const requestId = (req as any).headers?.['x-request-id'] as string;

    logger.info('Validating uploaded file', {
        requestId,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        logger.warn('Invalid file type rejected', {
            requestId,
            mimetype: file.mimetype,
            allowed: ALLOWED_MIME_TYPES
        });
        cb(new ValidationError(`Invalid file type: ${file.mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
        return;
    }

    // Validate file extension matches MIME type
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const validExtensions: Record<string, string[]> = {
        'application/pdf': ['pdf'],
        'application/msword': ['doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
        'text/plain': ['txt'],
        'text/markdown': ['md'],
        'text/csv': ['csv'],
        'image/png': ['png'],
        'image/jpeg': ['jpg', 'jpeg'],
        'image/gif': ['gif']
    };

    const expectedExtensions = validExtensions[file.mimetype];
    if (ext && expectedExtensions && !expectedExtensions.includes(ext)) {
        logger.warn('File extension does not match MIME type', {
            requestId,
            extension: ext,
            mimetype: file.mimetype,
            expected: expectedExtensions
        });
        cb(new ValidationError(`File extension .${ext} does not match MIME type ${file.mimetype}`));
        return;
    }

    cb(null, true);
};

/**
 * Multer configuration
 */
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1, // Only one file per request
    }
});

/**
 * Middleware to handle Multer errors
 */
export const handleUploadErrors = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string;

    if (err instanceof multer.MulterError) {
        logger.error('Multer upload error', {
            requestId,
            code: err.code,
            message: err.message
        });

        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                error: 'Payload Too Large',
                message: 'File size exceeds maximum allowed',
                details: {
                    maxSize: MAX_FILE_SIZE,
                    maxSizeMB: MAX_FILE_SIZE / (1024 * 1024)
                },
                requestId
            });
            return;
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Only one file can be uploaded at a time',
                requestId
            });
            return;
        }

        res.status(400).json({
            error: 'Upload Error',
            message: err.message,
            requestId
        });
        return;
    }

    // Pass other errors to the error handler
    next(err);
};

/**
 * Middleware to validate upload metadata
 */
export const validateUploadMetadata = (
    req: Request,
    _res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        const { classification, releasabilityTo, title } = req.body;

        // Validate classification
        const validClassifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
        if (!classification || !validClassifications.includes(classification)) {
            throw new ValidationError(`Invalid classification. Must be one of: ${validClassifications.join(', ')}`);
        }

        // Validate releasabilityTo
        if (!releasabilityTo) {
            throw new ValidationError('releasabilityTo is required');
        }

        // Parse releasabilityTo if it's a string
        let releasabilityArray: string[];
        if (typeof releasabilityTo === 'string') {
            try {
                releasabilityArray = JSON.parse(releasabilityTo);
            } catch {
                // If not JSON, treat as comma-separated
                releasabilityArray = releasabilityTo.split(',').map((s: string) => s.trim());
            }
        } else if (Array.isArray(releasabilityTo)) {
            releasabilityArray = releasabilityTo;
        } else {
            throw new ValidationError('releasabilityTo must be an array or comma-separated string');
        }

        if (releasabilityArray.length === 0) {
            throw new ValidationError('releasabilityTo cannot be empty');
        }

        // Validate country codes (basic check for 3-letter codes)
        for (const country of releasabilityArray) {
            if (!/^[A-Z]{3}$/.test(country)) {
                throw new ValidationError(`Invalid country code: ${country}. Must be ISO 3166-1 alpha-3 (e.g., USA, GBR, FRA)`);
            }
        }

        // Validate title
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            throw new ValidationError('title is required');
        }

        if (title.length > 200) {
            throw new ValidationError('title must be 200 characters or less');
        }

        // Sanitize title (remove HTML tags, special characters)
        const sanitizedTitle = title
            .replace(/[<>]/g, '')
            .trim();

        if (sanitizedTitle.length === 0) {
            throw new ValidationError('title cannot be empty after sanitization');
        }

        // Update body with parsed/sanitized values
        req.body.releasabilityTo = releasabilityArray;
        req.body.title = sanitizedTitle;

        // Parse COI if provided
        if (req.body.COI) {
            if (typeof req.body.COI === 'string') {
                try {
                    req.body.COI = JSON.parse(req.body.COI);
                } catch {
                    req.body.COI = req.body.COI.split(',').map((s: string) => s.trim());
                }
            }
        }

        // Parse caveats if provided
        if (req.body.caveats) {
            if (typeof req.body.caveats === 'string') {
                try {
                    req.body.caveats = JSON.parse(req.body.caveats);
                } catch {
                    req.body.caveats = req.body.caveats.split(',').map((s: string) => s.trim());
                }
            }
        }

        logger.info('Upload metadata validated', {
            requestId,
            classification,
            releasabilityTo: releasabilityArray,
            title: sanitizedTitle
        });

        next();

    } catch (error) {
        next(error);
    }
};
