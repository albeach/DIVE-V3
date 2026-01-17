/**
 * SPIF Parser Service
 *
 * Parses NATO Security Policy Information File (SPIF) per STANAG 4774
 * Extracts classification levels, marking phrases, and category tag sets
 *
 * Reference: NATO_Security_Policy.xml
 */

import * as fs from 'fs';
import * as xml2js from 'xml2js';
import { logger } from '../utils/logger';
import {
    ISPIFData,
    ISPIFMarkingRules,
    IClassificationMarking,
    ICountryMarking,
    ISecurityCategoryTagSet,
    ISecurityCategoryTag,
    IMembership,
    IMarkingQualifier,
    ISTANAGMarking,
    PORTION_MARKING_MAP,
    CLASSIFICATION_HIERARCHY,
} from '../types/stanag.types';
import {
    SPIF_PATH,
    SPIF_PATH_ALT,
    DEFAULT_MARKING_LANGUAGE,
    SPIF_CACHE_TTL,
    RELEASABILITY_PREFIX,
    RELEASABILITY_SEPARATOR,
    MARKING_SEPARATOR,
    FAIL_SECURE_CLASSIFICATION,
} from '../config/spif.config';

// Cached SPIF data
let cachedSPIF: ISPIFData | null = null;
let cachedMarkingRules: ISPIFMarkingRules | null = null;
let cacheTimestamp: number = 0;

/**
 * Get the path to the SPIF file
 */
function getSPIFPath(): string {
    // Try primary path first
    if (fs.existsSync(SPIF_PATH)) {
        return SPIF_PATH;
    }
    // Try alternative path
    if (fs.existsSync(SPIF_PATH_ALT)) {
        return SPIF_PATH_ALT;
    }
    // Try relative to backend directory
    const backendPath = require('path').resolve(__dirname, '../../NATO_Security_Policy.xml');
    if (fs.existsSync(backendPath)) {
        return backendPath;
    }
    // Try project root
    const rootPath = require('path').resolve(__dirname, '../../../NATO_Security_Policy.xml');
    if (fs.existsSync(rootPath)) {
        return rootPath;
    }
    throw new Error(`SPIF file not found. Tried: ${SPIF_PATH}, ${SPIF_PATH_ALT}`);
}

/**
 * Extract marking data from XML element
 */
function extractMarkingData(markingDataList: any[]): { en: string; fr: string; portionMarking?: string } {
    const result: { en: string; fr: string; portionMarking?: string } = { en: '', fr: '' };

    if (!markingDataList) return result;

    for (const markingData of markingDataList) {
        const phrase = markingData.$.phrase || markingData._ || '';
        const lang = markingData.$?.['xml:lang'] || 'en';
        const codes = markingData.code || [];

        // Check if this is a portion marking
        if (codes.includes('portionMarking')) {
            result.portionMarking = phrase;
        } else if (codes.includes('pageTopBottom') || codes.includes('pageTop') || codes.includes('pageBottom')) {
            if (lang === 'en') {
                result.en = phrase;
            } else if (lang === 'fr') {
                result.fr = phrase;
            }
        }
    }

    return result;
}

/**
 * Parse security classifications from SPIF XML
 */
function parseClassifications(classificationsXml: any): Map<string, IClassificationMarking> {
    const classifications = new Map<string, IClassificationMarking>();

    if (!classificationsXml?.securityClassification) {
        return classifications;
    }

    for (const classXml of classificationsXml.securityClassification) {
        const name = classXml.$.name;
        const lacv = parseInt(classXml.$.lacv, 10);
        const hierarchy = parseInt(classXml.$.hierarchy, 10);

        const markingData = extractMarkingData(classXml.markingData || []);

        classifications.set(name, {
            name,
            lacv,
            hierarchy,
            pageTopBottom: {
                en: markingData.en || name,
                fr: markingData.fr || name,
            },
            portionMarking: markingData.portionMarking || PORTION_MARKING_MAP[name] || name.substring(0, 2).toUpperCase(),
        });
    }

    return classifications;
}

/**
 * Parse marking qualifier from XML
 */
function parseMarkingQualifier(qualifierXml: any): IMarkingQualifier | undefined {
    if (!qualifierXml) return undefined;

    const qualifier: IMarkingQualifier = {
        markingCode: qualifierXml.$.markingCode || 'pageTop',
    };

    const qualifiers = qualifierXml.qualifier || [];
    for (const q of qualifiers) {
        const code = q.$.qualifierCode;
        const value = q.$.markingQualifier;

        if (code === 'prefix') qualifier.prefix = value;
        else if (code === 'separator') qualifier.separator = value;
        else if (code === 'suffix') qualifier.suffix = value;
    }

    return qualifier;
}

/**
 * Parse security category tag set from SPIF XML
 */
function parseCategoryTagSet(tagSetXml: any): ISecurityCategoryTagSet {
    const tagSet: ISecurityCategoryTagSet = {
        name: tagSetXml.$.name,
        id: tagSetXml.$.id,
        tags: [],
    };

    const categoryTags = tagSetXml.securityCategoryTag || [];
    for (const tagXml of categoryTags) {
        const tag: ISecurityCategoryTag = {
            name: tagXml.$.name,
            tagType: tagXml.$.tagType as any,
            categories: new Map(),
            qualifier: parseMarkingQualifier(tagXml.markingQualifier?.[0]),
        };

        const categories = tagXml.tagCategory || [];
        for (const catXml of categories) {
            const code = catXml.$.name;
            const lacv = parseInt(catXml.$.lacv, 10);
            const markingData = extractMarkingData(catXml.markingData || []);

            tag.categories.set(code, {
                code,
                lacv,
                name: {
                    en: markingData.en || code,
                    fr: markingData.fr || code,
                },
            });
        }

        tagSet.tags.push(tag);
    }

    return tagSet;
}

/**
 * Parse memberships from SPIF extensions
 */
function parseMemberships(extensionsXml: any): Map<string, IMembership> {
    const memberships = new Map<string, IMembership>();

    if (!extensionsXml) return memberships;

    // Navigate to memberships in extensions
    const nspifMemberships = extensionsXml['nspif:memberships']?.[0];
    if (!nspifMemberships) return memberships;

    const membershipList = nspifMemberships['nspif:membership'] || [];
    for (const membershipXml of membershipList) {
        const name = membershipXml.$?.['nspif:name'] || membershipXml.$.name;
        const members: IMembership['members'] = [];

        const memberList = membershipXml['nspif:member'] || [];
        for (const memberXml of memberList) {
            members.push({
                code: memberXml.$?.['nspif:name'] || memberXml.$.name,
                lacv: parseInt(memberXml.$?.['nspif:lacv'] || memberXml.$.lacv, 10),
                obsolete: memberXml.$?.['nspif:obsolete'] === 'true',
            });
        }

        memberships.set(name, { name, members });
    }

    return memberships;
}

/**
 * Parse the full SPIF XML file
 */
export async function parseSPIF(): Promise<ISPIFData> {
    // Check cache
    if (cachedSPIF && Date.now() - cacheTimestamp < SPIF_CACHE_TTL) {
        return cachedSPIF;
    }

    const spifPath = getSPIFPath();
    logger.info('Parsing SPIF file', { path: spifPath });

    const xmlContent = fs.readFileSync(spifPath, 'utf-8');

    const parser = new xml2js.Parser({
        explicitArray: true,
        mergeAttrs: false,
        xmlns: true,
        tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    const result = await parser.parseStringPromise(xmlContent);
    const spifRoot = result.SPIF;

    // Extract policy info
    const defaultPolicy = spifRoot.defaultSecurityPolicyId?.[0]?.$ || {};
    const securityPolicy = spifRoot.securityPolicyId?.[0]?.$ || defaultPolicy;

    const spifData: ISPIFData = {
        policyName: securityPolicy.name || 'NATO',
        policyId: securityPolicy.id || '1.3.26.1.3.1',
        version: spifRoot.$.version || '1',
        creationDate: spifRoot.$.creationDate || '',
        classifications: parseClassifications(spifRoot.securityClassifications?.[0]),
        categorySets: new Map(),
        memberships: new Map(),
    };

    // Parse category tag sets
    const tagSetsXml = spifRoot.securityCategoryTagSets?.[0]?.securityCategoryTagSet || [];
    for (const tagSetXml of tagSetsXml) {
        const tagSet = parseCategoryTagSet(tagSetXml);
        spifData.categorySets.set(tagSet.name, tagSet);
    }

    // Parse memberships from extensions
    spifData.memberships = parseMemberships(spifRoot.extensions?.[0]);

    // Update cache
    cachedSPIF = spifData;
    cacheTimestamp = Date.now();

    logger.info('SPIF parsed successfully', {
        policyName: spifData.policyName,
        classifications: spifData.classifications.size,
        categorySets: spifData.categorySets.size,
        memberships: spifData.memberships.size,
    });

    return spifData;
}

/**
 * Get simplified marking rules from SPIF
 */
export async function getSPIFMarkingRules(): Promise<ISPIFMarkingRules> {
    // Check cache
    if (cachedMarkingRules && Date.now() - cacheTimestamp < SPIF_CACHE_TTL) {
        return cachedMarkingRules;
    }

    const spifData = await parseSPIF();

    const rules: ISPIFMarkingRules = {
        classifications: new Map(),
        countries: new Map(),
        releasableToQualifier: {
            markingCode: 'pageTop',
            prefix: RELEASABILITY_PREFIX,
            separator: RELEASABILITY_SEPARATOR,
        },
        specialCategories: new Map(),
        memberships: new Map(),
    };

    // Copy classifications
    for (const [key, value] of spifData.classifications) {
        rules.classifications.set(key, {
            pageTopBottom: value.pageTopBottom,
            portionMarking: value.portionMarking,
            hierarchy: value.hierarchy,
        });
    }

    // Extract countries from "Releasable To" and "Only" tag sets
    const releasableToSet = spifData.categorySets.get('Releasable To');
    const onlySet = spifData.categorySets.get('Only');

    if (releasableToSet) {
        for (const tag of releasableToSet.tags) {
            if (tag.qualifier) {
                rules.releasableToQualifier = tag.qualifier;
            }
            for (const [code, country] of tag.categories) {
                rules.countries.set(code, country.name);
            }
        }
    }

    if (onlySet) {
        for (const tag of onlySet.tags) {
            for (const [code, country] of tag.categories) {
                if (!rules.countries.has(code)) {
                    rules.countries.set(code, country.name);
                }
            }
        }
    }

    // Extract special categories (ATOMAL, CRYPTO, etc.)
    const specialCatSet = spifData.categorySets.get('Special Category Designators');
    if (specialCatSet) {
        for (const tag of specialCatSet.tags) {
            for (const [code, cat] of tag.categories) {
                rules.specialCategories.set(code, cat.name);
            }
        }
    }

    // Copy memberships
    for (const [name, membership] of spifData.memberships) {
        rules.memberships.set(name, membership.members.map(m => m.code));
    }

    cachedMarkingRules = rules;

    return rules;
}

/**
 * Generate marking text from resource attributes
 */
export async function generateMarking(
    classification: string,
    releasabilityTo: string[],
    options: {
        COI?: string[];
        caveats?: string[];
        language?: 'en' | 'fr';
    } = {}
): Promise<ISTANAGMarking> {
    const language = options.language || DEFAULT_MARKING_LANGUAGE;
    const rules = await getSPIFMarkingRules();

    // Normalize classification name
    const normalizedClassification = classification.toUpperCase().replace(/_/g, ' ');
    const classificationData = rules.classifications.get(normalizedClassification) ||
        rules.classifications.get(classification) ||
        rules.classifications.get('SECRET'); // Default to SECRET for fail-secure

    if (!classificationData) {
        logger.warn('Classification not found in SPIF, using fail-secure default', {
            classification,
            fallback: FAIL_SECURE_CLASSIFICATION,
        });
    }

    // Get classification phrase
    const classificationPhrase = classificationData?.pageTopBottom[language] || normalizedClassification;
    const portionMarking = classificationData?.portionMarking ||
        PORTION_MARKING_MAP[normalizedClassification] ||
        normalizedClassification.substring(0, 2);

    // Build releasability phrase
    let releasabilityPhrase = '';
    if (releasabilityTo && releasabilityTo.length > 0) {
        const countryNames = releasabilityTo.map(code => {
            const country = rules.countries.get(code);
            return country ? country[language] : code;
        });

        const qualifier = rules.releasableToQualifier;
        releasabilityPhrase = `${qualifier.prefix || RELEASABILITY_PREFIX} ${countryNames.join(qualifier.separator || RELEASABILITY_SEPARATOR)}`;
    }

    // Build special categories phrase
    let specialCategoriesPhrase = '';
    if (options.caveats && options.caveats.length > 0) {
        specialCategoriesPhrase = options.caveats.join('/');
    }

    // Construct full display marking
    const markingParts: string[] = [classificationPhrase];
    if (specialCategoriesPhrase) {
        markingParts.push(specialCategoriesPhrase);
    }
    if (releasabilityPhrase) {
        markingParts.push(releasabilityPhrase);
    }

    const displayMarking = markingParts.join(MARKING_SEPARATOR);

    // Watermark text is typically just the classification
    const watermarkText = classificationPhrase;

    return {
        displayMarking,
        portionMarking: `(${portionMarking})`,
        watermarkText,
        classification: normalizedClassification,
        releasabilityPhrase,
        caveats: options.caveats,
        specialCategories: options.caveats?.filter(c => rules.specialCategories.has(c)),
        language,
    };
}

/**
 * Get country name from ISO code
 */
export async function getCountryName(code: string, language: 'en' | 'fr' = 'en'): Promise<string> {
    const rules = await getSPIFMarkingRules();
    const country = rules.countries.get(code);
    return country ? country[language] : code;
}

/**
 * Get classification hierarchy level
 */
export function getClassificationLevel(classification: string): number {
    const normalized = classification.toUpperCase().replace(/_/g, ' ');
    return CLASSIFICATION_HIERARCHY[normalized] || CLASSIFICATION_HIERARCHY[classification] || 0;
}

/**
 * Compare two classification levels
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareClassifications(a: string, b: string): number {
    return getClassificationLevel(a) - getClassificationLevel(b);
}

/**
 * Check if a classification meets the minimum required level
 */
export function meetsClassificationRequirement(userClearance: string, resourceClassification: string): boolean {
    return getClassificationLevel(userClearance) >= getClassificationLevel(resourceClassification);
}

/**
 * Clear cached SPIF data (useful for testing)
 */
export function clearSPIFCache(): void {
    cachedSPIF = null;
    cachedMarkingRules = null;
    cacheTimestamp = 0;
}

/**
 * Get raw SPIF data (for debugging/admin)
 */
export async function getRawSPIFData(): Promise<ISPIFData> {
    return parseSPIF();
}

/**
 * Validate classification against SPIF
 */
export async function isValidClassification(classification: string): Promise<boolean> {
    const rules = await getSPIFMarkingRules();
    const normalized = classification.toUpperCase().replace(/_/g, ' ');
    return rules.classifications.has(normalized) || rules.classifications.has(classification);
}

/**
 * Get all valid country codes from SPIF
 */
export async function getValidCountryCodes(): Promise<string[]> {
    const rules = await getSPIFMarkingRules();
    return Array.from(rules.countries.keys());
}

/**
 * Expand membership to country codes
 * e.g., "NATO" -> ["ALB", "BEL", "BGR", ...]
 */
export async function expandMembership(membershipName: string): Promise<string[]> {
    const rules = await getSPIFMarkingRules();
    return rules.memberships.get(membershipName) || [];
}
