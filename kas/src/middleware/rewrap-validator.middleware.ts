/**
 * Rewrap Request Validation Middleware
 * 
 * Validates ACP-240 /rewrap request structure per spec
 * Reference: KAS-REQ-023, Phase 1.1
 */

import { Request, Response, NextFunction } from 'express';
import { kasLogger } from '../utils/kas-logger';
import {
    IRewrapRequest,
    IRequestGroup,
    IKeyAccessObject,
    IValidationError,
} from '../types/rewrap.types';

/**
 * Validate rewrap request structure
 * 
 * Checks:
 * - clientPublicKey present and valid format (JWK or PEM)
 * - requests array non-empty
 * - Each request group has policy and keyAccessObjects
 * - keyAccessObjectId uniqueness across entire request
 * - Required KAO fields present
 * 
 * Returns 400 Bad Request on validation failure
 */
export const validateRewrapRequest = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string;
    const body = req.body as Partial<IRewrapRequest>;
    const errors: IValidationError[] = [];

    try {
        // 1. Validate top-level structure
        if (!body.clientPublicKey) {
            errors.push({
                code: 'MISSING_CLIENT_PUBLIC_KEY',
                message: 'clientPublicKey is required',
                field: 'clientPublicKey',
            });
        } else {
            // Validate clientPublicKey format (JWK or PEM)
            const isJWK = typeof body.clientPublicKey === 'object';
            const isPEM =
                typeof body.clientPublicKey === 'string' &&
                (body.clientPublicKey.includes('BEGIN PUBLIC KEY') ||
                    body.clientPublicKey.includes('BEGIN RSA PUBLIC KEY'));

            if (!isJWK && !isPEM) {
                errors.push({
                    code: 'INVALID_CLIENT_PUBLIC_KEY_FORMAT',
                    message:
                        'clientPublicKey must be JWK object or PEM string',
                    field: 'clientPublicKey',
                });
            }

            // If JWK, validate required fields
            if (isJWK) {
                const jwk = body.clientPublicKey as any;
                if (!jwk.kty) {
                    errors.push({
                        code: 'INVALID_JWK',
                        message: 'JWK missing required field: kty',
                        field: 'clientPublicKey.kty',
                    });
                }
                // RSA requires n, e
                if (jwk.kty === 'RSA' && (!jwk.n || !jwk.e)) {
                    errors.push({
                        code: 'INVALID_RSA_JWK',
                        message: 'RSA JWK missing required fields: n, e',
                        field: 'clientPublicKey',
                    });
                }
                // EC requires crv, x, y
                if (jwk.kty === 'EC' && (!jwk.crv || !jwk.x || !jwk.y)) {
                    errors.push({
                        code: 'INVALID_EC_JWK',
                        message: 'EC JWK missing required fields: crv, x, y',
                        field: 'clientPublicKey',
                    });
                }
            }
        }

        if (!body.requests || !Array.isArray(body.requests)) {
            errors.push({
                code: 'MISSING_REQUESTS_ARRAY',
                message: 'requests must be a non-empty array',
                field: 'requests',
            });
        } else if (body.requests.length === 0) {
            errors.push({
                code: 'EMPTY_REQUESTS_ARRAY',
                message: 'requests array must contain at least one entry',
                field: 'requests',
            });
        } else {
            // 2. Validate each request group
            const seenKeyAccessObjectIds = new Set<string>();

            body.requests.forEach((requestGroup, groupIndex) => {
                const group = requestGroup as Partial<IRequestGroup>;

                // Validate policy present
                if (!group.policy) {
                    errors.push({
                        code: 'MISSING_POLICY',
                        message: `Request group ${groupIndex} missing policy`,
                        field: `requests[${groupIndex}].policy`,
                    });
                }

                // Validate keyAccessObjects array
                if (
                    !group.keyAccessObjects ||
                    !Array.isArray(group.keyAccessObjects)
                ) {
                    errors.push({
                        code: 'MISSING_KEY_ACCESS_OBJECTS',
                        message: `Request group ${groupIndex} missing keyAccessObjects array`,
                        field: `requests[${groupIndex}].keyAccessObjects`,
                    });
                } else if (group.keyAccessObjects.length === 0) {
                    errors.push({
                        code: 'EMPTY_KEY_ACCESS_OBJECTS',
                        message: `Request group ${groupIndex} has empty keyAccessObjects array`,
                        field: `requests[${groupIndex}].keyAccessObjects`,
                    });
                } else {
                    // 3. Validate each keyAccessObject
                    group.keyAccessObjects.forEach((kao, kaoIndex) => {
                        const kaoObj = kao as Partial<IKeyAccessObject>;

                        // Required fields
                        const requiredFields = [
                            'keyAccessObjectId',
                            'wrappedKey',
                            'url',
                            'kid',
                            'policyBinding',
                            'signature',
                        ];

                        requiredFields.forEach((field) => {
                            if (!kaoObj[field as keyof IKeyAccessObject]) {
                                errors.push({
                                    code: 'MISSING_KAO_FIELD',
                                    message: `keyAccessObject missing required field: ${field}`,
                                    field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].${field}`,
                                });
                            }
                        });

                        // Validate keyAccessObjectId uniqueness
                        if (kaoObj.keyAccessObjectId) {
                            if (seenKeyAccessObjectIds.has(kaoObj.keyAccessObjectId)) {
                                errors.push({
                                    code: 'DUPLICATE_KEY_ACCESS_OBJECT_ID',
                                    message: `Duplicate keyAccessObjectId: ${kaoObj.keyAccessObjectId}`,
                                    field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].keyAccessObjectId`,
                                    details: {
                                        keyAccessObjectId: kaoObj.keyAccessObjectId,
                                    },
                                });
                            } else {
                                seenKeyAccessObjectIds.add(kaoObj.keyAccessObjectId);
                            }
                        }

                        // Validate signature structure
                        if (kaoObj.signature) {
                            const sig = kaoObj.signature as any;
                            if (!sig.alg || !sig.sig) {
                                errors.push({
                                    code: 'INVALID_SIGNATURE_STRUCTURE',
                                    message: 'signature must have alg and sig fields',
                                    field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].signature`,
                                });
                            }
                        }

                        // Validate Base64 fields
                        if (kaoObj.wrappedKey && !isBase64(kaoObj.wrappedKey)) {
                            errors.push({
                                code: 'INVALID_BASE64',
                                message: 'wrappedKey must be valid Base64',
                                field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].wrappedKey`,
                            });
                        }

                        if (kaoObj.policyBinding && !isBase64(kaoObj.policyBinding)) {
                            errors.push({
                                code: 'INVALID_BASE64',
                                message: 'policyBinding must be valid Base64',
                                field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].policyBinding`,
                            });
                        }

                        // Validate URL format
                        if (kaoObj.url && !isValidUrl(kaoObj.url)) {
                            errors.push({
                                code: 'INVALID_URL',
                                message: 'url must be a valid HTTPS URL',
                                field: `requests[${groupIndex}].keyAccessObjects[${kaoIndex}].url`,
                            });
                        }
                    });
                }
            });
        }

        // 4. If validation errors, return 400
        if (errors.length > 0) {
            kasLogger.warn('Rewrap request validation failed', {
                requestId,
                errorCount: errors.length,
                errors,
            });

            res.status(400).json({
                error: 'Bad Request',
                message: 'Rewrap request validation failed',
                validationErrors: errors,
                requestId,
            });
            return;
        }

        // 5. Validation passed, continue
        kasLogger.debug('Rewrap request validation passed', {
            requestId,
            groupCount: body.requests?.length || 0,
            kaoCount: body.requests?.reduce(
                (sum, group) => sum + (group.keyAccessObjects?.length || 0),
                0
            ),
        });

        next();
    } catch (error) {
        kasLogger.error('Rewrap validation error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to validate rewrap request',
            requestId,
        });
    }
};

/**
 * Validate Content-Type header
 * Must be application/json for /rewrap
 * 
 * Trace: KAS-REQ-022
 */
export const validateContentType = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('application/json')) {
        const requestId = req.headers['x-request-id'] as string;

        kasLogger.warn('Invalid Content-Type for /rewrap', {
            requestId,
            contentType,
        });

        res.status(400).json({
            error: 'Bad Request',
            message: 'Content-Type must be application/json',
            requestId,
        });
        return;
    }

    next();
};

// ============================================
// Helper Functions
// ============================================

/**
 * Check if string is valid Base64
 */
function isBase64(str: string): boolean {
    if (typeof str !== 'string') return false;
    try {
        return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
        return false;
    }
}

/**
 * Check if string is valid URL
 */
function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}
