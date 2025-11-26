/**
 * Zero Trust Data Format (ZTDF) Type Definitions
 * 
 * Implements NATO ACP-240 Data-Centric Security requirements
 * Reference: ACP240-llms.txt sections 5 (ZTDF & Cryptography) and 4 (Data Markings)
 * 
 * ZTDF Structure:
 * 1. Manifest: Object metadata and versioning
 * 2. Policy: Security labels and assertions (STANAG 4774/5636)
 * 3. Payload: Encrypted content with DEK/KAO wrapping
 */

// ============================================
// STANAG 4774 Security Labels
// ============================================

/**
 * Classification levels (aligned with STANAG 4774)
 * Also supports national equivalents via mapping
 */
export type ClassificationLevel =
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'CONFIDENTIAL'
    | 'SECRET'
    | 'TOP_SECRET';

/**
 * COI Operator defines how multiple COIs are evaluated
 * - ALL: Requester must have ALL listed COIs (intersection) - more restrictive
 * - ANY: Requester may have ANY listed COI (union) - broader
 */
export type COIOperator = 'ALL' | 'ANY';

/**
 * STANAG 4774 Security Label
 * Mandatory labeling for all objects per ACP-240 section 4.1
 * 
 * ACP-240 Section 4.3 Compliance:
 * "Carry original + standardized tags for recipients to enforce equivalents"
 */
export interface ISTANAG4774Label {
    /** Classification level (DIVE V3 canonical: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET) */
    classification: ClassificationLevel;

    /**
     * Original national classification (ACP-240 Section 4.3)
     * Example: "GEHEIM" (Germany), "SECRET DÉFENSE" (France)
     * Preserves classification provenance from originating nation
     */
    originalClassification?: string;

    /**
     * Country that issued the original classification (ACP-240 Section 4.3)
     * ISO 3166-1 alpha-3 code (e.g., "DEU", "FRA", "USA")
     */
    originalCountry?: string;

    /**
     * NATO standard equivalent classification (ACP-240 Section 4.3)
     * Example: "SECRET", "NATO_SECRET", "COSMIC_TOP_SECRET"
     * Enables NATO-wide interoperability
     */
    natoEquivalent?: string;

    /** Release countries (ISO 3166-1 alpha-3) */
    releasabilityTo: string[];

    /** Communities of Interest (NATO-COSMIC, FVEY, etc.) */
    COI?: string[];

    /** COI evaluation operator (default: ALL) */
    coiOperator?: COIOperator;

    /** Handling caveats (NOFORN, RELIDO, PROPIN, etc.) */
    caveats?: string[];

    /** Originating country (ISO 3166-1 alpha-3) */
    originatingCountry: string;

    /** Creation timestamp (ISO 8601) */
    creationDate: string;

    /**
     * Classification equivalence mapping (for coalition)
     * @deprecated Use originalClassification, originalCountry, natoEquivalent instead (ACP-240 Section 4.3)
     */
    equivalentClassifications?: Array<{
        country: string;
        classification: string;
    }>;

    /** Display marking (computed from above fields) */
    displayMarking?: string;

    /**
     * Industry Access Control (ACP-240 Section 4.2)
     * Optional: true = accessible to industry partners, false/undefined = government-only
     * Used in conjunction with subject.organizationType attribute
     */
    releasableToIndustry?: boolean;
}

// ============================================
// ZTDF Manifest Section
// ============================================

/**
 * ZTDF Manifest
 * Object metadata and versioning information
 */
export interface IZTDFManifest {
    /** Unique object identifier (RFC 4122 UUID) */
    objectId: string;

    /** ZTDF format version */
    version: string;

    /** Object type (document, message, file, etc.) */
    objectType: string;

    /** Creation timestamp (ISO 8601) */
    createdAt: string;

    /** Last modification timestamp (ISO 8601) */
    modifiedAt?: string;

    /** Owner/creator identity */
    owner: string;

    /** Owning organization */
    ownerOrganization?: string;

    /** MIME type of payload content */
    contentType: string;

    /** Payload size in bytes */
    payloadSize: number;
}

// ============================================
// ZTDF Policy Section
// ============================================

/**
 * Policy Assertion
 * Machine-readable policy statement
 */
export interface IPolicyAssertion {
    /** Assertion type (e.g., 'clearance-required', 'coi-required') */
    type: string;

    /** Assertion value */
    value: any;

    /** Optional condition expression */
    condition?: string;
}

/**
 * ZTDF Policy Section
 * Security metadata and policy assertions (STANAG 4774/5636)
 * Cryptographically bound to payload (STANAG 4778)
 */
export interface IZTDFPolicy {
    /** STANAG 4774 security label */
    securityLabel: ISTANAG4774Label;

    /** Machine-readable policy assertions */
    policyAssertions: IPolicyAssertion[];

    /** Policy version identifier */
    policyVersion: string;

    /** Policy schema URI */
    policySchema?: string;

    /** Integrity hash of this policy section (SHA-384) */
    policyHash?: string;

    /** Digital signature over policy (X.509 PKI) */
    policySignature?: {
        algorithm: string;
        value: string;
        signerId: string;
        timestamp: string;
    };
}

// ============================================
// Key Access Object (KAO) for DEK Wrapping
// ============================================

/**
 * Key Access Object
 * Wraps DEK for specific recipient/policy/KAS
 * Hybrid encryption: DEK encrypted by KAS public key
 */
export interface IKeyAccessObject {
    /** KAO identifier */
    kaoId: string;

    /** KAS endpoint that can unwrap this KAO */
    kasUrl: string;

    /** KAS identifier */
    kasId: string;

    /** Wrapped DEK (encrypted with KAS public key) */
    wrappedKey: string;

    /** Key wrapping algorithm (e.g., RSA-OAEP-256) */
    wrappingAlgorithm: string;

    /** Policy/recipient selector (who can request unwrap) */
    policyBinding: {
        /** Required clearance level */
        clearanceRequired?: ClassificationLevel;

        /** Required countries (ISO 3166-1 alpha-3) */
        countriesAllowed?: string[];

        /** Required COI membership */
        coiRequired?: string[];

        /** Additional ABAC policy reference */
        policyRef?: string;
    };

    /** KAO creation timestamp */
    createdAt: string;
}

// ============================================
// ZTDF Payload Section
// ============================================

/**
 * Encrypted Payload Chunk
 * Supports multi-part payloads
 */
export interface IEncryptedPayloadChunk {
    /** Chunk sequence number */
    chunkId: number;

    /** Encrypted data (Base64-encoded) */
    encryptedData: string;

    /** Chunk size in bytes */
    size: number;

    /** Integrity hash of this chunk (SHA-384) */
    integrityHash: string;
}

/**
 * ZTDF Payload Section
 * Contains encrypted content and KAOs
 */
export interface IZTDFPayload {
    /** Content encryption algorithm (e.g., AES-256-GCM) */
    encryptionAlgorithm: string;

    /** Initialization vector (Base64-encoded) */
    iv: string;

    /** Authentication tag for AEAD (Base64-encoded) */
    authTag: string;

    /** Key Access Objects (one or more KASs) */
    keyAccessObjects: IKeyAccessObject[];

    /** Encrypted payload chunks */
    encryptedChunks: IEncryptedPayloadChunk[];

    /** Overall payload integrity hash (SHA-384) */
    payloadHash: string;
}

// ============================================
// Complete ZTDF Object
// ============================================

/**
 * Zero Trust Data Format (ZTDF) Object
 * Self-contained encrypted object with embedded policy
 * 
 * CRITICAL: Integrity validation required before decryption
 * - Verify policyHash against policy section
 * - Verify payloadHash against payload chunks
 * - Verify policySignature if present
 * - Fail-closed: Deny access if any integrity check fails
 */
export interface IZTDFObject {
    /** Manifest section (object metadata) */
    manifest: IZTDFManifest;

    /** Policy section (security labels + assertions) */
    policy: IZTDFPolicy;

    /** Payload section (encrypted content + KAOs) */
    payload: IZTDFPayload;

    /** ZTDF format signature (optional, for non-repudiation) */
    ztdfSignature?: {
        algorithm: string;
        value: string;
        signerId: string;
        timestamp: string;
    };
}

// ============================================
// ZTDF Resource (MongoDB Schema Extension)
// ============================================

/**
 * ZTDF-Enhanced Resource
 * Extends IResource with ZTDF structure
 * Backward compatible: retains original fields for migration
 */
export interface IZTDFResource {
    /** Original resource ID (for backward compatibility) */
    resourceId: string;

    /** Human-readable title */
    title: string;

    /** ZTDF object (complete ZTDF structure) */
    ztdf: IZTDFObject;

    /** Legacy fields (retained for migration/compatibility) */
    legacy?: {
        classification: ClassificationLevel;
        releasabilityTo: string[];
        COI: string[];
        coiOperator?: COIOperator;
        creationDate?: string;
        encrypted: boolean;
        content?: string;
        encryptedContent?: string;
        /** Industry Access Control (ACP-240 Section 4.2) */
        releasableToIndustry?: boolean;
    };

    /** MongoDB timestamps */
    createdAt?: Date;
    updatedAt?: Date;
}

// ============================================
// STANAG 4774 Display Marking Generation
// ============================================

/**
 * Generate STANAG 4774 display marking
 * Format: CLASSIFICATION//CAVEATS//COI//RELTO
 * Example: SECRET//NOFORN//NATO-COSMIC//REL USA, GBR, FRA
 */
export function generateDisplayMarking(label: ISTANAG4774Label): string {
    const parts: string[] = [];

    // Classification (required)
    parts.push(label.classification);

    // Caveats (optional)
    if (label.caveats && label.caveats.length > 0) {
        parts.push(label.caveats.join('-'));
    }

    // COI (optional)
    if (label.COI && label.COI.length > 0) {
        parts.push(label.COI.join('-'));
    }

    // Releasability (required)
    if (label.releasabilityTo.length > 0) {
        parts.push(`REL ${label.releasabilityTo.join(', ')}`);
    }

    return parts.join('//');
}

// ============================================
// Classification Equivalency Mapping
// ============================================

/**
 * Classification equivalence table (ACP-240 section 4.3)
 * Maps national classifications to NATO/common levels
 */
export const CLASSIFICATION_EQUIVALENCE: Record<string, Record<string, string>> = {
    'USA': {
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP SECRET': 'TOP_SECRET'
    },
    'GBR': {
        'OFFICIAL': 'UNCLASSIFIED',
        'SECRET': 'SECRET',
        'TOP SECRET': 'TOP_SECRET'
    },
    'FRA': {
        'NON PROTÉGÉ': 'UNCLASSIFIED',
        'CONFIDENTIEL DÉFENSE': 'CONFIDENTIAL',
        'SECRET DÉFENSE': 'SECRET',
        'TRÈS SECRET DÉFENSE': 'TOP_SECRET'
    },
    'CAN': {
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP SECRET': 'TOP_SECRET'
    },
    'DEU': {
        'OFFEN': 'UNCLASSIFIED',
        'VS-VERTRAULICH': 'CONFIDENTIAL',
        'GEHEIM': 'SECRET',
        'STRENG GEHEIM': 'TOP_SECRET'
    },
    'NATO': {
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'NATO CONFIDENTIAL': 'CONFIDENTIAL',
        'NATO SECRET': 'SECRET',
        'COSMIC TOP SECRET': 'TOP_SECRET'
    }
};

/**
 * Map national classification to common level
 */
export function mapClassification(country: string, nationalLevel: string): ClassificationLevel {
    const mapping = CLASSIFICATION_EQUIVALENCE[country];
    if (!mapping) {
        throw new Error(`No classification mapping for country: ${country}`);
    }

    const commonLevel = mapping[nationalLevel];
    if (!commonLevel) {
        throw new Error(`No classification mapping for ${country}:${nationalLevel}`);
    }

    return commonLevel as ClassificationLevel;
}

