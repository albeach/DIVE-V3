/**
 * ZTDF Export Service
 * 
 * Converts DIVE V3 custom ZTDF format to OpenTDF spec 4.3.0 compliant format
 * for interoperability with OpenTDF CLI and SDK tools.
 * 
 * CRITICAL: This service creates OpenTDF-compliant ZIP archives with:
 * - 0.manifest.json (TDF 4.3.0 structure)
 * - 0.payload (binary encrypted content)
 * 
 * References:
 * - OpenTDF Spec: https://github.com/opentdf/spec
 * - Gap Analysis: docs/ZTDF_FORMAT_GAP_ANALYSIS.md
 */

import JSZip from 'jszip';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import {
    IOpenTDFManifest,
    IOpenTDFPayloadReference,
    IOpenTDFEncryptionInformation,
    IOpenTDFEncryptionMethod,
    IOpenTDFKeyAccessObject,
    IOpenTDFPolicyBinding,
    IOpenTDFIntegrityInformation,
    IOpenTDFRootSignature,
    IOpenTDFSegmentInfo,
    IOpenTDFAssertion,
    IOpenTDFAssertionStatement,
    IOpenTDFAssertionValue,
    IOpenTDFConfidentialityInformation,
    IOpenTDFCategory,
    IOpenTDFAssertionBinding,
    IOpenTDFPolicy,
    IOpenTDFPolicyBody,
    IZTDFExportResult,
    IZTDFExportOptions
} from '../types/opentdf.types';
import {
    IZTDFObject,
    IKeyAccessObject,
    ISTANAG4774Label,
    IPolicyAssertion
} from '../types/ztdf.types';

/**
 * Convert DIVE V3 ZTDF object to OpenTDF-compliant ZIP archive
 * 
 * @param ztdf - DIVE V3 ZTDF object from MongoDB
 * @param options - Export configuration options
 * @returns Export result with ZIP buffer and metadata
 * 
 * @throws Error if ZTDF validation fails or conversion errors occur
 */
export async function convertToOpenTDFFormat(
    ztdf: IZTDFObject,
    options?: IZTDFExportOptions
): Promise<IZTDFExportResult> {
    const exportId = `export-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    logger.info('Starting ZTDF export conversion', {
        exportId,
        resourceId: ztdf.manifest.objectId,
        tdfSpecVersion: '4.3.0'
    });

    try {
        // Set default options
        const opts: Required<IZTDFExportOptions> = {
            includeAssertionSignatures: options?.includeAssertionSignatures ?? true,
            validateIntegrity: options?.validateIntegrity ?? true,
            compressionLevel: options?.compressionLevel ?? 0, // STORE (no compression)
            includeLegacyFields: options?.includeLegacyFields ?? false
        };

        // 1. Validate ZTDF structure
        if (opts.validateIntegrity) {
            validateZTDFStructure(ztdf);
        }

        // 2. Build OpenTDF manifest (0.manifest.json)
        const manifest = buildOpenTDFManifest(ztdf, opts);

        // 3. Extract binary payload (0.payload)
        const payloadBuffer = extractPayloadBuffer(ztdf);

        // 4. Create ZIP archive
        const zip = new JSZip();
        
        // Add manifest as formatted JSON (human-readable)
        const manifestJson = JSON.stringify(manifest, null, 2);
        zip.file('0.manifest.json', manifestJson);
        
        // Add payload as binary (no compression to match OpenTDF spec)
        zip.file('0.payload', payloadBuffer);

        // 5. Generate ZIP buffer
        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: opts.compressionLevel === 0 ? 'STORE' : 'DEFLATE',
            compressionOptions: {
                level: opts.compressionLevel
            }
        });

        // 6. Calculate ZIP hash for integrity
        const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');

        // 7. Build export result
        const result: IZTDFExportResult = {
            success: true,
            zipBuffer,
            fileSize: zipBuffer.length,
            zipHash,
            filename: `${ztdf.manifest.objectId}.ztdf`,
            metadata: {
                resourceId: ztdf.manifest.objectId,
                exportedAt: new Date().toISOString(),
                manifestSize: Buffer.from(manifestJson).length,
                payloadSize: payloadBuffer.length,
                tdfSpecVersion: '4.3.0'
            }
        };

        logger.info('ZTDF export completed successfully', {
            exportId,
            resourceId: ztdf.manifest.objectId,
            zipSize: zipBuffer.length,
            manifestSize: result.metadata.manifestSize,
            payloadSize: result.metadata.payloadSize,
            zipHash
        });

        return result;

    } catch (error) {
        logger.error('ZTDF export failed', {
            exportId,
            resourceId: ztdf.manifest.objectId,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Validate ZTDF structure before export
 * Ensures required fields are present
 */
function validateZTDFStructure(ztdf: IZTDFObject): void {
    if (!ztdf.manifest?.objectId) {
        throw new Error('ZTDF validation failed: Missing manifest.objectId');
    }

    if (!ztdf.payload?.encryptedChunks || ztdf.payload.encryptedChunks.length === 0) {
        throw new Error('ZTDF validation failed: Missing encrypted payload chunks');
    }

    if (!ztdf.payload.keyAccessObjects || ztdf.payload.keyAccessObjects.length === 0) {
        throw new Error('ZTDF validation failed: Missing key access objects');
    }

    if (!ztdf.policy?.securityLabel) {
        throw new Error('ZTDF validation failed: Missing security label');
    }

    logger.debug('ZTDF structure validation passed', {
        resourceId: ztdf.manifest.objectId,
        chunkCount: ztdf.payload.encryptedChunks.length,
        kaoCount: ztdf.payload.keyAccessObjects.length
    });
}

/**
 * Build OpenTDF manifest (0.manifest.json)
 * Maps DIVE V3 structure to TDF 4.3.0 spec
 */
function buildOpenTDFManifest(
    ztdf: IZTDFObject,
    options: Required<IZTDFExportOptions>
): IOpenTDFManifest {
    
    const manifest: IOpenTDFManifest = {
        tdf_spec_version: '4.3.0',
        payload: buildPayloadReference(ztdf),
        encryptionInformation: buildEncryptionInformation(ztdf),
        assertions: buildAssertions(ztdf, options)
    };

    logger.debug('OpenTDF manifest built', {
        resourceId: ztdf.manifest.objectId,
        payloadUrl: manifest.payload.url,
        keyAccessCount: manifest.encryptionInformation.keyAccess.length,
        assertionCount: manifest.assertions.length
    });

    return manifest;
}

/**
 * Build payload reference section
 */
function buildPayloadReference(ztdf: IZTDFObject): IOpenTDFPayloadReference {
    return {
        type: 'reference',
        url: '0.payload',
        protocol: 'zip',
        isEncrypted: true,
        mimeType: ztdf.manifest.contentType || 'application/octet-stream'
    };
}

/**
 * Build encryption information section
 * Maps DIVE V3 encryption details to OpenTDF format
 */
function buildEncryptionInformation(ztdf: IZTDFObject): IOpenTDFEncryptionInformation {
    const method = buildEncryptionMethod(ztdf);
    const keyAccess = buildKeyAccessObjects(ztdf);
    const policy = buildPolicyString(ztdf);
    const integrityInformation = buildIntegrityInformation(ztdf);

    return {
        type: 'split',
        method,
        keyAccess,
        policy,
        integrityInformation
    };
}

/**
 * Build encryption method
 */
function buildEncryptionMethod(ztdf: IZTDFObject): IOpenTDFEncryptionMethod {
    return {
        algorithm: ztdf.payload.encryptionAlgorithm || 'AES-256-GCM',
        isStreamable: true,
        iv: ztdf.payload.iv || '' // May be empty if IV is per-segment
    };
}

/**
 * Build key access objects array
 * Maps DIVE V3 KAOs to OpenTDF format
 */
function buildKeyAccessObjects(ztdf: IZTDFObject): IOpenTDFKeyAccessObject[] {
    return ztdf.payload.keyAccessObjects.map((kao, index) => {
        return mapKeyAccessObject(kao, index);
    });
}

/**
 * Map single key access object to OpenTDF format
 */
function mapKeyAccessObject(
    kao: IKeyAccessObject,
    index: number
): IOpenTDFKeyAccessObject {
    // Extract KAS URL (handle both formats)
    const kasUrl = kao.kasUrl || 'https://kas.dive25.com';

    // Build policy binding hash
    // DIVE V3 stores policy binding differently, so we compute a hash
    const policyBindingData = JSON.stringify({
        clearanceRequired: kao.policyBinding?.clearanceRequired,
        countriesAllowed: kao.policyBinding?.countriesAllowed,
        coiRequired: kao.policyBinding?.coiRequired
    });
    const policyHash = crypto.createHash('sha256').update(policyBindingData).digest('base64');

    const policyBinding: IOpenTDFPolicyBinding = {
        alg: 'HS256',
        hash: policyHash
    };

    return {
        type: 'wrapped',
        protocol: 'kas',
        url: kasUrl,
        kid: `r${index + 1}`, // Key ID: r1, r2, r3, etc.
        sid: `${index + 1}`, // Split ID: 1, 2, 3, etc.
        wrappedKey: kao.wrappedKey,
        policyBinding,
        tdf_spec_version: '1.0'
    };
}

/**
 * Build policy string (base64-encoded JSON)
 * Converts DIVE V3 policy to OpenTDF format and base64-encodes it
 */
function buildPolicyString(ztdf: IZTDFObject): string {
    // Build OpenTDF policy structure
    const policy: IOpenTDFPolicy = {
        uuid: crypto.randomUUID(), // Generate new UUID for this export
        body: buildPolicyBody(ztdf)
    };

    // Serialize to JSON
    const policyJson = JSON.stringify(policy);

    // Base64 encode
    const policyBase64 = Buffer.from(policyJson, 'utf-8').toString('base64');

    logger.debug('Policy encoded to base64', {
        resourceId: ztdf.manifest.objectId,
        policyId: policy.uuid,
        policySize: policyJson.length,
        base64Size: policyBase64.length
    });

    return policyBase64;
}

/**
 * Build policy body
 * Maps DIVE V3 security label to OpenTDF data attributes
 */
function buildPolicyBody(ztdf: IZTDFObject): IOpenTDFPolicyBody {
    const label = ztdf.policy.securityLabel;

    // For OpenTDF compatibility, we include minimal data attributes
    // The full STANAG labels are in assertions
    return {
        dataAttributes: null, // Optional in TDF 4.3.0
        dissem: label.releasabilityTo || null
    };
}

/**
 * Build integrity information
 * Maps DIVE V3 payload hashes to OpenTDF segment structure
 */
function buildIntegrityInformation(ztdf: IZTDFObject): IOpenTDFIntegrityInformation {
    // Build root signature
    const rootSignature: IOpenTDFRootSignature = {
        alg: 'HS256',
        sig: ztdf.payload.payloadHash || ''
    };

    // Build segments (one per encrypted chunk)
    const segments: IOpenTDFSegmentInfo[] = ztdf.payload.encryptedChunks.map(chunk => {
        const encryptedData = Buffer.from(chunk.encryptedData, 'base64');
        const encryptedSize = encryptedData.length;
        
        // Estimate plaintext size (subtract auth tag size: 16 bytes for GCM)
        const plaintextSize = encryptedSize - 16;

        return {
            hash: chunk.integrityHash || '',
            segmentSize: plaintextSize > 0 ? plaintextSize : encryptedSize,
            encryptedSegmentSize: encryptedSize
        };
    });

    // Calculate defaults (use first segment or fallback to 2MB)
    const segmentSizeDefault = segments[0]?.segmentSize || 2097152; // 2 MB
    const encryptedSegmentSizeDefault = segments[0]?.encryptedSegmentSize || 2097180; // 2 MB + overhead

    return {
        rootSignature,
        segmentSizeDefault,
        encryptedSegmentSizeDefault,
        segmentHashAlg: 'GMAC',
        segments
    };
}

/**
 * Build assertions array
 * Converts DIVE V3 STANAG labels to OpenTDF assertions
 */
function buildAssertions(
    ztdf: IZTDFObject,
    options: Required<IZTDFExportOptions>
): IOpenTDFAssertion[] {
    const assertions: IOpenTDFAssertion[] = [];

    // Primary assertion: STANAG 4774 security label
    const stanagAssertion = buildSTANAGAssertion(ztdf, options);
    assertions.push(stanagAssertion);

    // Add additional assertions from DIVE V3 policy (if any)
    if (ztdf.policy.policyAssertions && ztdf.policy.policyAssertions.length > 0) {
        ztdf.policy.policyAssertions.forEach((diveAssertion: IPolicyAssertion, index: number) => {
            const additionalAssertion = mapDIVEAssertionToOpenTDF(diveAssertion, index + 2);
            assertions.push(additionalAssertion);
        });
    }

    return assertions;
}

/**
 * Build STANAG 4774 assertion from security label
 * This is the primary handling assertion for coalition environments
 */
function buildSTANAGAssertion(
    ztdf: IZTDFObject,
    options: Required<IZTDFExportOptions>
): IOpenTDFAssertion {
    const label = ztdf.policy.securityLabel;

    // Build assertion value (STANAG 4774 structure)
    const assertionValue: IOpenTDFAssertionValue = {
        Xmlns: 'urn:nato:stanag:4774:confidentialitymetadatalabel:1:0',
        CreationTime: label.creationDate || new Date().toISOString(),
        ConfidentialityInformation: buildConfidentialityInformation(label)
    };

    // Build assertion statement
    const statement: IOpenTDFAssertionStatement = {
        format: 'json-structured',
        value: assertionValue
    };

    // Build assertion binding (signature)
    const binding: IOpenTDFAssertionBinding = {
        method: 'jws',
        signature: buildAssertionSignature(assertionValue, options)
    };

    return {
        id: '1',
        type: 'handling',
        scope: 'payload',
        appliesToState: 'unencrypted',
        statement,
        binding
    };
}

/**
 * Build STANAG 4774 confidentiality information
 */
function buildConfidentialityInformation(
    label: ISTANAG4774Label
): IOpenTDFConfidentialityInformation {
    // Build category (includes COI, releasability)
    const category: IOpenTDFCategory = {
        Type: label.COI && label.COI.length > 0 ? 'COI' : 'RELTO',
        TagName: label.COI && label.COI.length > 0 ? label.COI[0] : '',
        GenericValues: label.releasabilityTo || []
    };

    return {
        Classification: label.classification,
        PolicyIdentifier: label.COI?.join(',') || '',
        Category: category
    };
}

/**
 * Build assertion signature (JWS)
 * For pilot: Creates HMAC-based signature
 * Production: Should use proper JWS with RS256/ES256
 */
function buildAssertionSignature(
    assertionValue: IOpenTDFAssertionValue,
    options: Required<IZTDFExportOptions>
): string {
    if (!options.includeAssertionSignatures) {
        return ''; // Empty signature (validation will be skipped)
    }

    // For pilot: Create simple HMAC signature
    // Production: Use proper JWS library (e.g., jose)
    const assertionJson = JSON.stringify(assertionValue);
    const assertionHash = crypto
        .createHash('sha256')
        .update(assertionJson)
        .digest('base64');

    // Create minimal JWT structure (header.payload.signature)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
        assertionHash,
        assertionSig: assertionHash.substring(0, 32) // Simplified for pilot
    })).toString('base64');

    // For pilot, use simple HMAC signature
    // Production should use proper private key signing
    const signature = crypto
        .createHmac('sha256', 'dive-v3-broker-secret')
        .update(`${header}.${payload}`)
        .digest('base64');

    return `${header}.${payload}.${signature}`;
}

/**
 * Map DIVE V3 assertion to OpenTDF assertion
 * Handles custom assertions beyond STANAG labels
 */
function mapDIVEAssertionToOpenTDF(
    diveAssertion: IPolicyAssertion,
    id: number
): IOpenTDFAssertion {
    // Build statement from DIVE assertion
    const statement: IOpenTDFAssertionStatement = {
        format: 'json-structured',
        value: diveAssertion.value || {}
    };

    // Build binding (create signature for policy assertion)
    const assertionJson = JSON.stringify(diveAssertion.value);
    const assertionHash = crypto.createHash('sha256').update(assertionJson).digest('base64');
    const signature = buildAssertionSignatureSimple(assertionHash);

    const binding: IOpenTDFAssertionBinding = {
        method: 'jws',
        signature
    };

    return {
        id: String(id),
        type: diveAssertion.type === 'clearance-required' || diveAssertion.type === 'coi-required' 
            ? 'handling' 
            : 'custom',
        scope: 'payload',
        appliesToState: 'unencrypted',
        statement,
        binding
    };
}

/**
 * Build simple assertion signature (helper)
 */
function buildAssertionSignatureSimple(hash: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ assertionHash: hash })).toString('base64');
    const signature = crypto
        .createHmac('sha256', 'dive-v3-broker-secret')
        .update(`${header}.${payload}`)
        .digest('base64');

    return `${header}.${payload}.${signature}`;
}

/**
 * Extract binary payload from ZTDF
 * Converts base64-encoded chunks to binary buffer
 */
function extractPayloadBuffer(ztdf: IZTDFObject): Buffer {
    if (!ztdf.payload.encryptedChunks || ztdf.payload.encryptedChunks.length === 0) {
        throw new Error('No encrypted chunks found in ZTDF payload');
    }

    // For single-chunk files (typical case)
    if (ztdf.payload.encryptedChunks.length === 1) {
        const chunk = ztdf.payload.encryptedChunks[0];
        return Buffer.from(chunk.encryptedData, 'base64');
    }

    // For multi-chunk files, concatenate all chunks
    const buffers = ztdf.payload.encryptedChunks.map(chunk => {
        return Buffer.from(chunk.encryptedData, 'base64');
    });

    return Buffer.concat(buffers);
}

/**
 * Validate exported ZTDF file
 * Used for testing to ensure OpenTDF compliance
 */
export async function validateExportedZTDF(zipBuffer: Buffer): Promise<{
    valid: boolean;
    errors: string[];
}> {
    const errors: string[] = [];

    try {
        // 1. Verify it's a valid ZIP
        const zip = await JSZip.loadAsync(zipBuffer);

        // 2. Check for required files
        if (!zip.files['0.manifest.json']) {
            errors.push('Missing 0.manifest.json');
        }

        if (!zip.files['0.payload']) {
            errors.push('Missing 0.payload');
        }

        // 3. Validate manifest structure
        if (zip.files['0.manifest.json']) {
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            if (manifest.tdf_spec_version !== '4.3.0') {
                errors.push(`Invalid tdf_spec_version: ${manifest.tdf_spec_version} (expected 4.3.0)`);
            }

            if (manifest.payload?.type !== 'reference') {
                errors.push('payload.type must be "reference"');
            }

            if (manifest.payload?.protocol !== 'zip') {
                errors.push('payload.protocol must be "zip"');
            }

            if (!manifest.encryptionInformation) {
                errors.push('Missing encryptionInformation');
            }

            if (!manifest.assertions || manifest.assertions.length === 0) {
                errors.push('Missing assertions');
            }
        }

        // 4. Validate payload is binary
        if (zip.files['0.payload']) {
            const payloadBuffer = await zip.files['0.payload'].async('nodebuffer');
            if (payloadBuffer.length === 0) {
                errors.push('Payload is empty');
            }
        }

    } catch (error) {
        errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
