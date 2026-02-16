/**
 * BDO Parser Service
 *
 * Parses STANAG 4778 Binding Data Objects (BDO) from various file formats:
 * - OOXML (DOCX/XLSX/PPTX): Extract CustomXML from ZIP package
 * - PDF: Parse XMP metadata packets
 * - Sidecar files: Read .bdo or .xmp files
 * - OPC packages: Extract BindingInformation from customXml parts
 *
 * Reference: STANAG 4778 / ADatP-4778.2
 */

import JSZip from 'jszip';
import * as xml2js from 'xml2js';
import { logger } from '../utils/logger';
import {
    IBindingDataObject,
    IConfidentialityLabel,
    IDataReference,
} from '../types/stanag.types';
import { XMP_NAMESPACES, NATO_POLICY_OID } from '../config/spif.config';

type XmlNode = Record<string, unknown> & { $?: Record<string, string>; _?: string };

/**
 * Extract BDO from a file buffer based on MIME type
 */
export async function extractBDO(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string
): Promise<IBindingDataObject | null> {
    try {
        switch (mimeType) {
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                return await extractBDOFromOOXML(fileBuffer, filename);

            case 'application/pdf':
                return await extractBDOFromPDF(fileBuffer, filename);

            default:
                logger.debug('No BDO extraction available for MIME type', { mimeType, filename });
                return null;
        }
    } catch (error) {
        logger.warn('Failed to extract BDO from file', {
            filename,
            mimeType,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    }
}

/**
 * Extract BDO from OOXML package (DOCX/XLSX/PPTX)
 *
 * OOXML files are ZIP archives. STANAG 4778 bindings are stored in:
 * - customXml/item*.xml (custom XML parts)
 * - docProps/custom.xml (custom properties)
 */
async function extractBDOFromOOXML(fileBuffer: Buffer, filename: string): Promise<IBindingDataObject | null> {
    const zip = await JSZip.loadAsync(fileBuffer);

    // Search for custom XML parts
    const customXmlFiles = Object.keys(zip.files).filter(name =>
        name.startsWith('customXml/') && name.endsWith('.xml') && !name.includes('_rels')
    );

    for (const xmlFile of customXmlFiles) {
        try {
            const content = await zip.file(xmlFile)?.async('string');
            if (!content) continue;

            // Check if this is a STANAG binding information file
            if (content.includes('BindingInformation') ||
                content.includes('originatorConfidentialityLabel') ||
                content.includes(XMP_NAMESPACES.S4778)) {

                const bdo = await parseBindingInformationXML(content);
                if (bdo) {
                    logger.info('Extracted BDO from OOXML', { filename, xmlFile });
                    return bdo;
                }
            }
        } catch (e) {
            logger.debug('Failed to parse custom XML part', { xmlFile, error: e });
        }
    }

    // Also check document properties for embedded labels
    const corePropsFile = 'docProps/core.xml';
    if (zip.files[corePropsFile]) {
        try {
            const coreContent = await zip.file(corePropsFile)?.async('string');
            if (coreContent && coreContent.includes('confidentiality')) {
                // Some systems embed labels in core properties
                const bdo = await parseDocPropsLabel(coreContent);
                if (bdo) {
                    logger.info('Extracted BDO from docProps', { filename });
                    return bdo;
                }
            }
        } catch (e) {
            logger.debug('Failed to parse docProps', { error: e });
        }
    }

    logger.debug('No BDO found in OOXML package', { filename, customXmlFiles: customXmlFiles.length });
    return null;
}

/**
 * Extract BDO from PDF file
 *
 * PDF files may contain XMP metadata packets with STANAG labels.
 * XMP data is typically found in the document metadata stream.
 */
async function extractBDOFromPDF(fileBuffer: Buffer, filename: string): Promise<IBindingDataObject | null> {
    const pdfContent = fileBuffer.toString('latin1');

    // Look for XMP packet markers
    const xmpStartMarkers = ['<?xpacket begin', '<x:xmpmeta', '<rdf:RDF'];
    const xmpEndMarkers = ['<?xpacket end', '</x:xmpmeta', '</rdf:RDF'];

    for (let i = 0; i < xmpStartMarkers.length; i++) {
        const startIdx = pdfContent.indexOf(xmpStartMarkers[i]);
        if (startIdx === -1) continue;

        const endIdx = pdfContent.indexOf(xmpEndMarkers[i], startIdx);
        if (endIdx === -1) continue;

        const xmpPacket = pdfContent.substring(startIdx, endIdx + xmpEndMarkers[i].length + 10);

        // Check if XMP contains STANAG labels
        if (xmpPacket.includes('originatorConfidentialityLabel') ||
            xmpPacket.includes(XMP_NAMESPACES.S4774) ||
            xmpPacket.includes('ConfidentialityInformation')) {

            try {
                const bdo = await parseXMPMetadata(xmpPacket);
                if (bdo) {
                    logger.info('Extracted BDO from PDF XMP', { filename });
                    return bdo;
                }
            } catch (e) {
                logger.debug('Failed to parse XMP packet', { error: e });
            }
        }
    }

    logger.debug('No BDO found in PDF', { filename });
    return null;
}

/**
 * Parse STANAG 4778 BindingInformation XML
 */
async function parseBindingInformationXML(xmlContent: string): Promise<IBindingDataObject | null> {
    const parser = new xml2js.Parser({
        explicitArray: true,
        mergeAttrs: false,
        xmlns: true,
        tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    try {
        const result = await parser.parseStringPromise(xmlContent);

        // Navigate through the binding structure
        const bindingInfoRaw = findBindingInformation(result);
        if (!bindingInfoRaw) return null;
        const bindingInfo = bindingInfoRaw as XmlNode;

        // Extract confidentiality label
        const confLabel = extractConfidentialityLabel(bindingInfo);
        if (!confLabel) return null;

        // Extract data references
        const dataRefs = extractDataReferences(bindingInfo);

        // Extract additional metadata
        const metadata = extractMetadata(bindingInfo);

        return {
            originatorConfidentialityLabel: confLabel,
            dataReferences: dataRefs,
            ...metadata,
        };
    } catch (error) {
        logger.debug('Failed to parse BindingInformation XML', { error });
        return null;
    }
}

/**
 * Find BindingInformation in parsed XML
 */
function findBindingInformation(obj: unknown, depth: number = 0): unknown {
    if (depth > 10) return null;

    if (typeof obj !== 'object' || obj === null) return null;

    const record = obj as Record<string, unknown>;

    // Check for BindingInformation key
    for (const key of Object.keys(record)) {
        if (key.toLowerCase().includes('bindinginformation') ||
            key.toLowerCase().includes('metadatabinding')) {
            return record[key];
        }
    }

    // Recurse into child objects
    for (const value of Object.values(record)) {
        if (typeof value === 'object' && value !== null) {
            const found = findBindingInformation(value, depth + 1);
            if (found) return found;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findBindingInformation(item, depth + 1);
                if (found) return found;
            }
        }
    }

    return null;
}

/**
 * Extract confidentiality label from binding information
 */
function extractConfidentialityLabel(bindingInfo: XmlNode): IConfidentialityLabel | null {
    // Search for originatorConfidentialityLabel
    const label = findInObject(bindingInfo, 'originatorConfidentialityLabel') ||
        findInObject(bindingInfo, 'ConfidentialityLabel') ||
        findInObject(bindingInfo, 'confidentialityLabel');

    if (!label) return null;

    // Extract ConfidentialityInformation
    const confInfo = findInObject(label, 'ConfidentialityInformation') || label;

    // Get policy identifier
    const policyId = extractTextValue(findInObject(confInfo, 'PolicyIdentifier')) || NATO_POLICY_OID;

    // Get classification
    const classification = extractTextValue(findInObject(confInfo, 'Classification')) || 'UNCLASSIFIED';

    // Extract categories if present
    const categories = extractCategories(confInfo as XmlNode);

    // Extract originator info
    const originatorId = findInObject(label, 'OriginatorID') as XmlNode | null;
    const creationDateTime = extractTextValue(findInObject(label, 'CreationDateTime'));

    return {
        policyIdentifier: policyId,
        classification: normalizeClassification(classification),
        categories: categories && categories.length > 0 ? categories : undefined,
        creationDateTime,
        originatorId: extractTextValue(originatorId) || undefined,
        originatorIdType: originatorId?.$?.IDType as 'uniformResourceIdentifier' | 'distinguishedName' | undefined,
    };
}

/**
 * Extract data references from binding information
 */
function extractDataReferences(bindingInfo: XmlNode): IDataReference[] {
    const refs: IDataReference[] = [];

    const dataRefNodes = findAllInObject(bindingInfo, 'DataReference');

    for (const rawNode of dataRefNodes) {
        const node = rawNode as XmlNode;
        const uri = node.$?.URI || extractTextValue(node) || '';
        const hashAlg = node.$?.hashAlgorithm;
        const hashVal = node.$?.hashValue;

        refs.push({
            uri,
            hashAlgorithm: hashAlg,
            hashValue: hashVal,
        });
    }

    // If no refs found, add a default reference to the whole document
    if (refs.length === 0) {
        refs.push({ uri: '' });
    }

    return refs;
}

/**
 * Extract additional metadata from binding information
 */
function extractMetadata(bindingInfo: XmlNode): Partial<IBindingDataObject> {
    return {
        creator: extractTextValue(findInObject(bindingInfo, 'Creator')),
        description: extractTextValue(findInObject(bindingInfo, 'Description')),
        publisher: extractTextValue(findInObject(bindingInfo, 'Publisher')),
        dateCreated: extractTextValue(findInObject(bindingInfo, 'DateCreated')),
        title: extractTextValue(findInObject(bindingInfo, 'Title')),
        identifier: extractTextValue(findInObject(bindingInfo, 'Identifier')),
        version: extractTextValue(findInObject(bindingInfo, 'Version')),
    };
}

/**
 * Extract categories from confidentiality information
 */
function extractCategories(confInfo: XmlNode): IConfidentialityLabel['categories'] {
    const categories: IConfidentialityLabel['categories'] = [];

    // Look for Category or SecurityCategory elements
    const categoryNodes = findAllInObject(confInfo, 'Category') ||
        findAllInObject(confInfo, 'SecurityCategory');

    for (const rawNode of categoryNodes) {
        const node = rawNode as XmlNode;
        const tagSetId = node.$?.tagSetId || '';
        const tagName = node.$?.tagName || extractTextValue(findInObject(node, 'TagName')) || '';
        const values = extractCategoryValues(node);

        if (tagName || values.length > 0) {
            categories.push({ tagSetId, tagName, values });
        }
    }

    return categories;
}

/**
 * Extract category values
 */
function extractCategoryValues(categoryNode: XmlNode): string[] {
    const values: string[] = [];

    const valueNodes = findAllInObject(categoryNode, 'Value') ||
        findAllInObject(categoryNode, 'CategoryValue');

    for (const node of valueNodes) {
        const val = extractTextValue(node);
        if (val) values.push(val);
    }

    return values;
}

/**
 * Parse document properties label (alternative embedding method)
 */
async function parseDocPropsLabel(xmlContent: string): Promise<IBindingDataObject | null> {
    // Some systems embed simplified classification info in doc properties
    const parser = new xml2js.Parser({
        explicitArray: true,
        tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    try {
        const result = await parser.parseStringPromise(xmlContent);

        // Look for custom properties with classification
        const props = result.coreProperties || result.Properties || {};

        // Check for classification-related properties
        const category = extractTextValue(findInObject(props, 'category'));
        const subject = extractTextValue(findInObject(props, 'subject'));

        if (category || subject) {
            const classificationMatch = (category || subject)?.match(
                /(UNCLASSIFIED|RESTRICTED|CONFIDENTIAL|SECRET|TOP SECRET)/i
            );

            if (classificationMatch) {
                return {
                    originatorConfidentialityLabel: {
                        policyIdentifier: NATO_POLICY_OID,
                        classification: normalizeClassification(classificationMatch[1]),
                    },
                    dataReferences: [{ uri: '' }],
                };
            }
        }
    } catch (e) {
        logger.debug('Failed to parse doc props', { error: e });
    }

    return null;
}

/**
 * Parse XMP metadata for STANAG labels
 */
async function parseXMPMetadata(xmpContent: string): Promise<IBindingDataObject | null> {
    const parser = new xml2js.Parser({
        explicitArray: true,
        xmlns: true,
        tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    try {
        const result = await parser.parseStringPromise(xmpContent);

        // Look for STANAG label in XMP structure
        const label = findInObject(result, 'originatorConfidentialityLabel') ||
            findInObject(result, 'ConfidentialityLabel');

        if (label) {
            const confLabel = extractConfidentialityLabel({ originatorConfidentialityLabel: label });
            if (confLabel) {
                return {
                    originatorConfidentialityLabel: confLabel,
                    dataReferences: [{ uri: '' }],
                };
            }
        }
    } catch (e) {
        logger.debug('Failed to parse XMP metadata', { error: e });
    }

    return null;
}

/**
 * Parse sidecar BDO file (.bdo or .xmp)
 */
export async function parseSidecarBDO(sidecarBuffer: Buffer, filename: string): Promise<IBindingDataObject | null> {
    const content = sidecarBuffer.toString('utf-8');

    // Detect format (XML vs JSON)
    if (content.trim().startsWith('<')) {
        // XML format
        if (content.includes('xmpmeta') || content.includes('rdf:RDF')) {
            return parseXMPMetadata(content);
        } else {
            return parseBindingInformationXML(content);
        }
    } else if (content.trim().startsWith('{')) {
        // JSON format (some implementations use JSON)
        try {
            const json = JSON.parse(content);
            return normalizeJSONBDO(json);
        } catch (e) {
            logger.debug('Failed to parse JSON sidecar', { filename, error: e });
        }
    }

    return null;
}

/**
 * Normalize JSON BDO to standard format
 */
function normalizeJSONBDO(json: Record<string, unknown>): IBindingDataObject | null {
    if (!json.classification && !json.originatorConfidentialityLabel) {
        return null;
    }

    if (json.originatorConfidentialityLabel) {
        return json as unknown as IBindingDataObject;
    }

    // Simplified JSON format
    return {
        originatorConfidentialityLabel: {
            policyIdentifier: (json.policyIdentifier as string) || NATO_POLICY_OID,
            classification: normalizeClassification(json.classification as string),
            categories: json.categories as IConfidentialityLabel['categories'],
        },
        dataReferences: (json.dataReferences as IDataReference[]) || [{ uri: '' }],
    };
}

/**
 * Normalize classification string
 */
function normalizeClassification(classification: string): string {
    const normalized = classification.toUpperCase().trim();

    // Map common variations
    const mappings: Record<string, string> = {
        'TS': 'TOP SECRET',
        'TOPSECRET': 'TOP SECRET',
        'TOP_SECRET': 'TOP SECRET',
        'S': 'SECRET',
        'C': 'CONFIDENTIAL',
        'R': 'RESTRICTED',
        'U': 'UNCLASSIFIED',
        'UNMARKED': 'UNCLASSIFIED',
        'PUBLIC': 'UNCLASSIFIED',
    };

    return mappings[normalized] || normalized;
}

/**
 * Utility: Find value by key in nested object
 */
function findInObject(obj: unknown, key: string, depth: number = 0): unknown {
    if (depth > 10 || typeof obj !== 'object' || obj === null) return null;

    const record = obj as Record<string, unknown>;
    const lowerKey = key.toLowerCase();

    for (const k of Object.keys(record)) {
        if (k.toLowerCase() === lowerKey || k.toLowerCase().endsWith(`:${lowerKey}`)) {
            return record[k];
        }
    }

    for (const value of Object.values(record)) {
        if (typeof value === 'object') {
            const found = findInObject(value, key, depth + 1);
            if (found !== null) return found;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findInObject(item, key, depth + 1);
                if (found !== null) return found;
            }
        }
    }

    return null;
}

/**
 * Utility: Find all values by key in nested object
 */
function findAllInObject(obj: unknown, key: string, depth: number = 0): unknown[] {
    const results: unknown[] = [];

    if (depth > 10 || typeof obj !== 'object' || obj === null) return results;

    const record = obj as Record<string, unknown>;
    const lowerKey = key.toLowerCase();

    for (const [k, v] of Object.entries(record)) {
        if (k.toLowerCase() === lowerKey || k.toLowerCase().endsWith(`:${lowerKey}`)) {
            if (Array.isArray(v)) {
                results.push(...v);
            } else {
                results.push(v);
            }
        }
    }

    for (const value of Object.values(record)) {
        if (typeof value === 'object' && value !== null) {
            results.push(...findAllInObject(value, key, depth + 1));
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                results.push(...findAllInObject(item, key, depth + 1));
            }
        }
    }

    return results;
}

/**
 * Utility: Extract text value from XML node
 */
function extractTextValue(node: unknown): string | undefined {
    if (typeof node === 'string') return node;
    if (node === null || node === undefined) return undefined;
    if (typeof node === 'object') {
        if ('_' in (node as Record<string, unknown>) && typeof (node as Record<string, unknown>)._ === 'string') return (node as Record<string, unknown>)._ as string;
        if (Array.isArray(node) && node.length > 0) {
            return extractTextValue(node[0]);
        }
    }
    return undefined;
}

/**
 * Create BDO from ZTDF metadata (for newly uploaded files)
 */
export function createBDOFromMetadata(
    classification: string,
    releasabilityTo: string[],
    options: {
        COI?: string[];
        caveats?: string[];
        title?: string;
        creator?: string;
    } = {}
): IBindingDataObject {
    const categories: IConfidentialityLabel['categories'] = [];

    // Add releasability as a category
    if (releasabilityTo && releasabilityTo.length > 0) {
        categories.push({
            tagSetId: '1.3.26.1.4.2', // Releasable To tag set
            tagName: 'Releasable To',
            values: releasabilityTo,
        });
    }

    // Add COI as categories
    if (options.COI && options.COI.length > 0) {
        categories.push({
            tagSetId: '1.3.26.1.4.4', // Context tag set
            tagName: 'COI',
            values: options.COI,
        });
    }

    // Add caveats as special categories
    if (options.caveats && options.caveats.length > 0) {
        categories.push({
            tagSetId: '1.3.26.1.4.1', // Special Category Designators
            tagName: 'Special Category Designators',
            values: options.caveats,
        });
    }

    return {
        originatorConfidentialityLabel: {
            policyIdentifier: NATO_POLICY_OID,
            classification: normalizeClassification(classification),
            categories: categories.length > 0 ? categories : undefined,
            creationDateTime: new Date().toISOString(),
        },
        dataReferences: [{ uri: '' }],
        title: options.title,
        creator: options.creator,
        dateCreated: new Date().toISOString(),
    };
}
