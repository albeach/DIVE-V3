import compression from 'compression';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Response Compression Middleware (Phase 3)
// ============================================
// Purpose: Reduce response payload size using gzip compression
// Expected: 60-80% reduction in response sizes
// Performance: Minimal CPU overhead with level 6 compression

/**
 * Should compress response?
 * Custom filter function to determine which responses to compress
 */
const shouldCompress = (req: Request, res: Response): boolean => {
    // Don't compress if client explicitly requests no compression
    if (req.headers['x-no-compression']) {
        return false;
    }

    // Don't compress responses that are already compressed
    const contentEncoding = res.getHeader('Content-Encoding');
    if (contentEncoding && contentEncoding !== 'identity') {
        return false;
    }

    // Don't compress small responses (not worth the CPU overhead)
    const contentLength = res.getHeader('Content-Length');
    if (contentLength && parseInt(contentLength as string, 10) < 1024) {
        // Skip compression for responses < 1KB
        return false;
    }

    // Don't compress if Content-Type is missing
    const contentType = res.getHeader('Content-Type');
    if (!contentType) {
        return false;
    }

    // Don't compress media files (images, videos, audio)
    const contentTypeStr = contentType.toString().toLowerCase();
    const uncompressibleTypes = [
        'image/',
        'video/',
        'audio/',
        'application/zip',
        'application/gzip',
        'application/x-gzip',
        'application/x-compressed',
    ];

    if (uncompressibleTypes.some(type => contentTypeStr.includes(type))) {
        return false;
    }

    // Use default compression filter for other cases
    return compression.filter(req, res);
};

/**
 * Compression middleware with custom configuration
 * 
 * Configuration:
 * - Level 6: Balance between compression ratio and CPU usage
 * - Custom filter: Intelligent decision on what to compress
 * - Threshold: Only compress responses > 1KB
 */
export const compressionMiddleware = compression({
    // Compression level (0-9)
    // 0 = no compression
    // 1 = fastest, lowest compression
    // 6 = balanced (recommended)
    // 9 = slowest, best compression
    level: parseInt(process.env.COMPRESSION_LEVEL || '6', 10),

    // Minimum response size to compress (bytes)
    // Don't compress responses smaller than 1KB
    threshold: 1024,

    // Custom filter function
    filter: shouldCompress,

    // Memory level (1-9)
    // Higher = more memory, better compression
    memLevel: 8,
});

/**
 * Compression statistics middleware
 * Logs compression ratio for monitoring
 * (Should be placed AFTER compression middleware)
 */
export const compressionStats = (req: Request, res: Response, next: Function): void => {
    const requestId = req.headers['x-request-id'] as string;

    // Wrap res.end to calculate compression stats
    const originalEnd = res.end;
    let originalSize = 0;

    // Intercept res.write to track original size
    const originalWrite = res.write;
    res.write = function(chunk: any, ...args: any[]): boolean {
        if (chunk) {
            originalSize += Buffer.byteLength(chunk);
        }
        return originalWrite.apply(res, [chunk, ...args] as any);
    };

    res.end = function(chunk: any, ...args: any[]): any {
        if (chunk) {
            originalSize += Buffer.byteLength(chunk);
        }

        const compressedSize = res.getHeader('Content-Length');
        const contentEncoding = res.getHeader('Content-Encoding');

        // Log compression stats
        if (contentEncoding === 'gzip' && compressedSize && originalSize > 0) {
            const ratio = ((1 - (parseInt(compressedSize as string, 10) / originalSize)) * 100).toFixed(2);
            
            logger.debug('Response compressed', {
                requestId,
                path: req.path,
                originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
                compressedSize: `${(parseInt(compressedSize as string, 10) / 1024).toFixed(2)} KB`,
                compressionRatio: `${ratio}%`,
                encoding: contentEncoding,
            });
        }

        return originalEnd.apply(res, [chunk, ...args] as any);
    };

    next();
};

/**
 * Get compression configuration (for monitoring and health checks)
 */
export const getCompressionConfig = (): {
    enabled: boolean;
    level: number;
    threshold: number;
    strategy: string;
} => {
    return {
        enabled: process.env.ENABLE_COMPRESSION !== 'false',
        level: parseInt(process.env.COMPRESSION_LEVEL || '6', 10),
        threshold: 1024, // 1KB
        strategy: 'default',
    };
};

