/**
 * STANAG 4774/4778 Types
 *
 * Type definitions for NATO security marking standards:
 * - STANAG 4774: Confidentiality metadata labels
 * - STANAG 4778: Metadata binding mechanism (BDO)
 * - SPIF: Security Policy Information File
 */

/**
 * Classification level with marking data
 */
export interface IClassificationMarking {
    name: string;
    lacv: number;
    hierarchy: number;
    pageTopBottom: {
        en: string;
        fr: string;
    };
    portionMarking: string;
}

/**
 * Country/Organization marking data
 */
export interface ICountryMarking {
    code: string; // ISO 3166-1 alpha-3
    lacv: number;
    name: {
        en: string;
        fr: string;
    };
}

/**
 * Category tag marking qualifier
 */
export interface IMarkingQualifier {
    markingCode: string;
    prefix?: string;
    separator?: string;
    suffix?: string;
}

/**
 * Security category tag
 */
export interface ISecurityCategoryTag {
    name: string;
    tagType: 'restrictive' | 'permissive' | 'tagType7';
    categories: Map<string, ICountryMarking>;
    qualifier?: IMarkingQualifier;
}

/**
 * Security category tag set
 */
export interface ISecurityCategoryTagSet {
    name: string;
    id: string;
    tags: ISecurityCategoryTag[];
}

/**
 * Coalition/Partnership membership
 */
export interface IMembership {
    name: string;
    members: Array<{
        code: string;
        lacv: number;
        obsolete?: boolean;
    }>;
}

/**
 * SPIF (Security Policy Information File) parsed data
 */
export interface ISPIFData {
    policyName: string;
    policyId: string;
    version: string;
    creationDate: string;
    classifications: Map<string, IClassificationMarking>;
    categorySets: Map<string, ISecurityCategoryTagSet>;
    memberships: Map<string, IMembership>;
}

/**
 * SPIF marking rules (simplified for runtime use)
 */
export interface ISPIFMarkingRules {
    classifications: Map<string, {
        pageTopBottom: { en: string; fr: string };
        portionMarking: string;
        hierarchy: number;
    }>;
    countries: Map<string, { en: string; fr: string }>;
    releasableToQualifier: IMarkingQualifier;
    specialCategories: Map<string, { en: string; fr: string }>;
    memberships: Map<string, string[]>; // name -> country codes
}

/**
 * STANAG 4774 Confidentiality Label
 */
export interface IConfidentialityLabel {
    policyIdentifier: string;
    classification: string;
    categories?: Array<{
        tagSetId: string;
        tagName: string;
        values: string[];
    }>;
    creationDateTime?: string;
    originatorId?: string;
    originatorIdType?: 'uniformResourceIdentifier' | 'distinguishedName';
}

/**
 * STANAG 4778 Data Reference
 */
export interface IDataReference {
    uri: string;
    portion?: string;
    hashAlgorithm?: string;
    hashValue?: string;
}

/**
 * STANAG 4778 Binding Data Object (BDO)
 */
export interface IBindingDataObject {
    originatorConfidentialityLabel: IConfidentialityLabel;
    alternativeConfidentialityLabel?: IConfidentialityLabel;
    dataReferences: IDataReference[];
    creator?: string;
    description?: string;
    publisher?: string;
    dateCreated?: string;
    title?: string;
    identifier?: string;
    version?: string;
}

/**
 * STANAG marking result for display
 */
export interface ISTANAGMarking {
    displayMarking: string; // Full marking string for page top/bottom
    portionMarking: string; // Abbreviated marking for portions
    watermarkText: string;  // Text for watermark overlay
    classification: string; // Normalized classification level
    releasabilityPhrase: string; // "REL TO USA, GBR, CAN"
    caveats?: string[]; // NOFORN, etc.
    specialCategories?: string[]; // ATOMAL, CRYPTO, etc.
    language: 'en' | 'fr';
}

/**
 * Resource with STANAG metadata
 */
export interface ISTANAGResourceMetadata {
    bdo?: IBindingDataObject;
    portionMarkings?: Record<string, string>; // sectionId -> portion mark
    watermarkText: string;
    displayMarking: string;
    originalClassification?: string;
    originalCountry?: string;
    natoEquivalent?: string;
}

/**
 * Multimedia metadata for audio/video files
 * Used for STANAG 4774/4778 compliant multimedia resources
 */
export interface IMultimediaMetadata {
    /** Duration in seconds */
    duration?: number;
    /** Bitrate in kbps */
    bitrate?: number;
    /** Primary codec (e.g., 'h264', 'aac', 'mp3') */
    codec?: string;
    /** Video resolution (e.g., '1920x1080') */
    resolution?: string;
    /** Sample rate in Hz (audio) */
    sampleRate?: number;
    /** Number of audio channels (1=mono, 2=stereo) */
    channels?: number;
    /** Whether file contains audio stream */
    hasAudio?: boolean;
    /** Whether file contains video stream */
    hasVideo?: boolean;
    /** Container format (e.g., 'mp4', 'webm', 'mp3') */
    format?: string;
    /** Video width in pixels */
    width?: number;
    /** Video height in pixels */
    height?: number;
    /** Frame rate (video) */
    frameRate?: number;
    /** Aspect ratio (e.g., '16:9') */
    aspectRatio?: string;
    /** Video codec name */
    videoCodec?: string;
    /** Audio codec name */
    audioCodec?: string;
    /** XMP sidecar filename (for formats that don't support embedding) */
    xmpSidecarFilename?: string;
    /** Whether XMP is embedded or in sidecar */
    xmpEmbedded?: boolean;
}

/**
 * Classification hierarchy levels (lower = less sensitive)
 */
export const CLASSIFICATION_HIERARCHY: Record<string, number> = {
    'UNCLASSIFIED': 1,
    'RESTRICTED': 2,
    'CONFIDENTIAL': 3,
    'SECRET': 4,
    'TOP_SECRET': 5,
    'TOP SECRET': 5, // Alternative form
};

/**
 * Portion marking abbreviations per STANAG 4774
 */
export const PORTION_MARKING_MAP: Record<string, string> = {
    'UNCLASSIFIED': 'NU',
    'RESTRICTED': 'NR',
    'CONFIDENTIAL': 'NC',
    'SECRET': 'NS',
    'TOP_SECRET': 'CTS',
    'TOP SECRET': 'CTS',
};

/**
 * Classification colors for UI display
 */
export const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'UNCLASSIFIED': { bg: '#22c55e', text: '#ffffff', border: '#16a34a' },
    'RESTRICTED': { bg: '#3b82f6', text: '#ffffff', border: '#2563eb' },
    'CONFIDENTIAL': { bg: '#3b82f6', text: '#ffffff', border: '#2563eb' },
    'SECRET': { bg: '#ef4444', text: '#ffffff', border: '#dc2626' },
    'TOP_SECRET': { bg: '#f97316', text: '#ffffff', border: '#ea580c' },
    'TOP SECRET': { bg: '#f97316', text: '#ffffff', border: '#ea580c' },
};
