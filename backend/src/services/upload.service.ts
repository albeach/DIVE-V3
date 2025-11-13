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
    ClassificationLevel
} from '../types/ztdf.types';
import {
    encryptContent,
    computeSHA384,
    computeObjectHash,
    createSecurityLabel  // NEW: Use createSecurityLabel helper (ACP-240 Section 4.3)
} from '../utils/ztdf.utils';
import { createZTDFResource } from './resource.service';
import { validateCOICoherenceOrThrow } from './coi-validation.service';

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
        // 1. Validate COI coherence (CRITICAL: Fail-closed)
        validateCOICoherenceOrThrow({
            classification: metadata.classification,
            releasabilityTo: metadata.releasabilityTo,
            COI: metadata.COI || [],
            coiOperator: metadata.coiOperator || 'ALL',
            caveats: metadata.caveats
        });

        logger.info('COI validation passed', {
            uploadId,
            COI: metadata.COI,
            coiOperator: metadata.coiOperator || 'ALL',
            releasabilityTo: metadata.releasabilityTo,
            caveats: metadata.caveats
        });

        // 2. Validate file
        const validation = validateFile(fileBuffer, mimeType);
        if (!validation.valid) {
            throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
        }

        // 3. Convert file to base64 for encryption
        const base64Content = fileBuffer.toString('base64');

        // 4. Create ZTDF object
        const ztdfObject = await convertToZTDF(
            base64Content,
            uploadId,
            metadata,
            uploader,
            mimeType
        );

        // 5. Create ZTDF resource and store in MongoDB
        const ztdfResource: IZTDFResource = {
            resourceId: uploadId,
            title: metadata.title,
            ztdf: ztdfObject,
            legacy: {
                classification: metadata.classification,
                releasabilityTo: metadata.releasabilityTo,
                COI: metadata.COI || [],
                coiOperator: metadata.coiOperator || 'ALL',
                encrypted: true,
                encryptedContent: ztdfObject.payload.encryptedChunks[0]?.encryptedData
            }
        };

        await createZTDFResource(ztdfResource);

        logger.info('File upload successful', {
            uploadId,
            resourceId: ztdfResource.resourceId,
            displayMarking: ztdfObject.policy.securityLabel.displayMarking,
            coiOperator: metadata.coiOperator || 'ALL'
        });

        // 6. Return result (include full ZTDF for classification equivalency tests)
        return {
            success: true,
            resourceId: uploadId,
            ztdfObjectId: ztdfObject.manifest.objectId,
            displayMarking: ztdfObject.policy.securityLabel.displayMarking || '',
            ztdf: ztdfObject,  // Include full ZTDF object for test validation
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
 * Create multiple Key Access Objects for Multi-KAS support (ACP-240 Section 5.3)
 */
function createMultipleKAOs(params: {
    uploadId: string;
    releasabilityTo: string[];
    coiTags: string[];
    classification: string;
    wrappedKey: string;
    currentTimestamp: string;
    selectedCOI: string;
}): any[] {
    const kaos: any[] = [];
    const kasBaseUrl = process.env.KAS_URL || 'https://localhost:8080';

    // Strategy 1: COI-based KAOs
    if (params.coiTags && params.coiTags.length > 0) {
        for (const coi of params.coiTags) {
            kaos.push({
                kaoId: `kao-${coi.toLowerCase()}-${params.uploadId}`,
                kasUrl: `${kasBaseUrl}/request-key`,
                kasId: `${coi.toLowerCase()}-kas`,
                wrappedKey: params.wrappedKey,
                wrappingAlgorithm: 'AES-256-GCM-WRAPPED',
                policyBinding: {
                    clearanceRequired: params.classification,
                    countriesAllowed: params.releasabilityTo,
                    coiRequired: [coi]
                },
                createdAt: params.currentTimestamp
            });
        }
    }

    // Strategy 2: Nation-specific KAOs (max 3)
    const priorityNations = ['USA', 'GBR', 'FRA', 'CAN'];
    const relevantNations = params.releasabilityTo
        .filter(c => priorityNations.includes(c))
        .slice(0, 3);

    for (const nation of relevantNations) {
        const alreadyCovered = kaos.some(k =>
            k.policyBinding.countriesAllowed.length === 1 &&
            k.policyBinding.countriesAllowed[0] === nation
        );

        if (!alreadyCovered) {
            kaos.push({
                kaoId: `kao-${nation.toLowerCase()}-${params.uploadId}`,
                kasUrl: `${kasBaseUrl}/request-key`,
                kasId: `${nation.toLowerCase()}-kas`,
                wrappedKey: params.wrappedKey,
                wrappingAlgorithm: 'AES-256-GCM-WRAPPED',
                policyBinding: {
                    clearanceRequired: params.classification,
                    countriesAllowed: [nation],
                    coiRequired: []
                },
                createdAt: params.currentTimestamp
            });
        }
    }

    // Strategy 3: Fallback - ensure at least ONE KAO exists
    if (kaos.length === 0) {
        kaos.push({
            kaoId: `kao-default-${params.uploadId}`,
            kasUrl: `${kasBaseUrl}/request-key`,
            kasId: 'dive-v3-kas',
            wrappedKey: params.wrappedKey,
            wrappingAlgorithm: 'AES-256-GCM-WRAPPED',
            policyBinding: {
                clearanceRequired: params.classification,
                countriesAllowed: params.releasabilityTo,
                coiRequired: params.coiTags
            },
            createdAt: params.currentTimestamp
        });
    }

    return kaos;
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

    // 1. Encrypt content with COI-based community key (ACP-240 Section 5.3)
    const { selectCOIForResource } = await import('./coi-key-registry');
    const selectedCOI = selectCOIForResource(metadata.releasabilityTo, metadata.COI || []);
    const encryptionResult = encryptContent(base64Content, uploadId, selectedCOI);

    logger.info('Encrypting with COI key', {
        uploadId,
        selectedCOI,
        releasabilityTo: metadata.releasabilityTo,
        coiTags: metadata.COI
    });

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

    // 3. Create STANAG 4774 Security Label (ACP-240 Section 4.3 Enhanced)
    // Now includes originalClassification, originalCountry, natoEquivalent
    const securityLabel = createSecurityLabel({
        classification: metadata.classification as ClassificationLevel,
        originalClassification: metadata.originalClassification,  // NEW: ACP-240 Section 4.3
        originalCountry: metadata.originalCountry,                // NEW: ACP-240 Section 4.3
        releasabilityTo: metadata.releasabilityTo,
        COI: metadata.COI || [],
        caveats: metadata.caveats || [],
        originatingCountry: uploader.countryOfAffiliation,
        creationDate: currentTimestamp
    });

    logger.debug('Security label created with classification equivalency', {
        uploadId,
        classification: securityLabel.classification,
        originalClassification: securityLabel.originalClassification,
        originalCountry: securityLabel.originalCountry,
        natoEquivalent: securityLabel.natoEquivalent,
        originatingCountry: securityLabel.originatingCountry
    });

    // Display marking is already included in securityLabel from createSecurityLabel()
    const securityLabelWithMarking = securityLabel;

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
        policyAssertions.push({
            type: 'coi-operator',
            value: metadata.coiOperator || 'ALL'
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

    // 5. Create Multiple Key Access Objects (Multi-KAS Support - ACP-240 Section 5.3)
    // Each KAO represents a different KAS endpoint (per nation/COI)
    const kaos = createMultipleKAOs({
        uploadId,
        releasabilityTo: metadata.releasabilityTo,
        coiTags: metadata.COI || [],
        classification: metadata.classification,
        wrappedKey: encryptionResult.dek,
        currentTimestamp,
        selectedCOI
    });

    logger.info('Created multiple KAOs for coalition access', {
        uploadId,
        kaoCount: kaos.length,
        kaos: kaos.map(k => ({ kaoId: k.kaoId, kasId: k.kasId, coi: k.policyBinding.coiRequired }))
    });

    // 6. Create Encrypted Payload Chunk
    const chunk = {
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData,
        size: Buffer.from(encryptionResult.encryptedData, 'base64').length,
        integrityHash: computeSHA384(encryptionResult.encryptedData)
    };

    // 7. Create ZTDF Payload (with multiple KAOs)
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects: kaos, // Multiple KAOs for coalition scalability
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

