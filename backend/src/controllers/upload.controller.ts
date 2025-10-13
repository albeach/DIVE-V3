/**
 * Upload Controller
 * Week 3.2: Secure File Upload with Authorization
 * 
 * REST API controller for file upload with OPA authorization enforcement
 * ACP-240 compliant with fail-closed security
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { uploadFile } from '../services/upload.service';
import { IUploadMetadata, IUploaderInfo } from '../types/upload.types';
import { ValidationError, ForbiddenError, UnauthorizedError } from '../middleware/error.middleware';
import axios from 'axios';

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * Upload file handler
 * POST /api/upload
 * 
 * Requires:
 * - Multipart form data with 'file' field
 * - Metadata: classification, releasabilityTo, COI (optional), title
 * - JWT authentication
 * - OPA authorization (user can only upload at or below their clearance)
 */
export const uploadFileHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        // 1. Verify file was uploaded
        if (!req.file) {
            throw new ValidationError('No file uploaded. Use multipart/form-data with "file" field.');
        }

        // 2. Extract and validate metadata
        const metadata: IUploadMetadata = {
            classification: req.body.classification,
            releasabilityTo: req.body.releasabilityTo, // Already parsed by validateUploadMetadata middleware
            COI: req.body.COI || [],
            caveats: req.body.caveats || [],
            title: req.body.title, // Already sanitized by middleware
            description: req.body.description
        };

        // 3. Extract uploader info from JWT
        const user = (req as any).user;
        if (!user) {
            throw new UnauthorizedError('Authentication required. JWT token not found.');
        }

        const uploader: IUploaderInfo = {
            uniqueID: user.uniqueID || user.email || user.sub,
            clearance: user.clearance,
            countryOfAffiliation: user.countryOfAffiliation,
            acpCOI: user.acpCOI
        };

        logger.info('Processing upload request', {
            requestId,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            classification: metadata.classification,
            uploader: uploader.uniqueID
        });

        // 4. Enforce upload authorization via OPA
        await enforceUploadAuthorization(
            uploader,
            metadata,
            requestId
        );

        // 5. Upload file and convert to ZTDF
        const result = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            metadata,
            uploader
        );

        // 6. Log ENCRYPT event (ACP-240 requirement)
        logger.info('ENCRYPT event', {
            eventType: 'ENCRYPT',
            requestId,
            subject: uploader.uniqueID,
            resourceId: result.resourceId,
            classification: metadata.classification,
            displayMarking: result.displayMarking,
            fileSize: result.metadata.fileSize,
            timestamp: new Date().toISOString()
        });

        // 7. Return success response
        res.status(201).json(result);

    } catch (error) {
        next(error);
    }
};

/**
 * Enforce upload authorization via OPA
 * 
 * Rules:
 * - User must be authenticated
 * - User clearance must be >= upload classification
 * - Upload releasabilityTo must include uploader's country
 */
async function enforceUploadAuthorization(
    uploader: IUploaderInfo,
    metadata: IUploadMetadata,
    requestId: string
): Promise<void> {

    try {
        // Build OPA input for upload authorization
        const opaInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID: uploader.uniqueID,
                    clearance: uploader.clearance,
                    countryOfAffiliation: uploader.countryOfAffiliation,
                    acpCOI: uploader.acpCOI || []
                },
                action: {
                    operation: 'upload'
                },
                resource: {
                    resourceId: 'pending-upload',
                    classification: metadata.classification,
                    releasabilityTo: metadata.releasabilityTo,
                    COI: metadata.COI || [],
                    encrypted: true
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: '0.0.0.0', // Would be req.ip in production
                    deviceCompliant: true,
                    requestId
                }
            }
        };

        // Call OPA decision endpoint
        const response = await axios.post(
            `${OPA_URL}/v1/data/dive/authorization/decision`,
            opaInput,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }
        );

        const decision = response.data.result;

        // Log authorization decision
        logger.info('Upload authorization decision', {
            requestId,
            subject: uploader.uniqueID,
            classification: metadata.classification,
            allow: decision.allow,
            reason: decision.reason
        });

        // Enforce decision (fail-closed)
        if (!decision.allow) {
            // Log ACCESS_DENIED event (ACP-240)
            logger.warn('ACCESS_DENIED event (upload)', {
                eventType: 'ACCESS_DENIED',
                requestId,
                subject: uploader.uniqueID,
                classification: metadata.classification,
                reason: decision.reason,
                timestamp: new Date().toISOString()
            });

            throw new ForbiddenError(decision.reason, decision.evaluation_details);
        }

    } catch (error) {
        if (error instanceof ForbiddenError) {
            throw error;
        }

        // Log OPA error
        logger.error('Upload authorization check failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Fail-closed: Deny on OPA error
        throw new ForbiddenError('Authorization service unavailable (fail-closed)');
    }
}

