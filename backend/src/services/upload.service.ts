/**
 * Upload Service
 * Week 3.2: Secure File Upload with ACP-240 Compliance
 *
 * Handles file upload and automatic ZTDF conversion
 * Implements: AES-256-GCM encryption, STANAG 4774 labels, STANAG 4778 binding
 *
 * STANAG 4774/4778 Enhancement:
 * - Extracts BDO (Binding Data Object) from uploaded files
 * - Generates SPIF-compliant marking text
 * - Stores STANAG metadata for frontend rendering
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import {
    IUploadMetadata,
    IUploaderInfo,
    IUploadResult,
    IFileValidation,
    isAudioMimeType,
    isVideoMimeType,
    isMultimediaMimeType,
    MAX_FILE_SIZE,
    MAX_MULTIMEDIA_FILE_SIZE,
} from '../types/upload.types';
import {
    IZTDFObject,
    IZTDFResource,
    ClassificationLevel
} from '../types/ztdf.types';
import {
    ISTANAGResourceMetadata,
    IBindingDataObject,
    IMultimediaMetadata,
} from '../types/stanag.types';
import {
    encryptContent,
    computeSHA384,
    computeObjectHash,
    createSecurityLabel  // NEW: Use createSecurityLabel helper (ACP-240 Section 4.3)
} from '../utils/ztdf.utils';
import { createZTDFResource } from './resource.service';
import { validateCOICoherenceOrThrow } from './coi-validation.service';
import { extractBDO, createBDOFromMetadata } from './bdo-parser.service';
import { generateMarking } from './spif-parser.service';
import {
    extractMultimediaMetadata,
    validateMultimediaForClassification,
    supportsEmbeddedXMP,
    IMultimediaMetadata as IExtractedMultimediaMetadata,
} from './multimedia-metadata.service';
import {
    embedXMPInMP4,
    createXMPSidecar,
    getXMPSidecarFilename,
    requiresXMPSidecar,
} from './xmp-metadata.service';

/**
 * Upload file and convert to ZTDF
 *
 * STANAG 4774/4778 Enhancement:
 * - Attempts to extract existing BDO from uploaded file
 * - Falls back to user-provided metadata
 * - Generates SPIF-compliant markings for display
 */
export async function uploadFile(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    metadata: IUploadMetadata,
    uploader: IUploaderInfo
): Promise<IUploadResult> {

    // Generate resourceId with uploader's country code for provenance tracking
    // Format: doc-<COUNTRY>-upload-<timestamp>-<random>
    // Example: doc-USA-upload-1769078958301-0aed9424
    const uploaderCountry = uploader.countryOfAffiliation || 'UNK';
    const uploadId = `doc-${uploaderCountry}-upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    logger.info('Processing file upload', {
        uploadId,
        filename: originalFilename,
        mimeType,
        fileSize: fileBuffer.length,
        classification: metadata.classification,
        uploader: uploader.uniqueID,
        uploaderCountry
    });

    try {
        // 1. Extract existing BDO from file (STANAG 4778)
        let existingBDO: IBindingDataObject | null = null;
        try {
            existingBDO = await extractBDO(fileBuffer, mimeType, originalFilename);
            if (existingBDO) {
                logger.info('Extracted BDO from uploaded file', {
                    uploadId,
                    filename: originalFilename,
                    classification: existingBDO.originatorConfidentialityLabel.classification,
                    policyId: existingBDO.originatorConfidentialityLabel.policyIdentifier,
                });
            }
        } catch (bdoError) {
            logger.warn('BDO extraction failed, using user metadata', {
                uploadId,
                error: bdoError instanceof Error ? bdoError.message : 'Unknown error',
            });
        }

        // 2. Merge existing BDO with user metadata (user input takes precedence)
        const effectiveClassification = metadata.classification ||
            existingBDO?.originatorConfidentialityLabel.classification ||
            'UNCLASSIFIED';

        const effectiveReleasability = metadata.releasabilityTo.length > 0
            ? metadata.releasabilityTo
            : extractReleasabilityFromBDO(existingBDO);

        // 3. Validate COI coherence (CRITICAL: Fail-closed)
        validateCOICoherenceOrThrow({
            classification: effectiveClassification,
            releasabilityTo: effectiveReleasability,
            COI: metadata.COI || [],
            coiOperator: metadata.coiOperator || 'ALL',
            caveats: metadata.caveats
        });

        logger.info('COI validation passed', {
            uploadId,
            COI: metadata.COI,
            coiOperator: metadata.coiOperator || 'ALL',
            releasabilityTo: effectiveReleasability,
            caveats: metadata.caveats
        });

        // 4. Validate file
        const validation = validateFile(fileBuffer, mimeType);
        if (!validation.valid) {
            throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
        }

        // 4.5 Extract multimedia metadata (for audio/video files)
        let multimediaMetadata: IMultimediaMetadata | undefined;
        let processedBuffer = fileBuffer;
        let xmpSidecarContent: string | undefined;

        if (isMultimediaMimeType(mimeType)) {
            try {
                logger.info('Extracting multimedia metadata', { uploadId, mimeType });

                // Extract audio/video metadata
                const extractedMetadata = await extractMultimediaMetadata(fileBuffer, mimeType);

                // Validate against classification policy
                const policyValidation = validateMultimediaForClassification(
                    extractedMetadata,
                    effectiveClassification,
                    fileBuffer.length
                );

                if (!policyValidation.valid) {
                    throw new Error(`Multimedia policy validation failed: ${policyValidation.errors.join(', ')}`);
                }

                multimediaMetadata = {
                    duration: extractedMetadata.duration,
                    bitrate: extractedMetadata.bitrate,
                    codec: extractedMetadata.codec,
                    resolution: (extractedMetadata as any).resolution,
                    sampleRate: extractedMetadata.sampleRate,
                    channels: extractedMetadata.channels,
                    hasAudio: extractedMetadata.hasAudio,
                    hasVideo: extractedMetadata.hasVideo,
                    format: extractedMetadata.format,
                    width: (extractedMetadata as any).width,
                    height: (extractedMetadata as any).height,
                    frameRate: (extractedMetadata as any).frameRate,
                    aspectRatio: (extractedMetadata as any).aspectRatio,
                    videoCodec: (extractedMetadata as any).videoCodec,
                    audioCodec: (extractedMetadata as any).audioCodec,
                };

                logger.info('Multimedia metadata extracted', {
                    uploadId,
                    duration: multimediaMetadata.duration,
                    hasAudio: multimediaMetadata.hasAudio,
                    hasVideo: multimediaMetadata.hasVideo,
                    codec: multimediaMetadata.codec,
                });
            } catch (mmError) {
                logger.warn('Multimedia metadata extraction failed, continuing without it', {
                    uploadId,
                    error: mmError instanceof Error ? mmError.message : 'Unknown error',
                });
            }
        }

        // 5. Generate STANAG-compliant marking using SPIF (STANAG 4774)
        // Detect language based on uploader's country (for localized classification labels)
        const language = uploader.countryOfAffiliation === 'FRA' ? 'fr' : 'en';

        const stanagMarking = await generateMarking(
            effectiveClassification,
            effectiveReleasability,
            {
                COI: metadata.COI,
                caveats: metadata.caveats,
                language,
            }
        );

        logger.info('Generated STANAG marking', {
            uploadId,
            displayMarking: stanagMarking.displayMarking,
            portionMarking: stanagMarking.portionMarking,
            watermarkText: stanagMarking.watermarkText,
        });

        // 6. Create or preserve BDO for storage
        const bdo = existingBDO || createBDOFromMetadata(
            effectiveClassification,
            effectiveReleasability,
            {
                COI: metadata.COI,
                caveats: metadata.caveats,
                title: metadata.title,
                creator: uploader.uniqueID,
            }
        );

        // 6.5 Handle XMP metadata binding for multimedia files (STANAG 4778)
        if (isMultimediaMimeType(mimeType)) {
            try {
                if (requiresXMPSidecar(mimeType)) {
                    // Create XMP sidecar for MP3, WAV, WebM, OGG
                    xmpSidecarContent = createXMPSidecar(
                        originalFilename,
                        bdo.originatorConfidentialityLabel,
                        {
                            title: metadata.title,
                            creator: uploader.uniqueID,
                            mimeType,
                        }
                    );

                    if (multimediaMetadata) {
                        multimediaMetadata.xmpEmbedded = false;
                        multimediaMetadata.xmpSidecarFilename = getXMPSidecarFilename(originalFilename);
                    }

                    logger.info('Created XMP sidecar for multimedia', {
                        uploadId,
                        mimeType,
                        sidecarFilename: getXMPSidecarFilename(originalFilename),
                    });
                } else {
                    // Embed XMP in MP4/M4A
                    processedBuffer = await embedXMPInMP4(
                        fileBuffer,
                        bdo.originatorConfidentialityLabel,
                        {
                            title: metadata.title,
                            creator: uploader.uniqueID,
                        }
                    );

                    if (multimediaMetadata) {
                        multimediaMetadata.xmpEmbedded = true;
                    }

                    logger.info('Embedded XMP in MP4/M4A', {
                        uploadId,
                        mimeType,
                        originalSize: fileBuffer.length,
                        processedSize: processedBuffer.length,
                    });
                }
            } catch (xmpError) {
                logger.warn('XMP processing failed, continuing without XMP binding', {
                    uploadId,
                    error: xmpError instanceof Error ? xmpError.message : 'Unknown error',
                });
                // Use original buffer if XMP processing fails
                processedBuffer = fileBuffer;
            }
        }

        // 7. Create STANAG resource metadata
        const stanagMetadata: ISTANAGResourceMetadata = {
            bdo,
            watermarkText: stanagMarking.watermarkText,
            displayMarking: stanagMarking.displayMarking,
            originalClassification: metadata.originalClassification,
            originalCountry: metadata.originalCountry,
            natoEquivalent: effectiveClassification,
        };

        // 8. Convert file to base64 for encryption (use processed buffer for multimedia)
        const base64Content = processedBuffer.toString('base64');

        // 9. Create ZTDF object
        const ztdfObject = await convertToZTDF(
            base64Content,
            uploadId,
            { ...metadata, classification: effectiveClassification as ClassificationLevel },
            uploader,
            mimeType
        );

        // 10. Create ZTDF resource and store in MongoDB
        const ztdfResource: IZTDFResource = {
            resourceId: uploadId,
            title: metadata.title,
            ztdf: ztdfObject,
            // Minimal legacy field - only classification for backwards compat
            legacy: {
                classification: effectiveClassification as any,
                releasabilityTo: effectiveReleasability,
                COI: metadata.COI || [],
                coiOperator: metadata.coiOperator || 'ALL',
                encrypted: true,
                encryptedContent: null  // NEVER store content inline - always use GridFS or ZTDF payload
            },
            stanag: stanagMetadata,
            // Add multimedia metadata if present
            multimedia: multimediaMetadata,
        };

        // Store XMP sidecar content in the resource if created
        if (xmpSidecarContent && ztdfResource.multimedia) {
            // Note: In production, store sidecar in GridFS and save fileId
            // For now, we just track that a sidecar exists
            logger.debug('XMP sidecar created for resource', {
                uploadId,
                sidecarFilename: multimediaMetadata?.xmpSidecarFilename,
            });
        }

        await createZTDFResource(ztdfResource);

        logger.info('File upload successful with STANAG metadata', {
            uploadId,
            resourceId: ztdfResource.resourceId,
            displayMarking: stanagMarking.displayMarking,
            coiOperator: metadata.coiOperator || 'ALL',
            hasBDO: !!existingBDO,
            isMultimedia: !!multimediaMetadata,
            hasXmpEmbedded: multimediaMetadata?.xmpEmbedded,
            duration: multimediaMetadata?.duration,
        });

        // 11. Return result (include full ZTDF for classification equivalency tests)
        return {
            success: true,
            resourceId: uploadId,
            ztdfObjectId: ztdfObject.manifest.objectId,
            displayMarking: stanagMarking.displayMarking,
            ztdf: ztdfObject,  // Include full ZTDF object for test validation
            metadata: {
                fileSize: fileBuffer.length,
                mimeType,
                originalFilename,
                uploadedAt: new Date().toISOString(),
                uploadedBy: uploader.uniqueID,
                classification: effectiveClassification,
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
 * Extract releasability countries from BDO categories
 */
function extractReleasabilityFromBDO(bdo: IBindingDataObject | null): string[] {
    if (!bdo) return [];

    const categories = bdo.originatorConfidentialityLabel.categories;
    if (!categories) return [];

    // Look for releasability category
    const releasabilityCategory = categories.find(
        c => c.tagName.toLowerCase().includes('releasab') ||
            c.tagSetId === '1.3.26.1.4.2'
    );

    return releasabilityCategory?.values || [];
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

    // File size limits based on content type
    const isMultimedia = isMultimediaMimeType(mimeType);
    const maxSize = isMultimedia ? MAX_MULTIMEDIA_FILE_SIZE : MAX_FILE_SIZE;
    if (fileBuffer.length > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(1);
        errors.push(`File size ${fileSizeMB}MB exceeds maximum ${maxSizeMB}MB for ${isMultimedia ? 'multimedia' : 'document'} files`);
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

    // MP3: FF FB or FF FA or FF F3 or ID3 (ID3 tag)
    if (mimeType === 'audio/mpeg') {
        const header = fileBuffer.slice(0, 3);
        const isMP3Frame = header[0] === 0xFF && (header[1] & 0xE0) === 0xE0;
        const isID3 = header.toString('ascii').startsWith('ID3');
        if (!isMP3Frame && !isID3) {
            warnings.push('File may not be a valid MP3 (magic number check inconclusive)');
        }
    }

    // MP4/M4A: ftyp at offset 4-8
    if (mimeType === 'video/mp4' || mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') {
        const ftypCheck = fileBuffer.slice(4, 8).toString('ascii');
        if (ftypCheck !== 'ftyp') {
            warnings.push('File may not be a valid MP4/M4A (ftyp atom not found)');
        }
    }

    // WAV: RIFF....WAVE
    if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
        const riff = fileBuffer.slice(0, 4).toString('ascii');
        const wave = fileBuffer.slice(8, 12).toString('ascii');
        if (riff !== 'RIFF' || wave !== 'WAVE') {
            errors.push('File does not appear to be a valid WAV (RIFF/WAVE header not found)');
        }
    }

    // WebM: 1A 45 DF A3 (EBML header)
    if (mimeType === 'video/webm' || mimeType === 'audio/webm') {
        const header = fileBuffer.slice(0, 4);
        if (!(header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3)) {
            warnings.push('File may not be a valid WebM (EBML header not found)');
        }
    }

    // OGG: OggS
    if (mimeType === 'audio/ogg' || mimeType === 'video/ogg') {
        const header = fileBuffer.slice(0, 4).toString('ascii');
        if (header !== 'OggS') {
            errors.push('File does not appear to be a valid OGG (OggS header not found)');
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
    // For large files (>10MB encrypted), store in GridFS to avoid BSON 16MB limit
    const encryptedSize = Buffer.from(encryptionResult.encryptedData, 'base64').length;
    const GRIDFS_THRESHOLD = 10 * 1024 * 1024; // 10MB threshold
    const useGridFS = encryptedSize >= GRIDFS_THRESHOLD;

    let chunk;

    if (useGridFS) {
        // Store large encrypted payload in GridFS
        const { uploadToGridFS } = await import('./gridfs.service');
        const gridfsFileId = await uploadToGridFS(
            encryptionResult.encryptedData,
            `${uploadId}.encrypted`,
            {
                resourceId: uploadId,
                contentType: mimeType,
                classification: metadata.classification,
                size: encryptedSize
            }
        );

        chunk = {
            chunkId: 0,
            gridfsFileId,
            storageMode: 'gridfs' as const,
            size: encryptedSize,
            integrityHash: computeSHA384(encryptionResult.encryptedData)
        };

        logger.info('Encrypted payload stored in GridFS', {
            uploadId,
            gridfsFileId,
            size: encryptedSize
        });
    } else {
        // Store small encrypted payload inline (original behavior)
        chunk = {
            chunkId: 0,
            encryptedData: encryptionResult.encryptedData,
            storageMode: 'inline' as const,
            size: encryptedSize,
            integrityHash: computeSHA384(encryptionResult.encryptedData)
        };

        logger.debug('Encrypted payload stored inline', {
            uploadId,
            size: encryptedSize
        });
    }

    // 7. Create ZTDF Payload (with multiple KAOs)
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects: kaos, // Multiple KAOs for coalition scalability
        encryptedChunks: [chunk],
        // CRITICAL: Compute payloadHash from actual encrypted data, not from chunk fields
        // For GridFS chunks, chunk.encryptedData is undefined, so we must use the original
        payloadHash: computeSHA384(encryptionResult.encryptedData)
    };

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
