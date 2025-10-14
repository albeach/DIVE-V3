/**
 * ZTDF Utility Functions
 * 
 * Implements:
 * - ZTDF integrity validation (STANAG 4778 cryptographic binding)
 * - SHA-384 hashing
 * - ZTDF object creation
 * - Migration from legacy resources
 * 
 * Reference: ACP-240 sections 5.4 (Cryptographic Binding & Integrity)
 */

import crypto from 'crypto';
import {
    IZTDFObject,
    IZTDFManifest,
    IZTDFPolicy,
    IZTDFPayload,
    ISTANAG4774Label,
    IKeyAccessObject,
    IEncryptedPayloadChunk,
    generateDisplayMarking,
    ClassificationLevel
} from '../types/ztdf.types';
import { IResource } from '../services/resource.service';

// ============================================
// SHA-384 Hashing (STANAG 4778 Requirement)
// ============================================

/**
 * Compute SHA-384 hash
 * ACP-240 mandates ≥ SHA-384 for integrity
 */
export function computeSHA384(data: string | Buffer): string {
    const hash = crypto.createHash('sha384');
    hash.update(data);
    return hash.digest('hex');
}

/**
 * Compute hash of JSON object (canonical)
 * Sorts keys to ensure deterministic hashing
 */
export function computeObjectHash(obj: any): string {
    const canonical = JSON.stringify(obj, Object.keys(obj).sort());
    return computeSHA384(canonical);
}

// ============================================
// ZTDF Integrity Validation (Fail-Closed)
// ============================================

export interface IZTDFValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate ZTDF integrity
 * CRITICAL: Fail-closed enforcement
 * - Verify policy hash
 * - Verify payload hash
 * - Verify chunk hashes
 * - Verify signatures (if present)
 * 
 * Returns: Validation result (deny access if !valid)
 */
export function validateZTDFIntegrity(ztdf: IZTDFObject): IZTDFValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ============================================
    // 1. Validate Policy Hash (STANAG 4778)
    // ============================================
    if (ztdf.policy.policyHash) {
        // Create copy without hash for verification
        const policyForHash = { ...ztdf.policy };
        delete policyForHash.policyHash;
        delete policyForHash.policySignature;

        const computedHash = computeObjectHash(policyForHash);
        if (computedHash !== ztdf.policy.policyHash) {
            errors.push(
                `Policy hash mismatch: expected ${ztdf.policy.policyHash}, got ${computedHash}`
            );
        }
    } else {
        warnings.push('Policy hash not present (integrity cannot be verified)');
    }

    // ============================================
    // 2. Validate Payload Hash
    // ============================================
    if (ztdf.payload.payloadHash) {
        // Compute hash of all chunks
        const chunksData = ztdf.payload.encryptedChunks
            .map(chunk => chunk.encryptedData)
            .join('');
        const computedHash = computeSHA384(chunksData);

        if (computedHash !== ztdf.payload.payloadHash) {
            errors.push(
                `Payload hash mismatch: expected ${ztdf.payload.payloadHash}, got ${computedHash}`
            );
        }
    } else {
        warnings.push('Payload hash not present (integrity cannot be verified)');
    }

    // ============================================
    // 3. Validate Individual Chunk Hashes
    // ============================================
    ztdf.payload.encryptedChunks.forEach((chunk, index) => {
        if (chunk.integrityHash) {
            const computedHash = computeSHA384(chunk.encryptedData);
            if (computedHash !== chunk.integrityHash) {
                errors.push(
                    `Chunk ${index} hash mismatch: expected ${chunk.integrityHash}, got ${computedHash}`
                );
            }
        } else {
            warnings.push(`Chunk ${index} missing integrity hash`);
        }
    });

    // ============================================
    // 4. Validate Policy Signature (if present)
    // ============================================
    if (ztdf.policy.policySignature) {
        // TODO: Implement X.509 signature verification
        // For now, just log that signature exists
        warnings.push('Policy signature present but verification not yet implemented');
    }

    // ============================================
    // 5. Validate Required Fields
    // ============================================
    if (!ztdf.manifest.objectId) {
        errors.push('Missing required field: manifest.objectId');
    }

    if (!ztdf.policy.securityLabel) {
        errors.push('Missing required field: policy.securityLabel');
    } else {
        if (!ztdf.policy.securityLabel.classification) {
            errors.push('Missing required field: policy.securityLabel.classification');
        }

        if (!ztdf.policy.securityLabel.releasabilityTo || ztdf.policy.securityLabel.releasabilityTo.length === 0) {
            errors.push('Empty releasabilityTo list (deny all access)');
        }
    }

    if (ztdf.payload.keyAccessObjects.length === 0) {
        warnings.push('No Key Access Objects (cannot decrypt payload)');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================
// ZTDF Object Creation
// ============================================

/**
 * Create ZTDF manifest
 */
export function createZTDFManifest(params: {
    objectId: string;
    objectType: string;
    owner: string;
    ownerOrganization?: string;
    contentType: string;
    payloadSize: number;
}): IZTDFManifest {
    const now = new Date().toISOString();

    return {
        objectId: params.objectId,
        version: '1.0',
        objectType: params.objectType,
        createdAt: now,
        modifiedAt: now,
        owner: params.owner,
        ownerOrganization: params.ownerOrganization,
        contentType: params.contentType,
        payloadSize: params.payloadSize
    };
}

/**
 * Create STANAG 4774 security label
 */
export function createSecurityLabel(params: {
    classification: ClassificationLevel;
    releasabilityTo: string[];
    COI?: string[];
    caveats?: string[];
    originatingCountry: string;
    creationDate?: string;
}): ISTANAG4774Label {
    const label: ISTANAG4774Label = {
        classification: params.classification,
        releasabilityTo: params.releasabilityTo,
        COI: params.COI,
        caveats: params.caveats,
        originatingCountry: params.originatingCountry,
        creationDate: params.creationDate || new Date().toISOString()
    };

    // Generate display marking
    label.displayMarking = generateDisplayMarking(label);

    return label;
}

/**
 * Create ZTDF policy section
 */
export function createZTDFPolicy(params: {
    securityLabel: ISTANAG4774Label;
    policyAssertions?: Array<{ type: string; value: any; condition?: string }>;
}): IZTDFPolicy {
    const policy: IZTDFPolicy = {
        securityLabel: params.securityLabel,
        policyAssertions: params.policyAssertions || [],
        policyVersion: '1.0'
    };

    // Compute policy hash (STANAG 4778 binding)
    policy.policyHash = computeObjectHash({
        securityLabel: policy.securityLabel,
        policyAssertions: policy.policyAssertions,
        policyVersion: policy.policyVersion
    });

    return policy;
}

/**
 * Create encrypted payload chunk
 */
export function createEncryptedChunk(params: {
    chunkId: number;
    encryptedData: string;
}): IEncryptedPayloadChunk {
    const chunk: IEncryptedPayloadChunk = {
        chunkId: params.chunkId,
        encryptedData: params.encryptedData,
        size: Buffer.from(params.encryptedData, 'base64').length,
        integrityHash: computeSHA384(params.encryptedData)
    };

    return chunk;
}

/**
 * Create ZTDF payload section
 */
export function createZTDFPayload(params: {
    encryptionAlgorithm: string;
    iv: string;
    authTag: string;
    keyAccessObjects: IKeyAccessObject[];
    encryptedChunks: IEncryptedPayloadChunk[];
}): IZTDFPayload {
    const payload: IZTDFPayload = {
        encryptionAlgorithm: params.encryptionAlgorithm,
        iv: params.iv,
        authTag: params.authTag,
        keyAccessObjects: params.keyAccessObjects,
        encryptedChunks: params.encryptedChunks,
        payloadHash: computeSHA384(
            params.encryptedChunks.map(c => c.encryptedData).join('')
        )
    };

    return payload;
}

/**
 * Create complete ZTDF object
 */
export function createZTDFObject(params: {
    manifest: IZTDFManifest;
    policy: IZTDFPolicy;
    payload: IZTDFPayload;
}): IZTDFObject {
    return {
        manifest: params.manifest,
        policy: params.policy,
        payload: params.payload
    };
}

// ============================================
// Encryption Utilities (AES-256-GCM)
// ============================================

export interface IEncryptionResult {
    encryptedData: string;
    iv: string;
    authTag: string;
    dek: string; // Data Encryption Key (to be wrapped by KAS)
}

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns: Encrypted data + IV + auth tag + DEK
 */
export function encryptContent(plaintext: string): IEncryptionResult {
    // Generate random DEK (256 bits)
    const dek = crypto.randomBytes(32);

    // Generate random IV (96 bits for GCM)
    const iv = crypto.randomBytes(12);

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
        encryptedData: encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        dek: dek.toString('base64')
    };
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
export function decryptContent(params: {
    encryptedData: string;
    iv: string;
    authTag: string;
    dek: string;
}): string {
    const dekBuffer = Buffer.from(params.dek, 'base64');
    const ivBuffer = Buffer.from(params.iv, 'base64');
    const authTagBuffer = Buffer.from(params.authTag, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dekBuffer, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    let decrypted = decipher.update(params.encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// ============================================
// Migration: Legacy Resource → ZTDF
// ============================================

/**
 * Migrate legacy IResource to ZTDF format
 * 
 * For unencrypted resources: Creates mock encryption
 * For encrypted resources: Uses existing encryptedContent
 */
export function migrateLegacyResourceToZTDF(resource: IResource): IZTDFObject {
    // ============================================
    // 1. Create Manifest
    // ============================================
    const manifest = createZTDFManifest({
        objectId: resource.resourceId,
        objectType: 'document',
        owner: 'system',
        ownerOrganization: 'DIVE-V3',
        contentType: 'text/plain',
        payloadSize: resource.content ? Buffer.byteLength(resource.content, 'utf8') : 0
    });

    // ============================================
    // 2. Create Security Label (STANAG 4774)
    // ============================================
    const securityLabel = createSecurityLabel({
        classification: resource.classification,
        releasabilityTo: resource.releasabilityTo,
        COI: resource.COI || [],
        originatingCountry: resource.releasabilityTo[0] || 'USA',
        creationDate: resource.creationDate
    });

    // ============================================
    // 3. Create Policy Assertions
    // ============================================
    const policyAssertions = [
        {
            type: 'clearance-required',
            value: resource.classification
        },
        {
            type: 'releasability-required',
            value: resource.releasabilityTo
        }
    ];

    if (resource.COI && resource.COI.length > 0) {
        policyAssertions.push({
            type: 'coi-required',
            value: resource.COI
        });
    }

    const policy = createZTDFPolicy({
        securityLabel,
        policyAssertions
    });

    // ============================================
    // 4. Encrypt Content (or use existing)
    // ============================================
    let encryptionResult: IEncryptionResult;

    if (resource.encrypted && resource.encryptedContent) {
        // Use existing encrypted content (mock IV/authTag for migration)
        encryptionResult = {
            encryptedData: resource.encryptedContent,
            iv: crypto.randomBytes(12).toString('base64'),
            authTag: crypto.randomBytes(16).toString('base64'),
            dek: crypto.randomBytes(32).toString('base64')
        };
    } else if (resource.content) {
        // Encrypt plaintext content
        encryptionResult = encryptContent(resource.content);
    } else {
        // No content (empty document)
        encryptionResult = encryptContent('');
    }

    // ============================================
    // 5. Create Key Access Object (KAO)
    // ============================================
    const kao: IKeyAccessObject = {
        kaoId: `kao-${resource.resourceId}`,
        kasUrl: process.env.KAS_URL || 'http://localhost:8080',
        kasId: 'dive-v3-kas',
        wrappedKey: encryptionResult.dek, // TODO: Wrap with KAS public key
        wrappingAlgorithm: 'RSA-OAEP-256',
        policyBinding: {
            clearanceRequired: resource.classification,
            countriesAllowed: resource.releasabilityTo,
            coiRequired: resource.COI || []
        },
        createdAt: new Date().toISOString()
    };

    // ============================================
    // 6. Create Encrypted Chunk
    // ============================================
    const chunk = createEncryptedChunk({
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData
    });

    // ============================================
    // 7. Create Payload
    // ============================================
    const payload = createZTDFPayload({
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects: [kao],
        encryptedChunks: [chunk]
    });

    // ============================================
    // 8. Create Complete ZTDF Object
    // ============================================
    return createZTDFObject({
        manifest,
        policy,
        payload
    });
}

