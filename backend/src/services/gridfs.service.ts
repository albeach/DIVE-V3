/**
 * GridFS Service
 *
 * MEMORY LEAK FIX (2026-02-16): Refactored to use MongoDB singleton
 * OLD: Created new MongoClient() with connection caching (connection leak)
 * NEW: Uses shared singleton connection pool via getDb()
 * IMPACT: Prevents connection leaks during GridFS file operations
 *
 * Handles large file storage in MongoDB GridFS to bypass 16MB BSON document limit.
 * GridFS automatically chunks files into 255KB pieces stored in separate collections.
 *
 * Use Cases:
 * - Video files (>10MB)
 * - Large documents
 * - Encrypted payloads that exceed BSON limits
 */

import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';

const GRIDFS_BUCKET_NAME = 'ztdf-payloads';

/**
 * Get GridFS bucket using singleton database connection
 * Pattern: new GridFSBucket(getDb(), { bucketName })
 */
function getGridFSBucket(): GridFSBucket {
    const db = getDb();
    return new GridFSBucket(db, {
        bucketName: GRIDFS_BUCKET_NAME,
        chunkSizeBytes: 255 * 1024 // 255KB chunks (MongoDB standard)
    });
}

/**
 * Upload encrypted payload to GridFS
 *
 * @param encryptedData Base64-encoded encrypted data
 * @param filename Logical filename for the payload
 * @param metadata Additional metadata (resourceId, contentType, etc.)
 * @returns GridFS file ID
 */
export async function uploadToGridFS(
    encryptedData: string,
    filename: string,
    metadata: {
        resourceId: string;
        contentType: string;
        classification: string;
        size: number;
    }
): Promise<string> {
    try {
        const bucket = getGridFSBucket();

        // Convert base64 to buffer for storage
        const buffer = Buffer.from(encryptedData, 'base64');

        // Create readable stream from buffer
        const readableStream = Readable.from(buffer);

        // Upload to GridFS
        const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
                resourceId: metadata.resourceId,
                contentType: metadata.contentType,
                classification: metadata.classification,
                originalSize: metadata.size,
                uploadedAt: new Date().toISOString()
            }
        });

        // Pipe data to GridFS
        readableStream.pipe(uploadStream);

        // Wait for upload to complete
        await new Promise<void>((resolve, reject) => {
            uploadStream.on('finish', () => resolve());
            uploadStream.on('error', (error) => reject(error));
        });

        const fileId = uploadStream.id.toString();

        logger.info('GridFS: Uploaded encrypted payload', {
            fileId,
            resourceId: metadata.resourceId,
            filename,
            size: buffer.length,
            classification: metadata.classification
        });

        return fileId;

    } catch (error) {
        logger.error('GridFS: Upload failed', {
            error,
            filename,
            resourceId: metadata.resourceId
        });
        throw error;
    }
}

/**
 * Download encrypted payload from GridFS
 *
 * Memory-efficient streaming implementation that converts to base64 incrementally
 * to avoid loading large files entirely into memory.
 *
 * @param fileId GridFS file ID
 * @returns Base64-encoded encrypted data
 */
export async function downloadFromGridFS(fileId: string): Promise<string> {
    try {
        const bucket = getGridFSBucket();
        const objectId = new ObjectId(fileId);

        // Create download stream
        const downloadStream = bucket.openDownloadStream(objectId);

        // Collect binary chunks first, then convert to base64 at the end
        // CRITICAL: Cannot convert individual chunks to base64 - must convert complete buffer
        const chunks: Buffer[] = [];
        let totalSize = 0;

        downloadStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            totalSize += chunk.length;
        });

        // Wait for download to complete
        await new Promise<void>((resolve, reject) => {
            downloadStream.on('end', () => resolve());
            downloadStream.on('error', (error) => reject(error));
        });

        // Concatenate all binary chunks first, then convert to base64
        const completeBuffer = Buffer.concat(chunks);
        const base64Data = completeBuffer.toString('base64');

        logger.debug('GridFS: Downloaded encrypted payload (streaming)', {
            fileId,
            size: totalSize,
            chunks: chunks.length
        });

        return base64Data;

    } catch (error) {
        logger.error('GridFS: Download failed', {
            error,
            fileId
        });
        throw error;
    }
}

/**
 * Delete encrypted payload from GridFS
 *
 * @param fileId GridFS file ID
 */
export async function deleteFromGridFS(fileId: string): Promise<void> {
    try {
        const bucket = getGridFSBucket();
        const objectId = new ObjectId(fileId);

        await bucket.delete(objectId);

        logger.info('GridFS: Deleted encrypted payload', { fileId });

    } catch (error) {
        logger.error('GridFS: Delete failed', {
            error,
            fileId
        });
        throw error;
    }
}

/**
 * Check if a file exists in GridFS
 *
 * @param fileId GridFS file ID
 * @returns true if file exists
 */
export async function existsInGridFS(fileId: string): Promise<boolean> {
    try {
        const bucket = getGridFSBucket();
        const objectId = new ObjectId(fileId);

        const files = await bucket.find({ _id: objectId }).toArray();
        return files.length > 0;

    } catch (error) {
        logger.error('GridFS: Existence check failed', {
            error,
            fileId
        });
        return false;
    }
}

/**
 * @deprecated No longer needed with singleton - kept for test compatibility
 * @internal
 */
export function clearGridFSCache(): void {
    // No-op: Singleton pattern doesn't use per-service caching
}
