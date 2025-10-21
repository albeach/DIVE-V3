/**
 * UUID Validation Middleware
 * 
 * Gap #5 Remediation (October 20, 2025)
 * ACP-240 Section 2.1: Globally Unique Identifier (RFC 4122)
 * 
 * Validates that uniqueID claim in JWT is a valid RFC 4122 UUID format.
 * This prevents ID collisions across coalition partners and ensures
 * globally unique identity correlation.
 * 
 * Reference: docs/ATTRIBUTE-SCHEMA-SPECIFICATION.md
 */

import { Request, Response, NextFunction } from 'express';
import { validate as isValidUUID, version as uuidVersion } from 'uuid';
import { logger } from '../utils/logger';

/**
 * UUID Validation Middleware
 * 
 * Validates that the uniqueID claim extracted from JWT is a valid RFC 4122 UUID.
 * Should be used AFTER authenticateJWT or authzMiddleware (requires (req as any).user)
 * 
 * @param req - Express request (must have user object with uniqueID)
 * @param res - Express response
 * @param next - Next middleware function
 */
export const validateUUID = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;

    // Check if user object exists (should be populated by auth middleware)
    if (!user) {
        logger.error('UUID validation called without authenticated user', { requestId });
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication middleware not executed',
            requestId
        });
        return;
    }

    const uniqueID = user.uniqueID;

    // Check if uniqueID exists
    if (!uniqueID) {
        logger.warn('Missing uniqueID in validated user', {
            requestId,
            user: { sub: user.sub, email: user.email }
        });
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing uniqueID claim in token',
            details: {
                requirement: 'uniqueID claim is required for all authenticated users',
                reference: 'ACP-240 Section 2.1 (Globally Unique Identifier)'
            },
            requestId
        });
        return;
    }

    // Validate RFC 4122 UUID format
    if (!isValidUUID(uniqueID)) {
        logger.error('Invalid UUID format detected', {
            requestId,
            uniqueID,
            format: 'Expected RFC 4122 UUID v4',
            received: uniqueID,
            user: {
                sub: user.sub,
                email: user.email,
                country: user.countryOfAffiliation
            }
        });

        res.status(400).json({
            error: 'Bad Request',
            message: 'uniqueID must be RFC 4122 UUID format',
            details: {
                received: uniqueID,
                receivedFormat: 'Invalid (possibly email-based)',
                expected: '550e8400-e29b-41d4-a716-446655440000',
                expectedFormat: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
                versions: 'UUID v1, v3, v4, or v5 accepted (v4 recommended)',
                reference: 'ACP-240 Section 2.1 (Globally Unique Identifier)',
                migrationNote: 'Legacy email-based uniqueIDs must be migrated to UUID format'
            },
            requestId
        });
        return;
    }

    // Log UUID version for monitoring
    const version = uuidVersion(uniqueID);

    logger.debug('UUID validation passed', {
        requestId,
        uniqueID,
        uuidVersion: version,
        format: 'RFC 4122'
    });

    // Attach UUID metadata to request for downstream use
    (req as any).uuidMetadata = {
        uniqueID,
        version,
        format: 'RFC 4122',
        validatedAt: new Date().toISOString()
    };

    next();
};

/**
 * Lenient UUID Validation (for migration period)
 * 
 * Validates UUID format but WARNS instead of rejecting for non-UUID formats.
 * Use during migration from email-based uniqueIDs to UUIDs.
 * 
 * @param req - Express request
 * @param _res - Express response (unused - lenient mode doesn't reject)
 * @param next - Next middleware function
 */
export const validateUUIDLenient = (req: Request, _res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;

    if (!user || !user.uniqueID) {
        // No user or uniqueID - let next middleware handle
        next();
        return;
    }

    const uniqueID = user.uniqueID;

    if (!isValidUUID(uniqueID)) {
        // WARN but allow (migration period)
        logger.warn('Non-UUID uniqueID detected (migration period)', {
            requestId,
            uniqueID,
            format: 'Legacy format (email-based)',
            recommendation: 'Migrate to UUID format',
            user: {
                email: user.email,
                country: user.countryOfAffiliation
            }
        });

        // Attach warning metadata
        (req as any).uuidMetadata = {
            uniqueID,
            version: null,
            format: 'LEGACY',
            warning: 'Non-UUID format detected',
            validatedAt: new Date().toISOString()
        };
    } else {
        const version = uuidVersion(uniqueID);

        logger.debug('UUID validation passed (lenient mode)', {
            requestId,
            uniqueID,
            uuidVersion: version
        });

        (req as any).uuidMetadata = {
            uniqueID,
            version,
            format: 'RFC 4122',
            validatedAt: new Date().toISOString()
        };
    }

    next();
};

