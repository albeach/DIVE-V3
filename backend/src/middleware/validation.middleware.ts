import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

// ============================================
// Input Validation Middleware (Phase 3)
// ============================================
// Purpose: Comprehensive input validation and sanitization
// Prevents: SQL injection, XSS, path traversal, regex DoS, etc.

/**
 * Request body size limit (in bytes)
 * Default: 10MB
 */
export const MAX_BODY_SIZE = parseInt(process.env.MAX_BODY_SIZE || '10485760', 10);

/**
 * Maximum string length for text fields
 */
export const MAX_STRING_LENGTH = 10000;

/**
 * Validation error handler middleware
 * Checks validation results and returns errors if any
 */
export const handleValidationErrors = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const requestId = req.headers['x-request-id'] as string;
        
        logger.warn('Validation error', {
            requestId,
            path: req.path,
            method: req.method,
            errors: errors.array(),
            body: req.body ? Object.keys(req.body) : [],
        });

        res.status(400).json({
            error: 'Validation Error',
            message: 'One or more validation errors occurred',
            details: errors.array().map(err => ({
                field: 'path' in err ? err.path : 'unknown',
                message: err.msg,
                value: 'value' in err ? err.value : undefined,
            })),
            requestId,
        });
        return;
    }

    next();
};

/**
 * Validate IdP creation request
 */
export const validateIdPCreation = [
    // Alias: lowercase alphanumeric with hyphens
    body('alias')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Alias must be between 3 and 50 characters')
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Alias must be lowercase alphanumeric with hyphens only')
        .customSanitizer((value: string) => value.toLowerCase()),

    // Display name: required, 1-100 chars
    body('displayName')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Display name must be between 1 and 100 characters')
        .escape(),

    // Description: optional, max 500 chars
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must not exceed 500 characters')
        .escape(),

    // Protocol: must be 'oidc' or 'saml'
    body('protocol')
        .isIn(['oidc', 'saml'])
        .withMessage('Protocol must be either "oidc" or "saml"'),

    // OIDC Configuration (if protocol is 'oidc')
    body('oidcConfig.discoveryUrl')
        .if((_value, { req }) => req.body?.protocol === 'oidc')
        .trim()
        .isURL({ protocols: ['https'], require_protocol: true })
        .withMessage('Discovery URL must be a valid HTTPS URL'),

    body('oidcConfig.clientId')
        .if((_value, { req }) => req.body?.protocol === 'oidc')
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Client ID is required and must not exceed 255 characters'),

    body('oidcConfig.clientSecret')
        .if((_value, { req }) => req.body?.protocol === 'oidc')
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Client secret is required and must not exceed 1000 characters'),

    // SAML Configuration (if protocol is 'saml')
    body('samlConfig.metadataUrl')
        .if((_value, { req }) => req.body?.protocol === 'saml')
        .optional()
        .trim()
        .isURL({ protocols: ['https'], require_protocol: true })
        .withMessage('Metadata URL must be a valid HTTPS URL'),

    body('samlConfig.metadataXml')
        .if((_value, { req }) => req.body?.protocol === 'saml')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100000 })
        .withMessage('Metadata XML must not exceed 100KB'),

    // Operational data: optional but validated if provided
    body('operationalData.uptimeSLA')
        .optional()
        .trim()
        .matches(/^\d+(\.\d+)?%$/)
        .withMessage('Uptime SLA must be a percentage (e.g., "99.9%")'),

    body('operationalData.incidentResponse')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Incident response must not exceed 100 characters')
        .escape(),

    body('operationalData.securityPatching')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Security patching must not exceed 100 characters')
        .escape(),

    body('operationalData.supportContacts')
        .optional()
        .isArray()
        .withMessage('Support contacts must be an array'),

    body('operationalData.supportContacts.*')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Each support contact must be a valid email address')
        .normalizeEmail(),

    handleValidationErrors,
];

/**
 * Validate IdP update request
 */
export const validateIdPUpdate = [
    // ID parameter: required, alphanumeric with hyphens
    param('id')
        .trim()
        .matches(/^[a-zA-Z0-9-]+$/)
        .withMessage('IdP ID must be alphanumeric with hyphens'),

    // All fields optional for update (partial update)
    body('displayName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Display name must be between 1 and 100 characters')
        .escape(),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must not exceed 500 characters')
        .escape(),

    body('enabled')
        .optional()
        .isBoolean()
        .withMessage('Enabled must be a boolean value'),

    handleValidationErrors,
];

/**
 * Validate resource ID parameter
 */
export const validateResourceId = [
    param('id')
        .trim()
        .matches(/^[a-zA-Z0-9-_]+$/)
        .withMessage('Resource ID must be alphanumeric with hyphens and underscores only')
        .isLength({ max: 100 })
        .withMessage('Resource ID must not exceed 100 characters')
        // Prevent path traversal
        .custom((value: string) => {
            if (value.includes('..') || value.includes('/') || value.includes('\\')) {
                throw new Error('Resource ID contains invalid characters');
            }
            return true;
        }),

    handleValidationErrors,
];

/**
 * Validate file upload
 */
export const validateFileUpload = [
    // File size checked by multer middleware
    // Additional validation for file metadata

    body('fileName')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('File name must not exceed 255 characters')
        // Prevent path traversal in file name
        .custom((value: string) => {
            if (value.includes('..') || value.includes('/') || value.includes('\\')) {
                throw new Error('File name contains invalid characters');
            }
            return true;
        })
        .escape(),

    body('fileType')
        .optional()
        .trim()
        .isIn(['application/pdf', 'text/plain', 'application/json', 'text/xml'])
        .withMessage('File type must be one of: PDF, plain text, JSON, XML'),

    handleValidationErrors,
];

/**
 * Validate pagination parameters
 */
export const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 0, max: 10000 })
        .withMessage('Page must be an integer between 0 and 10000')
        .toInt(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be an integer between 1 and 100')
        .toInt(),

    query('sort')
        .optional()
        .trim()
        .isIn(['asc', 'desc', 'ASC', 'DESC'])
        .withMessage('Sort must be either "asc" or "desc"'),

    query('sortBy')
        .optional()
        .trim()
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Sort by must be alphanumeric with underscores only')
        .isLength({ max: 50 })
        .withMessage('Sort by must not exceed 50 characters'),

    handleValidationErrors,
];

/**
 * Validate date range query
 */
export const validateDateRange = [
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date')
        .toDate(),

    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
        .toDate()
        .custom((endDate: Date, { req }) => {
            const startDate = req.query?.startDate;
            if (startDate && endDate < new Date(startDate as string)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),

    handleValidationErrors,
];

/**
 * Validate approval decision
 */
export const validateApprovalDecision = [
    param('submissionId')
        .trim()
        .matches(/^[a-zA-Z0-9-]+$/)
        .withMessage('Submission ID must be alphanumeric with hyphens'),

    body('action')
        .isIn(['approve', 'reject'])
        .withMessage('Action must be either "approve" or "reject"'),

    body('notes')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Notes must not exceed 1000 characters')
        .escape(),

    handleValidationErrors,
];

/**
 * Sanitize all string inputs in request body
 * Generic sanitization middleware for endpoints without specific validation
 */
export const sanitizeAllStrings = (
    req: Request,
    _res: Response,
    next: NextFunction
): void => {
    if (req.body && typeof req.body === 'object') {
        const sanitize = (obj: any): any => {
            if (typeof obj === 'string') {
                // Trim whitespace
                obj = obj.trim();
                
                // Limit length
                if (obj.length > MAX_STRING_LENGTH) {
                    obj = obj.substring(0, MAX_STRING_LENGTH);
                }
                
                // Escape HTML (basic XSS prevention)
                obj = obj
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
            } else if (Array.isArray(obj)) {
                obj = obj.map(sanitize);
            } else if (obj !== null && typeof obj === 'object') {
                for (const key in obj) {
                    obj[key] = sanitize(obj[key]);
                }
            }
            return obj;
        };

        req.body = sanitize(req.body);
    }

    next();
};

/**
 * Prevent regex DoS attacks
 * Validates that regex patterns in query are safe
 */
export const validateRegexQuery = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const regexFields = ['search', 'filter', 'pattern'];
    const requestId = req.headers['x-request-id'] as string;

    for (const field of regexFields) {
        const value = req.query[field] as string;
        if (value) {
            // Check for dangerous regex patterns that could cause ReDoS
            // These patterns look for nested quantifiers and backreferences in the INPUT string
            // (i.e., if the user is trying to submit a malicious regex pattern)
            const dangerousPatternIndicators = [
                /\(\.\*\?\)\\1\{10,\}/, // Repetition with backreference like (.*?)\1{10,}
                /\(\[\^[^\]]+\]\+\)\+/, // Nested quantifiers like ([^]+)+
                /\(\([a-z]\+\)\+\)\+/i, // Nested quantifiers like ((a+)+)+
                /\.\*\.\*\.\*/, // Multiple greedy wildcards
            ];

            for (const pattern of dangerousPatternIndicators) {
                try {
                    if (pattern.test(value)) {
                        logger.warn('Potential regex DoS pattern detected', {
                            requestId,
                            field,
                            value: value.substring(0, 100),
                        });

                        res.status(400).json({
                            error: 'Validation Error',
                            message: 'Invalid search pattern detected',
                            requestId,
                        });
                        return;
                    }
                } catch {
                    // Pattern itself might be invalid, skip
                }
            }

            // Limit regex length
            if (value.length > 200) {
                logger.warn('Regex query too long', {
                    requestId,
                    field,
                    length: value.length,
                });

                res.status(400).json({
                    error: 'Validation Error',
                    message: 'Search pattern too long (max 200 characters)',
                    requestId,
                });
                return;
            }
        }
    }

    next();
};

/**
 * Get validation configuration (for monitoring)
 */
export const getValidationConfig = (): {
    enabled: boolean;
    maxBodySize: number;
    maxStringLength: number;
} => {
    return {
        enabled: process.env.ENABLE_INPUT_VALIDATION !== 'false',
        maxBodySize: MAX_BODY_SIZE,
        maxStringLength: MAX_STRING_LENGTH,
    };
};

