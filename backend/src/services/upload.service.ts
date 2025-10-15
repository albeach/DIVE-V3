/**
 * Upload Service
 * Week 3.2: Secure File Upload with ACP-240 Compliance
 * 
 * Handles file upload and automatic ZTDF conversion
 * Implements: AES-256-GCM encryption, STANAG 4774 labels, STANAG 4778 binding
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import {
    IUploadMetadata,
    IUploaderInfo,
    IUploadResult,
    IFileValidation
} from '../types/upload.types';
import {
    IZTDFObject,
    IZTDFResource,
    ClassificationLevel,
    generateDisplayMarking,
    ISTANAG4774Label
} from '../types/ztdf.types';
import {
    encryptContent,
    computeSHA384,
    computeObjectHash
} from '../utils/ztdf.utils';
import { createZTDFResource } from './resource.service';

/**
 * Upload file and convert to ZTDF
 */
export async function uploadFile(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    metadata: IUploadMetadata,
    uploader: IUploaderInfo
): Promise<IUploadResult> {

    const uploadId = `doc-upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    logger.info('Processing file upload', {
        uploadId,
        filename: originalFilename,
        mimeType,
        fileSize: fileBuffer.length,
        classification: metadata.classification,
        uploader: uploader.uniqueID
    });

    try {
        // 1. Validate file
        const validation = validateFile(fileBuffer, mimeType);
        if (!validation.valid) {
            throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
        }

        // 2. Convert file to base64 for encryption
        const base64Content = fileBuffer.toString('base64');

        // 3. Create ZTDF object
        const ztdfObject = await convertToZTDF(
            base64Content,
            uploadId,
            metadata,
            uploader,
            mimeType
        );

        // 4. Create ZTDF resource and store in MongoDB
        const ztdfResource: IZTDFResource = {
            resourceId: uploadId,
            title: metadata.title,
            ztdf: ztdfObject,
            legacy: {
                classification: metadata.classification,
                releasabilityTo: metadata.releasabilityTo,
                COI: metadata.COI || [],
                encrypted: true,
                encryptedContent: ztdfObject.payload.encryptedChunks[0]?.encryptedData
            }
        };

        await createZTDFResource(ztdfResource);

        logger.info('File upload successful', {
            uploadId,
            resourceId: ztdfResource.resourceId,
            displayMarking: ztdfObject.policy.securityLabel.displayMarking
        });

        // 5. Return result
        return {
            success: true,
            resourceId: uploadId,
            ztdfObjectId: ztdfObject.manifest.objectId,
            displayMarking: ztdfObject.policy.securityLabel.displayMarking || '',
            metadata: {
                fileSize: fileBuffer.length,
                mimeType,
                originalFilename,
                uploadedAt: new Date().toISOString(),
                uploadedBy: uploader.uniqueID,
                classification: metadata.classification,
                encrypted: true,
                ztdf: {
                    version: ztdfObject.manifest.version,
                    policyHash: ztdfObject.policy.policyHash || '',
                    payloadHash: ztdfObject.payload.payloadHash || '',
                    kaoCount: ztdfObject.payload.keyAccessObjects.length
                }
            }
        };

    } catch (error) {
        logger.error('File upload failed', {
            uploadId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Validate file buffer
 */
function validateFile(fileBuffer: Buffer, mimeType: string): IFileValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate file size
    if (fileBuffer.length === 0) {
        errors.push('File is empty');
    }

    // Magic number validation (basic check)
    // PDF: %PDF
    if (mimeType === 'application/pdf') {
        const header = fileBuffer.slice(0, 4).toString('ascii');
        if (!header.startsWith('%PDF')) {
            errors.push('File does not appear to be a valid PDF (magic number mismatch)');
        }
    }

    // PNG: 89 50 4E 47
    if (mimeType === 'image/png') {
        const header = fileBuffer.slice(0, 4);
        if (!(header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47)) {
            errors.push('File does not appear to be a valid PNG (magic number mismatch)');
        }
    }

    // JPEG: FF D8 FF
    if (mimeType === 'image/jpeg') {
        const header = fileBuffer.slice(0, 3);
        if (!(header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF)) {
            errors.push('File does not appear to be a valid JPEG (magic number mismatch)');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Convert file to ZTDF format
 */
async function convertToZTDF(
    base64Content: string,
    uploadId: string,
    metadata: IUploadMetadata,
    uploader: IUploaderInfo,
    mimeType: string
): Promise<IZTDFObject> {

    // 1. Encrypt content with AES-256-GCM (deterministic DEK for KAS compatibility)
    const encryptionResult = encryptContent(base64Content, uploadId);

    // 2. Create ZTDF Manifest
    const currentTimestamp = new Date().toISOString();
    const manifest = {
        version: '1.0',
        objectId: uploadId,
        objectType: 'uploaded-document',
        contentType: mimeType,
        owner: uploader.uniqueID,
        ownerOrganization: 'DIVE-V3',
        createdAt: currentTimestamp,
        payloadSize: Buffer.from(encryptionResult.encryptedData, 'base64').length
    };

    // 3. Create STANAG 4774 Security Label
    const securityLabel: ISTANAG4774Label = {
        classification: metadata.classification as ClassificationLevel,
        releasabilityTo: metadata.releasabilityTo,
        COI: metadata.COI || [],
        caveats: metadata.caveats || [],
        originatingCountry: uploader.countryOfAffiliation,
        creationDate: currentTimestamp
    };

    // Add display marking
    const displayMarking = generateDisplayMarking(securityLabel);

    const securityLabelWithMarking = {
        ...securityLabel,
        displayMarking
    };

    // 4. Create ZTDF Policy
    const policyAssertions = [
        {
            type: 'clearance-required',
            value: metadata.classification
        },
        {
            type: 'releasability-required',
            value: metadata.releasabilityTo
        },
        {
            type: 'uploaded-by',
            value: uploader.uniqueID
        }
    ];

    if (metadata.COI && metadata.COI.length > 0) {
        policyAssertions.push({
            type: 'coi-required',
            value: metadata.COI
        });
    }

    const policy = {
        policyVersion: '1.0',
        securityLabel: securityLabelWithMarking,
        policyAssertions,
        policyHash: '' // Will be computed below
    };

    // Compute policy hash (STANAG 4778)
    const policyForHash = { ...policy };
    delete (policyForHash as any).policyHash;
    policy.policyHash = computeObjectHash(policyForHash);

    // 5. Create Key Access Object (KAO)
    const kao = {
        kaoId: `kao-${uploadId}`,
        kasUrl: process.env.KAS_URL || 'http://localhost:8080/request-key',
        kasId: 'dive-v3-kas',
        wrappedKey: encryptionResult.dek, // In production, wrap with KAS public key
        wrappingAlgorithm: 'RSA-OAEP-256', // In production, use actual RSA wrapping
        policyBinding: {
            clearanceRequired: metadata.classification,
            countriesAllowed: metadata.releasabilityTo,
            coiRequired: metadata.COI || []
        },
        createdAt: currentTimestamp
    };

    // 6. Create Encrypted Payload Chunk
    const chunk = {
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData,
        size: Buffer.from(encryptionResult.encryptedData, 'base64').length,
        integrityHash: computeSHA384(encryptionResult.encryptedData)
    };

    // 7. Create ZTDF Payload
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects: [kao],
        encryptedChunks: [chunk],
        payloadHash: '' // Will be computed below
    };

    // Compute payload hash
    const chunksData = payload.encryptedChunks.map(c => c.encryptedData).join('');
    payload.payloadHash = computeSHA384(chunksData);

    // 8. Assemble ZTDF Object
    const ztdfObject: IZTDFObject = {
        manifest,
        policy,
        payload
    };

    logger.info('ZTDF object created', {
        objectId: manifest.objectId,
        classification: securityLabel.classification,
        displayMarking: securityLabel.displayMarking,
        policyHash: policy.policyHash,
        payloadHash: payload.payloadHash
    });

    return ztdfObject;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
        .replace(/_{2,}/g, '_')            // Replace multiple underscores with single
        .substring(0, 100);                // Limit length
}

