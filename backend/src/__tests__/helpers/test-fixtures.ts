/**
 * Test Fixtures for Backend Testing
 * Provides sample ZTDF resources and test data
 */

import { IZTDFResource, ClassificationLevel } from '../../types/ztdf.types';
import {
    createZTDFManifest,
    createSecurityLabel,
    createZTDFPolicy,
    createEncryptedChunk,
    createZTDFPayload,
    createZTDFObject,
    encryptContent
} from '../../utils/ztdf.utils';

/**
 * Create a sample ZTDF resource for testing
 */
export function createTestZTDFResource(params: {
    resourceId: string;
    title: string;
    classification: ClassificationLevel;
    releasabilityTo: string[];
    COI?: string[];
    content?: string;
}): IZTDFResource {
    // Encrypt content
    const encryptionResult = encryptContent(params.content || 'Test content');

    // Create manifest
    const manifest = createZTDFManifest({
        objectId: params.resourceId,
        objectType: 'document',
        owner: 'testuser',
        ownerOrganization: 'DIVE-V3',
        contentType: 'text/plain',
        payloadSize: Buffer.byteLength(params.content || 'Test content', 'utf8')
    });

    // Create security label
    const securityLabel = createSecurityLabel({
        classification: params.classification,
        releasabilityTo: params.releasabilityTo,
        COI: params.COI || [],
        originatingCountry: params.releasabilityTo[0] || 'USA',
        creationDate: new Date().toISOString()
    });

    // Create policy
    const policy = createZTDFPolicy({
        securityLabel,
        policyAssertions: [
            {
                type: 'clearance-required',
                value: params.classification
            },
            {
                type: 'releasability-required',
                value: params.releasabilityTo
            }
        ]
    });

    // Create KAO
    const kao = {
        kaoId: `kao-${params.resourceId}`,
        kasUrl: 'http://localhost:8080',
        kasId: 'dive-v3-kas',
        wrappedKey: encryptionResult.dek,
        wrappingAlgorithm: 'RSA-OAEP-256',
        policyBinding: {
            clearanceRequired: params.classification,
            countriesAllowed: params.releasabilityTo,
            coiRequired: params.COI || []
        },
        createdAt: new Date().toISOString()
    };

    // Create encrypted chunk
    const chunk = createEncryptedChunk({
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData
    });

    // Create payload
    const payload = createZTDFPayload({
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects: [kao],
        encryptedChunks: [chunk]
    });

    // Create complete ZTDF object
    const ztdf = createZTDFObject({
        manifest,
        policy,
        payload
    });

    return {
        resourceId: params.resourceId,
        title: params.title,
        ztdf,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Sample ZTDF resources for testing
 */
export const TEST_RESOURCES = {
    /**
     * FVEY SECRET document releasable to USA, GBR, CAN
     */
    fveySecretDocument: createTestZTDFResource({
        resourceId: 'doc-fvey-001',
        title: 'FVEY Intelligence Report',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        COI: ['FVEY'],
        content: 'Classified FVEY intelligence data'
    }),

    /**
     * NATO CONFIDENTIAL document
     */
    natoConfidentialDocument: createTestZTDFResource({
        resourceId: 'doc-nato-001',
        title: 'NATO Operations Plan',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN'],
        COI: ['NATO-COSMIC'],
        content: 'NATO operational planning document'
    }),

    /**
     * US-only TOP_SECRET document
     */
    usOnlyTopSecretDocument: createTestZTDFResource({
        resourceId: 'doc-us-001',
        title: 'US National Security Directive',
        classification: 'TOP_SECRET',
        releasabilityTo: ['USA'],
        COI: ['US-ONLY'],
        content: 'Top secret US national security information'
    }),

    /**
     * UNCLASSIFIED public document
     */
    unclassifiedDocument: createTestZTDFResource({
        resourceId: 'doc-public-001',
        title: 'Public Announcement',
        classification: 'UNCLASSIFIED',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'AUS', 'NZL'],
        COI: [],
        content: 'Unclassified public information'
    }),

    /**
     * France-specific document
     */
    franceSecretDocument: createTestZTDFResource({
        resourceId: 'doc-fra-001',
        title: 'French Defense Document',
        classification: 'SECRET',
        releasabilityTo: ['FRA'],
        COI: [],
        content: 'French national defense information'
    })
};

/**
 * Create a tampered ZTDF resource (invalid integrity hash)
 * Uses same approach as ztdf.utils.test.ts - sets obviously wrong hash
 */
export function createTamperedZTDFResource(): IZTDFResource {
    const resource = createTestZTDFResource({
        resourceId: 'doc-tampered-001',
        title: 'Tampered Document',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        content: 'Original content'
    });

    // Set an obviously wrong policy hash (same approach as ztdf.utils.test.ts)
    // This will cause validation to fail with "Policy hash mismatch"
    resource.ztdf.policy.policyHash = 'TAMPERED_HASH_VALUE_THAT_WILL_NOT_MATCH_XXXXXXXXXXXXXX';
    
    return resource;
}

/**
 * Create a ZTDF resource with missing hashes
 */
export function createZTDFResourceWithoutHashes(): IZTDFResource {
    const resource = createTestZTDFResource({
        resourceId: 'doc-nohash-001',
        title: 'Document Without Hashes',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        content: 'Test content'
    });

    // Remove integrity hashes
    delete (resource.ztdf.policy as any).policyHash;
    delete (resource.ztdf.payload as any).payloadHash;
    resource.ztdf.payload.encryptedChunks.forEach(chunk => {
        delete (chunk as any).integrityHash;
    });

    return resource;
}

/**
 * Sample user profiles for testing
 */
export const TEST_USERS = {
    usSecret: {
        uniqueID: 'testuser-us',
        email: 'testuser@example.mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY']
    },
    usTopSecret: {
        uniqueID: 'testuser-us-ts',
        email: 'admin@pentagon.mil',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'US-ONLY']
    },
    frenchConfidential: {
        uniqueID: 'testuser-fra',
        email: 'testuser@gouv.fr',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO-COSMIC']
    },
    canadianSecret: {
        uniqueID: 'testuser-can',
        email: 'testuser@gc.ca',
        clearance: 'SECRET',
        countryOfAffiliation: 'CAN',
        acpCOI: ['FVEY']
    },
    contractor: {
        uniqueID: 'bob.contractor',
        email: 'bob@contractor.com',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'USA',
        acpCOI: []
    }
};

/**
 * Test request IDs
 */
export function generateTestRequestId(): string {
    return `test-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Test resource IDs
 */
export function generateTestResourceId(): string {
    return `doc-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

