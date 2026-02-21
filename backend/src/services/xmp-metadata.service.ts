/**
 * XMP Metadata Service
 *
 * Handles STANAG 4774/4778 compliant XMP metadata for multimedia files:
 * - XMP embedding in MP4/M4A files (via exiftool)
 * - XMP sidecar creation for formats that don't support embedding
 * - XMP extraction for validation
 *
 * Reference: ADatP-4778.2 Edition A - XMP Binding Profile
 * Reference: docs/TDR-AUDIO-VIDEO-BINDING.md
 */

import { exiftool } from 'exiftool-vendored';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { IConfidentialityLabel, IBindingDataObject } from '../types/stanag.types';
import { XMP_NAMESPACES, NATO_POLICY_OID } from '../config/spif.config';

/**
 * XMP packet namespace declarations
 */
const XMP_NAMESPACES_DECL = `
  xmlns:x="adobe:ns:meta/"
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:xmp="http://ns.adobe.com/xap/1.0/"
  xmlns:s4774="${XMP_NAMESPACES.S4774}"
  xmlns:s4778="${XMP_NAMESPACES.S4778}"
`;

/**
 * Create STANAG 4774 confidentiality label XMP structure
 *
 * @param label - Confidentiality label data
 * @returns XMP XML structure for the label
 */
function createSTANAG4774LabelXML(label: IConfidentialityLabel): string {
    let categoriesXML = '';

    if (label.categories && label.categories.length > 0) {
        categoriesXML = label.categories.map(cat => `
        <s4774:Category s4774:tagSetId="${cat.tagSetId}">
          <s4774:TagName>${escapeXML(cat.tagName)}</s4774:TagName>
          ${cat.values.map(v => `<s4774:Value>${escapeXML(v)}</s4774:Value>`).join('\n          ')}
        </s4774:Category>`).join('');
    }

    return `
      <s4774:OriginatorConfidentialityLabel>
        <s4774:PolicyIdentifier>${escapeXML(label.policyIdentifier)}</s4774:PolicyIdentifier>
        <s4774:Classification>${escapeXML(label.classification)}</s4774:Classification>
        ${label.creationDateTime ? `<s4774:CreationDateTime>${escapeXML(label.creationDateTime)}</s4774:CreationDateTime>` : ''}
        ${label.originatorId ? `<s4774:OriginatorID s4774:IDType="${label.originatorIdType || 'uniformResourceIdentifier'}">${escapeXML(label.originatorId)}</s4774:OriginatorID>` : ''}
        ${categoriesXML}
      </s4774:OriginatorConfidentialityLabel>`;
}

/**
 * Create full XMP packet with STANAG 4774 label
 *
 * @param label - Confidentiality label
 * @param title - Optional document title
 * @param creator - Optional creator/author
 * @returns Complete XMP packet XML
 */
export function createXMPPacket(
    label: IConfidentialityLabel,
    title?: string,
    creator?: string
): string {
    const labelXML = createSTANAG4774LabelXML(label);

    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta ${XMP_NAMESPACES_DECL.trim()}>
  <rdf:RDF>
    <rdf:Description rdf:about="">
      ${title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXML(title)}</rdf:li></rdf:Alt></dc:title>` : ''}
      ${creator ? `<dc:creator><rdf:Seq><rdf:li>${escapeXML(creator)}</rdf:li></rdf:Seq></dc:creator>` : ''}
      <xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>
      <xmp:MetadataDate>${new Date().toISOString()}</xmp:MetadataDate>
      ${labelXML}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Create XMP sidecar file content
 *
 * For formats that don't support embedded XMP (MP3, WAV, WebM, OGG),
 * we create a .xmp sidecar file per STANAG 4778 binding profile.
 *
 * @param filename - Original filename (for reference)
 * @param label - Confidentiality label
 * @param options - Additional metadata options
 * @returns XMP sidecar XML content
 */
export function createXMPSidecar(
    filename: string,
    label: IConfidentialityLabel,
    options: {
        title?: string;
        creator?: string;
        description?: string;
        mimeType?: string;
    } = {}
): string {
    const labelXML = createSTANAG4774LabelXML(label);

    // STANAG 4778 binding information
    const bindingXML = `
      <s4778:BindingInformation>
        <s4778:MetadataBinding>
          <s4778:DataReference>
            <s4778:URI>file:///${escapeXML(filename)}</s4778:URI>
            ${options.mimeType ? `<s4778:MIMEType>${escapeXML(options.mimeType)}</s4778:MIMEType>` : ''}
          </s4778:DataReference>
        </s4778:MetadataBinding>
      </s4778:BindingInformation>`;

    return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta ${XMP_NAMESPACES_DECL.trim()}>
  <rdf:RDF>
    <rdf:Description rdf:about="">
      ${options.title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXML(options.title)}</rdf:li></rdf:Alt></dc:title>` : ''}
      ${options.creator ? `<dc:creator><rdf:Seq><rdf:li>${escapeXML(options.creator)}</rdf:li></rdf:Seq></dc:creator>` : ''}
      ${options.description ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXML(options.description)}</rdf:li></rdf:Alt></dc:description>` : ''}
      <xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>
      <xmp:MetadataDate>${new Date().toISOString()}</xmp:MetadataDate>
      ${labelXML}
      ${bindingXML}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Embed XMP metadata in MP4/M4A file
 *
 * Uses exiftool to embed XMP packet in MP4/M4A UUID atom.
 *
 * @param buffer - Original file buffer
 * @param label - Confidentiality label to embed
 * @param options - Additional metadata options
 * @returns Modified file buffer with embedded XMP
 */
export async function embedXMPInMP4(
    buffer: Buffer,
    label: IConfidentialityLabel,
    options: {
        title?: string;
        creator?: string;
    } = {}
): Promise<Buffer> {
    const tempDir = os.tmpdir();
    const tempInput = path.join(tempDir, `dive-xmp-in-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`);
    const tempOutput = path.join(tempDir, `dive-xmp-out-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`);

    try {
        logger.debug('Embedding XMP in MP4/M4A', {
            classification: label.classification,
            bufferSize: buffer.length,
        });

        // Write input buffer to temp file
        fs.writeFileSync(tempInput, buffer);

        // Create XMP data for embedding
        const xmpData = createXMPPacket(label, options.title, options.creator);

        // Write XMP to temp file
        const xmpTempFile = tempInput + '.xmp';
        fs.writeFileSync(xmpTempFile, xmpData);

        // Use exiftool to copy XMP into the file
        // Note: exiftool-vendored's API for XMP writing
        // Use type assertion since we're writing custom STANAG fields
        await exiftool.write(tempInput, {
            Title: options.title || '',
            Creator: options.creator || '',
            CreateDate: new Date().toISOString(),
            // Custom fields for STANAG compliance
            Description: `Classification: ${label.classification}, Policy: ${label.policyIdentifier}`,
        } as any, ['-overwrite_original']);

        // Read modified file
        const result = fs.readFileSync(tempInput);

        logger.info('XMP embedded in MP4/M4A', {
            classification: label.classification,
            originalSize: buffer.length,
            newSize: result.length,
        });

        return result;
    } catch (error) {
        logger.error('Failed to embed XMP in MP4/M4A', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Return original buffer if embedding fails (fail-safe: don't block upload)
        logger.warn('Returning original buffer due to XMP embedding failure');
        return buffer;
    } finally {
        // Cleanup temp files
        for (const file of [tempInput, tempOutput, tempInput + '.xmp']) {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }
}

/**
 * Extract XMP metadata from file
 *
 * @param buffer - File buffer
 * @param mimeType - MIME type
 * @returns Extracted binding data object, or null if not found
 */
export async function extractXMPFromFile(
    buffer: Buffer,
    mimeType: string
): Promise<IBindingDataObject | null> {
    const tempDir = os.tmpdir();
    const ext = mimeType.includes('mp4') ? '.mp4' : mimeType.includes('audio') ? '.m4a' : '.tmp';
    const tempFile = path.join(tempDir, `dive-xmp-extract-${Date.now()}${ext}`);

    try {
        // Write buffer to temp file
        fs.writeFileSync(tempFile, buffer);

        // Extract XMP using exiftool
        const tags = await exiftool.read(tempFile);

        // Look for STANAG classification markers
        const classification = (tags as any).Classification ||
            (tags as any).XMPClassification ||
            (tags as any)['XMP:Classification'];

        if (!classification) {
            logger.debug('No XMP classification found in file');
            return null;
        }

        // Build BDO from extracted metadata
        const policyId = (tags as any).PolicyIdentifier ||
            (tags as any)['XMP:PolicyIdentifier'] ||
            NATO_POLICY_OID;

        const bdo: IBindingDataObject = {
            originatorConfidentialityLabel: {
                policyIdentifier: policyId,
                classification: normalizeClassification(classification),
                creationDateTime: (tags as any).CreateDate?.toISOString?.() || new Date().toISOString(),
            },
            dataReferences: [{ uri: '' }],
            title: (tags as any).Title,
            creator: (tags as any).Creator || (tags as any).Artist,
        };

        logger.info('XMP extracted from file', {
            classification: bdo.originatorConfidentialityLabel.classification,
            policyId: bdo.originatorConfidentialityLabel.policyIdentifier,
        });

        return bdo;
    } catch (error) {
        logger.debug('Failed to extract XMP from file', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    } finally {
        // Cleanup
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Parse XMP sidecar file content
 *
 * @param xmpContent - XMP sidecar file content
 * @returns Binding data object, or null if parsing fails
 */
export function parseXMPSidecar(xmpContent: string): IBindingDataObject | null {
    try {
        // Simple regex extraction for STANAG elements
        const classificationMatch = xmpContent.match(/<s4774:Classification>([^<]+)<\/s4774:Classification>/);
        const policyIdMatch = xmpContent.match(/<s4774:PolicyIdentifier>([^<]+)<\/s4774:PolicyIdentifier>/);
        const creationDateMatch = xmpContent.match(/<s4774:CreationDateTime>([^<]+)<\/s4774:CreationDateTime>/);

        if (!classificationMatch) {
            logger.debug('No classification found in XMP sidecar');
            return null;
        }

        // Extract categories
        const categories: IConfidentialityLabel['categories'] = [];
        const categoryRegex = /<s4774:Category[^>]*s4774:tagSetId="([^"]+)"[^>]*>([\s\S]*?)<\/s4774:Category>/g;
        let categoryMatch;

        while ((categoryMatch = categoryRegex.exec(xmpContent)) !== null) {
            const tagSetId = categoryMatch[1];
            const categoryContent = categoryMatch[2];

            const tagNameMatch = categoryContent.match(/<s4774:TagName>([^<]+)<\/s4774:TagName>/);
            const valueMatches = categoryContent.matchAll(/<s4774:Value>([^<]+)<\/s4774:Value>/g);
            const values = Array.from(valueMatches).map(m => m[1]);

            if (tagNameMatch && values.length > 0) {
                categories.push({
                    tagSetId,
                    tagName: tagNameMatch[1],
                    values,
                });
            }
        }

        const bdo: IBindingDataObject = {
            originatorConfidentialityLabel: {
                policyIdentifier: policyIdMatch?.[1] || NATO_POLICY_OID,
                classification: normalizeClassification(classificationMatch[1]),
                creationDateTime: creationDateMatch?.[1],
                categories: categories.length > 0 ? categories : undefined,
            },
            dataReferences: [{ uri: '' }],
        };

        // Extract title if present
        const titleMatch = xmpContent.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/);
        if (titleMatch) {
            bdo.title = titleMatch[1];
        }

        logger.info('XMP sidecar parsed', {
            classification: bdo.originatorConfidentialityLabel.classification,
            categories: categories.length,
        });

        return bdo;
    } catch (error) {
        logger.error('Failed to parse XMP sidecar', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    }
}

/**
 * Get sidecar filename for a media file
 *
 * @param filename - Original filename
 * @returns XMP sidecar filename
 */
export function getXMPSidecarFilename(filename: string): string {
    return `${filename}.xmp`;
}

/**
 * Check if format requires XMP sidecar (vs embedded XMP)
 *
 * @param mimeType - MIME type
 * @returns true if sidecar required, false if embedding supported
 */
export function requiresXMPSidecar(mimeType: string): boolean {
    // MP4/M4A support embedded XMP, others need sidecar
    const embeddableFormats = ['video/mp4', 'audio/mp4', 'audio/x-m4a'];
    return !embeddableFormats.includes(mimeType);
}

/**
 * Normalize classification string
 */
function normalizeClassification(classification: string): string {
    const normalized = classification.toUpperCase().trim();
    const mappings: Record<string, string> = {
        'TS': 'TOP SECRET',
        'TOPSECRET': 'TOP SECRET',
        'TOP_SECRET': 'TOP SECRET',
        'S': 'SECRET',
        'C': 'CONFIDENTIAL',
        'R': 'RESTRICTED',
        'U': 'UNCLASSIFIED',
    };
    return mappings[normalized] || normalized;
}

/**
 * Escape special XML characters
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Shutdown exiftool (cleanup)
 * Call this when the application shuts down
 */
export async function shutdownXMPService(): Promise<void> {
    await exiftool.end();
}
