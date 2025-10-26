/**
 * Policy Lab Filesystem Utilities
 * 
 * Handles filesystem operations for uploaded policy files:
 * - Directory structure: ./policies/uploads/{userId}/{policyId}/source.(rego|xml)
 * - File creation, reading, deletion
 * - Path validation and sanitization
 * 
 * Date: October 26, 2025
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';
import { PolicyType } from '../types/policies-lab.types';

// Base directory for policy uploads
const UPLOADS_BASE_DIR = path.join(process.cwd(), 'policies', 'uploads');

// Max file size: 256KB
export const MAX_POLICY_SIZE_BYTES = 256 * 1024;

/**
 * Sanitize user input to prevent directory traversal attacks
 */
function sanitizePath(input: string): string {
    // Remove any path traversal attempts
    return input.replace(/\.\./g, '').replace(/[/\\]/g, '-');
}

/**
 * Get the directory path for a user's policies
 */
export function getUserPoliciesDir(userId: string): string {
    const sanitizedUserId = sanitizePath(userId);
    return path.join(UPLOADS_BASE_DIR, sanitizedUserId);
}

/**
 * Get the directory path for a specific policy
 */
export function getPolicyDir(userId: string, policyId: string): string {
    const sanitizedPolicyId = sanitizePath(policyId);
    return path.join(getUserPoliciesDir(userId), sanitizedPolicyId);
}

/**
 * Get the file path for a policy source file
 */
export function getPolicySourcePath(userId: string, policyId: string, type: PolicyType): string {
    const extension = type === 'rego' ? 'rego' : 'xml';
    return path.join(getPolicyDir(userId, policyId), `source.${extension}`);
}

/**
 * Ensure the base uploads directory exists
 */
export async function ensureUploadsDir(): Promise<void> {
    try {
        await fs.mkdir(UPLOADS_BASE_DIR, { recursive: true });
        logger.debug('Uploads directory ensured', { path: UPLOADS_BASE_DIR });
    } catch (error) {
        logger.error('Failed to create uploads directory', { path: UPLOADS_BASE_DIR, error });
        throw new Error('Failed to initialize uploads directory');
    }
}

/**
 * Create a directory for a user's policies
 */
export async function createUserPoliciesDir(userId: string): Promise<void> {
    const dir = getUserPoliciesDir(userId);
    try {
        await fs.mkdir(dir, { recursive: true });
        logger.debug('User policies directory created', { userId, path: dir });
    } catch (error) {
        logger.error('Failed to create user policies directory', { userId, error });
        throw new Error('Failed to create user policy directory');
    }
}

/**
 * Create a directory for a specific policy
 */
export async function createPolicyDir(userId: string, policyId: string): Promise<void> {
    const dir = getPolicyDir(userId, policyId);
    try {
        await fs.mkdir(dir, { recursive: true });
        logger.debug('Policy directory created', { userId, policyId, path: dir });
    } catch (error) {
        logger.error('Failed to create policy directory', { userId, policyId, error });
        throw new Error('Failed to create policy directory');
    }
}

/**
 * Save policy source file
 */
export async function savePolicySource(
    userId: string,
    policyId: string,
    type: PolicyType,
    content: string
): Promise<{ path: string; sizeBytes: number; hash: string }> {
    try {
        // Create policy directory
        await createPolicyDir(userId, policyId);

        // Get file path
        const filePath = getPolicySourcePath(userId, policyId, type);

        // Validate size
        const sizeBytes = Buffer.byteLength(content, 'utf8');
        if (sizeBytes > MAX_POLICY_SIZE_BYTES) {
            throw new Error(`Policy exceeds maximum size of ${MAX_POLICY_SIZE_BYTES} bytes`);
        }

        // Write file
        await fs.writeFile(filePath, content, 'utf8');

        // Calculate hash (SHA-256)
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        logger.debug('Policy source saved', { userId, policyId, type, sizeBytes, hash });

        return { path: filePath, sizeBytes, hash };
    } catch (error) {
        logger.error('Failed to save policy source', { userId, policyId, type, error });
        throw error;
    }
}

/**
 * Read policy source file
 */
export async function readPolicySource(userId: string, policyId: string, type: PolicyType): Promise<string> {
    const filePath = getPolicySourcePath(userId, policyId, type);
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        logger.error('Failed to read policy source', { userId, policyId, type, filePath, error });
        throw new Error('Failed to read policy file');
    }
}

/**
 * Delete policy directory and all contents
 */
export async function deletePolicyDir(userId: string, policyId: string): Promise<void> {
    const dir = getPolicyDir(userId, policyId);
    try {
        await fs.rm(dir, { recursive: true, force: true });
        logger.debug('Policy directory deleted', { userId, policyId, path: dir });
    } catch (error) {
        logger.error('Failed to delete policy directory', { userId, policyId, error });
        throw new Error('Failed to delete policy files');
    }
}

/**
 * Check if a policy source file exists
 */
export async function policySourceExists(userId: string, policyId: string, type: PolicyType): Promise<boolean> {
    const filePath = getPolicySourcePath(userId, policyId, type);
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get policy file metadata (size, timestamps)
 */
export async function getPolicyFileMetadata(userId: string, policyId: string, type: PolicyType): Promise<{
    sizeBytes: number;
    createdAt: Date;
    modifiedAt: Date;
}> {
    const filePath = getPolicySourcePath(userId, policyId, type);
    try {
        const stats = await fs.stat(filePath);
        return {
            sizeBytes: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    } catch (error) {
        logger.error('Failed to get policy file metadata', { userId, policyId, type, error });
        throw new Error('Failed to retrieve file metadata');
    }
}

/**
 * List all policy IDs for a user (from filesystem)
 */
export async function listUserPolicyIds(userId: string): Promise<string[]> {
    const userDir = getUserPoliciesDir(userId);
    try {
        const entries = await fs.readdir(userDir, { withFileTypes: true });
        const policyIds = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
        return policyIds;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // User directory doesn't exist yet
            return [];
        }
        logger.error('Failed to list user policies', { userId, error });
        throw new Error('Failed to list policy files');
    }
}

/**
 * Calculate file hash without reading entire file into memory (for large files)
 */
export async function calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = require('fs').createReadStream(filePath);

        stream.on('data', (chunk: Buffer) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Clean up old or orphaned policy directories (maintenance utility)
 */
export async function cleanupOrphanedPolicies(validPolicyIds: Set<string>, userId: string): Promise<number> {
    // const userDir = getUserPoliciesDir(userId);  // Not currently used
    let cleanedCount = 0;

    try {
        const policyIds = await listUserPolicyIds(userId);

        for (const policyId of policyIds) {
            if (!validPolicyIds.has(policyId)) {
                await deletePolicyDir(userId, policyId);
                cleanedCount++;
            }
        }

        logger.info('Orphaned policies cleaned up', { userId, cleanedCount });
        return cleanedCount;
    } catch (error) {
        logger.error('Failed to cleanup orphaned policies', { userId, error });
        return 0;
    }
}

