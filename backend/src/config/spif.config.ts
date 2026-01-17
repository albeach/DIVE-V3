/**
 * SPIF Configuration
 *
 * Configuration for STANAG 4774/4778 Security Policy Information File parsing
 */

import path from 'path';

/**
 * Path to NATO Security Policy XML file
 * The SPIF defines classification levels, marking phrases, and category tag sets
 */
export const SPIF_PATH = path.resolve(process.cwd(), '../NATO_Security_Policy.xml');

/**
 * Alternative SPIF path (when running from project root)
 */
export const SPIF_PATH_ALT = path.resolve(process.cwd(), 'NATO_Security_Policy.xml');

/**
 * Default language for markings
 */
export const DEFAULT_MARKING_LANGUAGE: 'en' | 'fr' = 'en';

/**
 * Enable portion marking (paragraph-level classification prefixes)
 */
export const ENABLE_PORTION_MARKING = true;

/**
 * Watermark opacity (0.0 to 1.0)
 */
export const WATERMARK_OPACITY = 0.08;

/**
 * Watermark rotation angle in degrees
 */
export const WATERMARK_ROTATION = -45;

/**
 * Enable watermark overlay on documents
 */
export const ENABLE_WATERMARK = true;

/**
 * Enable classification banners (top/bottom)
 */
export const ENABLE_BANNERS = true;

/**
 * Enable floating classification badge
 */
export const ENABLE_BADGE = true;

/**
 * SPIF cache TTL in milliseconds (1 hour)
 * The SPIF is cached to avoid repeated file parsing
 */
export const SPIF_CACHE_TTL = 60 * 60 * 1000;

/**
 * Default releasability prefix
 */
export const RELEASABILITY_PREFIX = 'REL TO';

/**
 * Default separator between releasability countries
 */
export const RELEASABILITY_SEPARATOR = ', ';

/**
 * Marking separator (between classification and caveats)
 */
export const MARKING_SEPARATOR = ' // ';

/**
 * Supported MIME types for BDO extraction
 */
export const BDO_SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/**
 * XMP namespace URIs
 */
export const XMP_NAMESPACES = {
    S4774: 'urn:nato:stanag:4774:confidentialitymetadatalabel:1:0',
    S4778: 'urn:nato:stanag:4778:bindinginformation:1:0',
    S5636: 'urn:nato:stanag:5636:A:1:elements',
    S5636BP: 'urn:nato:stanag:5636:A:1:bindingprofile:bdo',
};

/**
 * NATO policy identifier OID
 */
export const NATO_POLICY_OID = '1.3.26.1.3.1';

/**
 * Fail-secure default classification
 * Used when SPIF parsing fails or classification cannot be determined
 */
export const FAIL_SECURE_CLASSIFICATION = 'TOP_SECRET';

/**
 * Marking display options
 */
export interface IMarkingDisplayOptions {
    showBanners: boolean;
    showBadge: boolean;
    showWatermark: boolean;
    showPortionMarks: boolean;
    language: 'en' | 'fr';
    watermarkOpacity: number;
}

/**
 * Default marking display options
 */
export const DEFAULT_MARKING_OPTIONS: IMarkingDisplayOptions = {
    showBanners: ENABLE_BANNERS,
    showBadge: ENABLE_BADGE,
    showWatermark: ENABLE_WATERMARK,
    showPortionMarks: ENABLE_PORTION_MARKING,
    language: DEFAULT_MARKING_LANGUAGE,
    watermarkOpacity: WATERMARK_OPACITY,
};
