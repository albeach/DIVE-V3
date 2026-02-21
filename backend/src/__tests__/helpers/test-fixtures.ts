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
    releasableToIndustry?: boolean; // Industry access control (ACP-240 Section 4.2)
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
        creationDate: new Date().toISOString(),
        releasableToIndustry: params.releasableToIndustry // Industry access control (ACP-240 Section 4.2)
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
        legacy: {
            classification: params.classification,
            releasabilityTo: params.releasabilityTo,
            COI: params.COI || [],
            encrypted: true,
            releasableToIndustry: params.releasableToIndustry // Industry access control
        },
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
    }),

    // ============================================
    // Industry Access Control Test Resources
    // ============================================

    /**
     * Government-only SECRET document (default: releasableToIndustry not set)
     * Industry users should be DENIED access
     */
    govOnlySecretDocument: createTestZTDFResource({
        resourceId: 'doc-gov-only-001',
        title: 'Government-Only Operations Plan',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'DEU', 'FRA'],
        COI: ['NATO'],
        content: 'Sensitive government operations information - not for industry',
        releasableToIndustry: false // Explicitly gov-only
    }),

    /**
     * Industry-accessible CONFIDENTIAL document
     * Industry users with proper clearance SHOULD have access
     */
    industryAllowedConfidentialDocument: createTestZTDFResource({
        resourceId: 'doc-industry-001',
        title: 'Coalition Industry Partnership Brief',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['USA', 'DEU', 'GBR'],
        COI: [],
        content: 'Information approved for cleared industry partners',
        releasableToIndustry: true // Explicitly industry-accessible
    }),

    /**
     * Industry-accessible UNCLASSIFIED document
     * Wide distribution including industry partners
     */
    industryAllowedUnclassifiedDocument: createTestZTDFResource({
        resourceId: 'doc-industry-002',
        title: 'Coalition Logistics RFI',
        classification: 'UNCLASSIFIED',
        releasabilityTo: ['USA', 'DEU', 'FRA', 'GBR', 'CAN'],
        COI: [],
        content: 'Request for Information - open to industry bidders',
        releasableToIndustry: true // Explicitly industry-accessible
    }),

    /**
     * Government-only UNCLASSIFIED document
     * Even unclassified can be restricted from industry
     */
    govOnlyUnclassifiedDocument: createTestZTDFResource({
        resourceId: 'doc-gov-unclass-001',
        title: 'Internal Policy Discussion',
        classification: 'UNCLASSIFIED',
        releasabilityTo: ['USA', 'DEU'],
        COI: [],
        content: 'Internal government policy discussion - not for public or industry',
        releasableToIndustry: false // Gov-only even though unclassified
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
 *
 * User Pattern: testuser-{country}-{1,2,3,4}
 *   1 = UNCLASSIFIED
 *   2 = CONFIDENTIAL
 *   3 = SECRET
 *   4 = TOP_SECRET
 *
 * Password: TestUser2025!Pilot
 */
export const TEST_USERS = {
    // USA Test Users
    usaLevel1: {
        uniqueID: 'testuser-usa-1',
        email: 'testuser-usa-1@dive-demo.example',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'USA',
        acpCOI: []
    },
    usaLevel2: {
        uniqueID: 'testuser-usa-2',
        email: 'testuser-usa-2@dive-demo.example',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: []
    },
    usaLevel3: {
        uniqueID: 'testuser-usa-3',
        email: 'testuser-usa-3@dive-demo.example',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['NATO']
    },
    usaLevel4: {
        uniqueID: 'testuser-usa-4',
        email: 'testuser-usa-4@dive-demo.example',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'NATO-COSMIC']
    },
    // France Test Users
    fraLevel1: {
        uniqueID: 'testuser-fra-1',
        email: 'testuser-fra-1@dive-demo.example',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'FRA',
        acpCOI: []
    },
    fraLevel2: {
        uniqueID: 'testuser-fra-2',
        email: 'testuser-fra-2@dive-demo.example',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'FRA',
        acpCOI: []
    },
    fraLevel3: {
        uniqueID: 'testuser-fra-3',
        email: 'testuser-fra-3@dive-demo.example',
        clearance: 'SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO']
    },
    fraLevel4: {
        uniqueID: 'testuser-fra-4',
        email: 'testuser-fra-4@dive-demo.example',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: ['FVEY', 'NATO-COSMIC']
    },
    // Industry Partner Test User
    contractor: {
        uniqueID: 'contractor.bah',
        email: 'contractor.bah@bah.com',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['NATO'],
        organizationType: 'INDUSTRY' // Industry partner
    },

    // ============================================
    // Industry Partner Test Users
    // ============================================

    /**
     * German industry partner with SECRET clearance
     */
    germanIndustrySecret: {
        uniqueID: 'testuser-deu-industry-1',
        email: 'engineer@abc-llc.de',
        clearance: 'SECRET',
        countryOfAffiliation: 'DEU',
        acpCOI: ['NATO'],
        organizationType: 'INDUSTRY' // Industry partner
    },

    /**
     * US industry partner with CONFIDENTIAL clearance
     */
    usIndustryConfidential: {
        uniqueID: 'testuser-usa-industry-1',
        email: 'analyst@defense-corp.com',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: [],
        organizationType: 'INDUSTRY' // Industry partner
    },

    /**
     * US government user (explicit GOV type)
     */
    usGovernmentSecret: {
        uniqueID: 'testuser-usa-gov-1',
        email: 'analyst@state.gov',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        organizationType: 'GOV' // Government personnel
    },

    /**
     * US military user (explicit MIL type)
     */
    usMilitaryTopSecret: {
        uniqueID: 'testuser-usa-mil-1',
        email: 'officer@army.mil',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'US-ONLY'],
        organizationType: 'MIL' // Military personnel
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
