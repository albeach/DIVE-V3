/**
 * Document Conversion Routes
 * 
 * Provides server-side document conversion endpoints.
 * Best practice: Convert Office documents (DOCX, XLSX, PPTX) to viewable formats
 * on the server where proper parsing libraries are available.
 * 
 * Endpoints:
 * - POST /api/documents/convert-to-html - Convert DOCX to HTML for inline viewing
 * - POST /api/documents/convert-to-pdf - Convert Office docs to PDF
 * - GET /api/documents/converter-status - Check if conversion is available
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
    convertDocxToPdf,
    convertToPdf,
    canConvertToPdf,
    getConverterStatus,
    isLibreOfficeAvailable,
} from '../services/document-converter.service';

const router = Router();

/**
 * Convert DOCX to HTML using mammoth.js (server-side)
 * This is the best practice for DOCX viewing in web applications
 */
router.post('/convert-to-html', async (req: Request, res: Response) => {
    try {
        const { content, contentType } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Missing content' });
        }

        // Validate content type
        if (contentType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return res.status(400).json({
                error: 'Only DOCX files can be converted to HTML',
                supportedType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });
        }

        // Decode base64 content
        const buffer = Buffer.from(content, 'base64');

        logger.info('Converting DOCX to HTML', { size: buffer.length });

        // Use mammoth.js for high-fidelity DOCX to HTML conversion
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ buffer });

        logger.info('DOCX to HTML conversion complete', {
            htmlLength: result.value.length,
            warnings: result.messages.length,
        });

        // Log any conversion warnings for debugging
        if (result.messages.length > 0) {
            logger.debug('DOCX conversion messages', { messages: result.messages });
        }

        return res.json({
            success: true,
            html: result.value,
            messages: result.messages.map(m => ({
                type: m.type,
                message: m.message,
            })),
        });

    } catch (error) {
        logger.error('DOCX to HTML conversion failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return res.status(500).json({
            error: 'Conversion failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Convert Office document to PDF using LibreOffice
 */
router.post('/convert-to-pdf', async (req: Request, res: Response) => {
    try {
        const { content, contentType } = req.body;

        if (!content || !contentType) {
            return res.status(400).json({ error: 'Missing content or contentType' });
        }

        if (!canConvertToPdf(contentType)) {
            return res.status(400).json({
                error: 'Unsupported content type for PDF conversion',
                contentType,
            });
        }

        // Decode base64 content
        const buffer = Buffer.from(content, 'base64');

        logger.info('Converting document to PDF', { contentType, size: buffer.length });

        const pdfBuffer = await convertToPdf(buffer, contentType, { timeout: 60000 });

        // Return as base64
        return res.json({
            success: true,
            pdf: pdfBuffer.toString('base64'),
            originalSize: buffer.length,
            pdfSize: pdfBuffer.length,
        });

    } catch (error) {
        logger.error('PDF conversion failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return res.status(500).json({
            error: 'Conversion failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Get converter service status
 */
router.get('/status', async (_req: Request, res: Response) => {
    try {
        const status = await getConverterStatus();
        const mammothAvailable = true; // mammoth.js is always available (pure JS)

        return res.json({
            ...status,
            mammothAvailable,
            htmlConversion: true, // Always available via mammoth.js
            pdfConversion: status.available, // Depends on LibreOffice
        });

    } catch (error) {
        return res.status(500).json({
            error: 'Failed to get converter status',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
