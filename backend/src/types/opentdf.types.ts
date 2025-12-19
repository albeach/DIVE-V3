/**
 * OpenTDF Specification Type Definitions (TDF 4.3.0)
 * 
 * Reference: OpenTDF Trusted Data Format Specification
 * https://github.com/opentdf/spec
 * 
 * This file defines the EXACT structure required by OpenTDF tools (CLI, SDK)
 * for interoperability and spec compliance.
 * 
 * CRITICAL: Do not modify these types unless the OpenTDF spec changes.
 * Any deviations will break compatibility with OpenTDF ecosystem.
 */

// ============================================
// Top-Level ZTDF Manifest (0.manifest.json)
// ============================================

/**
 * OpenTDF Manifest Structure (TDF 4.3.0)
 * This is the EXACT format written to 0.manifest.json in the ZIP archive
 */
export interface IOpenTDFManifest {
    /** TDF specification version - MUST be "4.3.0" for current spec */
    tdf_spec_version: '4.3.0';

    /** Payload reference (points to 0.payload in ZIP) */
    payload: IOpenTDFPayloadReference;

    /** Encryption information (algorithm, keys, integrity) */
    encryptionInformation: IOpenTDFEncryptionInformation;

    /** Policy assertions (security labels, handling instructions) */
    assertions: IOpenTDFAssertion[];
}

// ============================================
// Payload Reference Section
// ============================================

/**
 * Payload Reference
 * Describes the encrypted payload file location and format
 */
export interface IOpenTDFPayloadReference {
    /** Type of payload reference - MUST be "reference" for file-based */
    type: 'reference';

    /** URL/path to payload file - typically "0.payload" */
    url: string;

    /** Protocol for accessing payload - MUST be "zip" for ZTDF files */
    protocol: 'zip';

    /** Whether payload is encrypted - MUST be true for TDF */
    isEncrypted: boolean;

    /** MIME type of the ORIGINAL (unencrypted) content */
    mimeType: string;
}

// ============================================
// Encryption Information Section
// ============================================

/**
 * Encryption Information
 * Describes encryption method, key access, policy, and integrity
 */
export interface IOpenTDFEncryptionInformation {
    /** Type of key wrapping - MUST be "split" for KAS-based systems */
    type: 'split';

    /** Encryption method details */
    method: IOpenTDFEncryptionMethod;

    /** Key Access Objects (KAO) - how to retrieve decryption keys */
    keyAccess: IOpenTDFKeyAccessObject[];

    /** Policy (base64-encoded JSON) */
    policy: string;

    /** Integrity information (hashes, signatures) */
    integrityInformation: IOpenTDFIntegrityInformation;
}

/**
 * Encryption Method
 * Describes the symmetric encryption algorithm used
 */
export interface IOpenTDFEncryptionMethod {
    /** Encryption algorithm - typically "AES-256-GCM" */
    algorithm: string;

    /** Whether encryption supports streaming - typically true for GCM */
    isStreamable: boolean;

    /** Initialization Vector (base64) - may be empty if stored per-segment */
    iv: string;
}

/**
 * Key Access Object (KAO)
 * Describes how to retrieve the Data Encryption Key (DEK) from KAS
 */
export interface IOpenTDFKeyAccessObject {
    /** Type of key wrapping - MUST be "wrapped" */
    type: 'wrapped';

    /** Protocol for key retrieval - MUST be "kas" */
    protocol: 'kas';

    /** KAS endpoint URL */
    url: string;

    /** Key ID (identifies the KEK used to wrap DEK) */
    kid: string;

    /** Split ID (for split key scenarios) */
    sid: string;

    /** Wrapped DEK (base64-encoded, encrypted with KEK) */
    wrappedKey: string;

    /** Policy binding (ties policy to this KAO) */
    policyBinding: IOpenTDFPolicyBinding;

    /** TDF spec version for this KAO - typically "1.0" */
    tdf_spec_version: string;
}

/**
 * Policy Binding
 * Cryptographically binds policy to the wrapped key
 */
export interface IOpenTDFPolicyBinding {
    /** Hash algorithm used - typically "HS256" */
    alg: string;

    /** Hash value (base64) */
    hash: string;
}

/**
 * Integrity Information
 * Provides integrity validation for the encrypted payload
 */
export interface IOpenTDFIntegrityInformation {
    /** Root signature covering all segments */
    rootSignature: IOpenTDFRootSignature;

    /** Default segment size (bytes) - typically 2MB (2097152) */
    segmentSizeDefault: number;

    /** Default encrypted segment size (bytes) - slightly larger due to auth tag */
    encryptedSegmentSizeDefault: number;

    /** Hash algorithm for segments - typically "GMAC" */
    segmentHashAlg: string;

    /** Array of segment integrity info */
    segments: IOpenTDFSegmentInfo[];
}

/**
 * Root Signature
 * Signature covering the integrity of all segments
 */
export interface IOpenTDFRootSignature {
    /** Signature algorithm - typically "HS256" */
    alg: string;

    /** Signature value (base64) */
    sig: string;
}

/**
 * Segment Information
 * Integrity info for a single payload segment
 */
export interface IOpenTDFSegmentInfo {
    /** Hash of the segment (base64) */
    hash: string;

    /** Plaintext segment size (bytes) */
    segmentSize: number;

    /** Encrypted segment size (bytes) - includes auth tag */
    encryptedSegmentSize: number;
}

// ============================================
// Assertions Section
// ============================================

/**
 * OpenTDF Assertion
 * Policy assertion applied to the payload (e.g., handling instructions)
 */
export interface IOpenTDFAssertion {
    /** Unique assertion ID */
    id: string;

    /** Type of assertion - typically "handling" for security labels */
    type: 'handling' | 'custom';

    /** Scope of assertion - typically "payload" */
    scope: 'payload' | 'tdo';

    /** When assertion applies - "encrypted" or "unencrypted" */
    appliesToState: 'encrypted' | 'unencrypted';

    /** Assertion statement (the actual policy/label) */
    statement: IOpenTDFAssertionStatement;

    /** Cryptographic binding of statement */
    binding: IOpenTDFAssertionBinding;
}

/**
 * Assertion Statement
 * The actual policy/label content
 */
export interface IOpenTDFAssertionStatement {
    /** Format of the statement - typically "json-structured" */
    format: 'json-structured' | 'base64binary';

    /** Statement value (structured or encoded) */
    value: IOpenTDFAssertionValue | string;
}

/**
 * Assertion Value (JSON-structured)
 * Typically contains STANAG 4774 security labels for NATO/coalition
 */
export interface IOpenTDFAssertionValue {
    /** XML namespace (for STANAG 4774 compatibility) */
    Xmlns?: string;

    /** Creation time (ISO 8601) */
    CreationTime?: string;

    /** Confidentiality Information (STANAG 4774) */
    ConfidentialityInformation?: IOpenTDFConfidentialityInformation;

    /** Allow custom fields for extensibility */
    [key: string]: any;
}

/**
 * Confidentiality Information (STANAG 4774)
 * NATO security label structure
 */
export interface IOpenTDFConfidentialityInformation {
    /** Classification level */
    Classification: string;

    /** Policy identifier */
    PolicyIdentifier: string;

    /** Category information (COI, caveats, etc.) */
    Category: IOpenTDFCategory;
}

/**
 * Category (STANAG 4774)
 * COI and caveat information
 */
export interface IOpenTDFCategory {
    /** Category type */
    Type: string;

    /** Tag name */
    TagName: string;

    /** Generic values (e.g., country codes for releasability) */
    GenericValues: string[];
}

/**
 * Assertion Binding
 * Cryptographic signature of the assertion
 */
export interface IOpenTDFAssertionBinding {
    /** Binding method - typically "jws" (JSON Web Signature) */
    method: 'jws';

    /** Signature value (JWS compact serialization) */
    signature: string;
}

// ============================================
// Policy Structure (Base64-Encoded)
// ============================================

/**
 * OpenTDF Policy (decoded from base64 in manifest)
 * This structure is base64-encoded in encryptionInformation.policy
 */
export interface IOpenTDFPolicy {
    /** Policy UUID */
    uuid: string;

    /** Policy body */
    body: IOpenTDFPolicyBody;
}

/**
 * Policy Body
 * Defines data attributes and dissemination controls
 */
export interface IOpenTDFPolicyBody {
    /** Data attributes (ABAC attributes for access control) */
    dataAttributes?: IOpenTDFDataAttribute[] | null;

    /** Dissemination controls */
    dissem?: string[] | null;
}

/**
 * Data Attribute
 * ABAC attribute for policy-based access control
 */
export interface IOpenTDFDataAttribute {
    /** Attribute URI (e.g., "https://example.com/attr/classification/secret") */
    attribute: string;

    /** Display name */
    displayName?: string;

    /** Attribute value */
    value?: string;
}

// ============================================
// Export Result Types
// ============================================

/**
 * ZTDF Export Result
 * Returned after successful conversion to OpenTDF format
 */
export interface IZTDFExportResult {
    /** Success flag */
    success: boolean;

    /** ZIP file buffer (ready to send to client) */
    zipBuffer: Buffer;

    /** File size (bytes) */
    fileSize: number;

    /** SHA-256 hash of ZIP file (for integrity) */
    zipHash: string;

    /** Suggested filename */
    filename: string;

    /** Metadata about the export */
    metadata: {
        /** Original resource ID */
        resourceId: string;

        /** Export timestamp */
        exportedAt: string;

        /** Manifest size (bytes) */
        manifestSize: number;

        /** Payload size (bytes) */
        payloadSize: number;

        /** TDF spec version */
        tdfSpecVersion: string;
    };
}

/**
 * Export Options
 * Configuration for ZTDF export process
 */
export interface IZTDFExportOptions {
    /** Whether to include assertion signatures (default: true) */
    includeAssertionSignatures?: boolean;

    /** Whether to validate integrity before export (default: true) */
    validateIntegrity?: boolean;

    /** Compression level for ZIP (0 = STORE, 9 = max) - default: 0 (STORE) */
    compressionLevel?: number;

    /** Whether to include legacy fields in assertions (default: false) */
    includeLegacyFields?: boolean;
}
