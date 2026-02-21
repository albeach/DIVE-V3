/**
 * Document Converter Service
 *
 * Provides server-side document conversion for STANAG-compliant viewing.
 * Primary use case: DOCX → PDF conversion for displaying with security markings.
 *
 * Implementation options (in order of preference):
 * 1. LibreOffice headless (libreoffice-convert npm package)
 * 2. Native Node.js conversion (docx-pdf or similar)
 * 3. External conversion API
 *
 * Note: For production deployments, LibreOffice should be installed in the Docker container:
 * RUN apt-get update && apt-get install -y libreoffice-writer
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

// Track LibreOffice availability
let libreOfficeAvailable: boolean | null = null;

/**
 * Check if LibreOffice is available on the system
 */
export async function isLibreOfficeAvailable(): Promise<boolean> {
    if (libreOfficeAvailable !== null) {
        return libreOfficeAvailable;
    }

    try {
        // Try to find LibreOffice
        const commands = ['libreoffice', 'soffice', '/usr/bin/libreoffice', '/usr/bin/soffice'];

        for (const cmd of commands) {
            try {
                execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 });
                libreOfficeAvailable = true;
                logger.info('LibreOffice found', { command: cmd });
                return true;
            } catch {
                // Try next command
            }
        }

        libreOfficeAvailable = false;
        logger.warn('LibreOffice not found on system');
        return false;
    } catch (error) {
        libreOfficeAvailable = false;
        logger.warn('Error checking LibreOffice availability', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}

/**
 * Get LibreOffice command path
 */
function getLibreOfficeCommand(): string {
    const commands = ['libreoffice', 'soffice', '/usr/bin/libreoffice', '/usr/bin/soffice'];

    for (const cmd of commands) {
        try {
            execSync(`which ${cmd}`, { stdio: 'pipe' });
            return cmd;
        } catch {
            // Try next
        }
    }

    return 'libreoffice'; // Default
}

/**
 * Convert DOCX to PDF using LibreOffice
 *
 * @param docxBuffer - The DOCX file buffer
 * @param options - Conversion options
 * @returns PDF buffer
 */
export async function convertDocxToPdf(
    docxBuffer: Buffer,
    options: {
        timeout?: number;
        addMarking?: boolean;
        markingText?: string;
    } = {}
): Promise<Buffer> {
    const timeout = options.timeout || 30000; // 30 second default timeout

    // Check LibreOffice availability
    const available = await isLibreOfficeAvailable();
    if (!available) {
        throw new Error('LibreOffice is not available for document conversion. Please install LibreOffice on the server.');
    }

    // Create temporary directory for conversion
    const tempDir = path.join(os.tmpdir(), `docx-convert-${crypto.randomBytes(8).toString('hex')}`);
    const inputFile = path.join(tempDir, 'input.docx');
    const outputFile = path.join(tempDir, 'input.pdf');

    try {
        // Create temp directory
        fs.mkdirSync(tempDir, { recursive: true });

        // Write DOCX to temp file
        fs.writeFileSync(inputFile, docxBuffer);

        logger.info('Starting DOCX to PDF conversion', {
            tempDir,
            inputSize: docxBuffer.length,
        });

        // Run LibreOffice conversion
        const libreOfficeCmd = getLibreOfficeCommand();
        const command = `${libreOfficeCmd} --headless --convert-to pdf --outdir "${tempDir}" "${inputFile}"`;

        await execAsync(command, { timeout });

        // Check if output file exists
        if (!fs.existsSync(outputFile)) {
            throw new Error('LibreOffice conversion did not produce output file');
        }

        // Read the PDF output
        const pdfBuffer = fs.readFileSync(outputFile);

        logger.info('DOCX to PDF conversion successful', {
            inputSize: docxBuffer.length,
            outputSize: pdfBuffer.length,
        });

        return pdfBuffer;

    } catch (error) {
        logger.error('DOCX to PDF conversion failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error(`Document conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        // Cleanup temp files
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            logger.warn('Failed to cleanup temp files', { tempDir });
        }
    }
}

/**
 * Convert any Office document to PDF
 */
export async function convertToPdf(
    buffer: Buffer,
    mimeType: string,
    options: { timeout?: number } = {}
): Promise<Buffer> {
    // Supported MIME types for LibreOffice conversion
    const supportedTypes: Record<string, string> = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/rtf': 'rtf',
        'text/plain': 'txt',
    };

    const extension = supportedTypes[mimeType];
    if (!extension) {
        throw new Error(`Unsupported MIME type for conversion: ${mimeType}`);
    }

    // Use the same conversion method (LibreOffice handles all these formats)
    return convertWithLibreOffice(buffer, extension, options);
}

/**
 * Generic LibreOffice conversion
 */
async function convertWithLibreOffice(
    buffer: Buffer,
    inputExtension: string,
    options: { timeout?: number } = {}
): Promise<Buffer> {
    const timeout = options.timeout || 30000;

    const available = await isLibreOfficeAvailable();
    if (!available) {
        throw new Error('LibreOffice is not available');
    }

    const tempDir = path.join(os.tmpdir(), `convert-${crypto.randomBytes(8).toString('hex')}`);
    const inputFile = path.join(tempDir, `input.${inputExtension}`);
    const outputFile = path.join(tempDir, 'input.pdf');

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(inputFile, buffer);

        const libreOfficeCmd = getLibreOfficeCommand();
        const command = `${libreOfficeCmd} --headless --convert-to pdf --outdir "${tempDir}" "${inputFile}"`;

        await execAsync(command, { timeout });

        if (!fs.existsSync(outputFile)) {
            throw new Error('Conversion did not produce output file');
        }

        return fs.readFileSync(outputFile);

    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Check if a MIME type can be converted to PDF
 */
export function canConvertToPdf(mimeType: string): boolean {
    const convertibleTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
        'application/rtf',
        'text/plain',
    ];

    return convertibleTypes.includes(mimeType);
}

/**
 * Conversion result with metadata
 */
export interface IConversionResult {
    success: boolean;
    pdfBuffer?: Buffer;
    error?: string;
    originalSize: number;
    convertedSize?: number;
    conversionTimeMs?: number;
}

/**
 * Convert document with detailed result
 */
export async function convertDocumentWithResult(
    buffer: Buffer,
    mimeType: string,
    options: { timeout?: number } = {}
): Promise<IConversionResult> {
    const startTime = Date.now();

    try {
        if (!canConvertToPdf(mimeType)) {
            return {
                success: false,
                error: `MIME type ${mimeType} cannot be converted to PDF`,
                originalSize: buffer.length,
            };
        }

        const pdfBuffer = await convertToPdf(buffer, mimeType, options);

        return {
            success: true,
            pdfBuffer,
            originalSize: buffer.length,
            convertedSize: pdfBuffer.length,
            conversionTimeMs: Date.now() - startTime,
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown conversion error',
            originalSize: buffer.length,
            conversionTimeMs: Date.now() - startTime,
        };
    }
}

/**
 * Extract text content from document (for portion marking)
 * This is a simplified implementation - for production, use mammoth.js or similar
 */
export async function extractTextFromDocx(docxBuffer: Buffer): Promise<string> {
    // Simple extraction using JSZip (DOCX is a ZIP file)
    const JSZip = await import('jszip');
    const zip = await JSZip.loadAsync(docxBuffer);

    // DOCX stores main content in word/document.xml
    const documentXml = await zip.file('word/document.xml')?.async('string');

    if (!documentXml) {
        throw new Error('Could not find document.xml in DOCX file');
    }

    // Simple text extraction (strip XML tags)
    // For production, use a proper DOCX parser like mammoth.js
    const textContent = documentXml
        .replace(/<w:t[^>]*>([^<]*)<\/w:t>/gi, '$1 ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return textContent;
}

/**
 * Get conversion service status
 */
export async function getConverterStatus(): Promise<{
    available: boolean;
    libreOfficeVersion?: string;
    supportedFormats: string[];
}> {
    const available = await isLibreOfficeAvailable();

    let version: string | undefined;
    if (available) {
        try {
            const cmd = getLibreOfficeCommand();
            const { stdout } = await execAsync(`${cmd} --version`);
            version = stdout.trim();
        } catch {
            // Ignore version check errors
        }
    }

    return {
        available,
        libreOfficeVersion: version,
        supportedFormats: [
            'DOCX', 'DOC', 'XLSX', 'XLS', 'PPTX', 'PPT', 'RTF', 'TXT'
        ],
    };
}
