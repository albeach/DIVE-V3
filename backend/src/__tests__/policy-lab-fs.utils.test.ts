/**
 * Policy Lab Filesystem Utils Test Suite
 * Target: 100% coverage for policy-lab-fs.utils.ts
 * 
 * Tests:
 * - Path generation functions (getUserPoliciesDir, getPolicyDir, getPolicySourcePath)
 * - Directory operations (ensureUploadsDir, createUserPoliciesDir, createPolicyDir)
 * - File operations (savePolicySource, readPolicySource, deletePolicyDir)
 * - File checks (policySourceExists, getPolicyFileMetadata)
 * - Listing (listUserPolicyIds)
 * - Utilities (calculateFileHash, cleanupOrphanedPolicies)
 * - Path sanitization and security
 * - Error handling
 */

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock fs/promises
jest.mock('fs/promises');

import * as fs from 'fs/promises';
import {
    getUserPoliciesDir,
    getPolicyDir,
    getPolicySourcePath,
    ensureUploadsDir,
    createUserPoliciesDir,
    createPolicyDir,
    savePolicySource,
    readPolicySource,
    deletePolicyDir,
    policySourceExists,
    getPolicyFileMetadata,
    listUserPolicyIds,
    calculateFileHash,
    cleanupOrphanedPolicies,
    MAX_POLICY_SIZE_BYTES,
} from '../utils/policy-lab-fs.utils';

const { logger } = require('../utils/logger');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Policy Lab Filesystem Utils', () => {
    const testUserId = 'test-user-123';
    const testPolicyId = 'test-policy-456';
    const testContent = 'package test\n\ndefault allow := false';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Path Generation', () => {
        describe('getUserPoliciesDir', () => {
            it('should generate user policies directory path', () => {
                const result = getUserPoliciesDir(testUserId);
                
                expect(result).toContain('policies');
                expect(result).toContain('uploads');
                expect(result).toContain('test-user-123');
            });

            it('should sanitize directory traversal attempts', () => {
                const result = getUserPoliciesDir('../../../etc/passwd');
                
                expect(result).not.toContain('..');
                expect(result).toContain('-etc-passwd'); // Slashes replaced with dashes
            });

            it('should sanitize slashes', () => {
                const result = getUserPoliciesDir('user/with/slashes');
                
                expect(result).not.toContain('/with/slashes');
                expect(result).toContain('user-with-slashes');
            });

            it('should sanitize backslashes', () => {
                const result = getUserPoliciesDir('user\\with\\backslashes');
                
                expect(result).not.toContain('\\');
                expect(result).toContain('user-with-backslashes');
            });
        });

        describe('getPolicyDir', () => {
            it('should generate policy directory path', () => {
                const result = getPolicyDir(testUserId, testPolicyId);
                
                expect(result).toContain('test-user-123');
                expect(result).toContain('test-policy-456');
            });

            it('should sanitize both userId and policyId', () => {
                const result = getPolicyDir('../admin', '../config');
                
                expect(result).not.toContain('..');
                expect(result).toContain('-admin');
                expect(result).toContain('-config');
            });
        });

        describe('getPolicySourcePath', () => {
            it('should generate rego file path', () => {
                const result = getPolicySourcePath(testUserId, testPolicyId, 'rego');
                
                expect(result).toContain('test-policy-456');
                expect(result).toContain('source.rego');
            });

            it('should generate xacml file path', () => {
                const result = getPolicySourcePath(testUserId, testPolicyId, 'xacml');
                
                expect(result).toContain('test-policy-456');
                expect(result).toContain('source.xml');
            });
        });
    });

    describe('Directory Operations', () => {
        describe('ensureUploadsDir', () => {
            it('should create uploads directory', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                
                await ensureUploadsDir();
                
                expect(mockedFs.mkdir).toHaveBeenCalledWith(
                    expect.stringContaining('uploads'),
                    { recursive: true }
                );
                expect(logger.debug).toHaveBeenCalledWith(
                    'Uploads directory ensured',
                    expect.any(Object)
                );
            });

            it('should handle directory creation error', async () => {
                mockedFs.mkdir.mockRejectedValue(new Error('Permission denied'));
                
                await expect(ensureUploadsDir()).rejects.toThrow('Failed to initialize uploads directory');
                expect(logger.error).toHaveBeenCalled();
            });
        });

        describe('createUserPoliciesDir', () => {
            it('should create user policies directory', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                
                await createUserPoliciesDir(testUserId);
                
                expect(mockedFs.mkdir).toHaveBeenCalledWith(
                    expect.stringContaining('test-user-123'),
                    { recursive: true }
                );
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should handle creation error', async () => {
                mockedFs.mkdir.mockRejectedValue(new Error('Failed'));
                
                await expect(createUserPoliciesDir(testUserId)).rejects.toThrow('Failed to create user policy directory');
                expect(logger.error).toHaveBeenCalled();
            });
        });

        describe('createPolicyDir', () => {
            it('should create policy directory', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                
                await createPolicyDir(testUserId, testPolicyId);
                
                expect(mockedFs.mkdir).toHaveBeenCalledWith(
                    expect.stringContaining('test-policy-456'),
                    { recursive: true }
                );
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should handle creation error', async () => {
                mockedFs.mkdir.mockRejectedValue(new Error('Failed'));
                
                await expect(createPolicyDir(testUserId, testPolicyId)).rejects.toThrow('Failed to create policy directory');
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('File Operations', () => {
        describe('savePolicySource', () => {
            it('should save policy file and return metadata', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                mockedFs.writeFile.mockResolvedValue(undefined);
                
                const result = await savePolicySource(testUserId, testPolicyId, 'rego', testContent);
                
                expect(mockedFs.mkdir).toHaveBeenCalled();
                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    expect.stringContaining('source.rego'),
                    testContent,
                    'utf8'
                );
                expect(result.path).toContain('source.rego');
                expect(result.sizeBytes).toBe(Buffer.byteLength(testContent, 'utf8'));
                expect(result.hash).toBeTruthy();
                expect(result.hash).toHaveLength(64); // SHA-256 hex length
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should reject file exceeding max size', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                const largeContent = 'x'.repeat(MAX_POLICY_SIZE_BYTES + 1);
                
                await expect(savePolicySource(testUserId, testPolicyId, 'rego', largeContent))
                    .rejects.toThrow(`Policy exceeds maximum size of ${MAX_POLICY_SIZE_BYTES} bytes`);
            });

            it('should save xacml file', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                mockedFs.writeFile.mockResolvedValue(undefined);
                const xacmlContent = '<Policy></Policy>';
                
                const result = await savePolicySource(testUserId, testPolicyId, 'xacml', xacmlContent);
                
                expect(result.path).toContain('source.xml');
                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    expect.stringContaining('source.xml'),
                    xacmlContent,
                    'utf8'
                );
            });

            it('should handle write error', async () => {
                mockedFs.mkdir.mockResolvedValue(undefined);
                mockedFs.writeFile.mockRejectedValue(new Error('Write failed'));
                
                await expect(savePolicySource(testUserId, testPolicyId, 'rego', testContent))
                    .rejects.toThrow('Write failed');
                expect(logger.error).toHaveBeenCalled();
            });
        });

        describe('readPolicySource', () => {
            it('should read policy file', async () => {
                mockedFs.readFile.mockResolvedValue(testContent);
                
                const result = await readPolicySource(testUserId, testPolicyId, 'rego');
                
                expect(result).toBe(testContent);
                expect(mockedFs.readFile).toHaveBeenCalledWith(
                    expect.stringContaining('source.rego'),
                    'utf8'
                );
            });

            it('should handle read error', async () => {
                mockedFs.readFile.mockRejectedValue(new Error('File not found'));
                
                await expect(readPolicySource(testUserId, testPolicyId, 'rego'))
                    .rejects.toThrow('Failed to read policy file');
                expect(logger.error).toHaveBeenCalled();
            });
        });

        describe('deletePolicyDir', () => {
            it('should delete policy directory', async () => {
                mockedFs.rm.mockResolvedValue(undefined);
                
                await deletePolicyDir(testUserId, testPolicyId);
                
                expect(mockedFs.rm).toHaveBeenCalledWith(
                    expect.stringContaining('test-policy-456'),
                    { recursive: true, force: true }
                );
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should handle deletion error', async () => {
                mockedFs.rm.mockRejectedValue(new Error('Delete failed'));
                
                await expect(deletePolicyDir(testUserId, testPolicyId))
                    .rejects.toThrow('Failed to delete policy files');
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('File Checks', () => {
        describe('policySourceExists', () => {
            it('should return true when file exists', async () => {
                mockedFs.access.mockResolvedValue(undefined);
                
                const result = await policySourceExists(testUserId, testPolicyId, 'rego');
                
                expect(result).toBe(true);
                expect(mockedFs.access).toHaveBeenCalledWith(expect.stringContaining('source.rego'));
            });

            it('should return false when file does not exist', async () => {
                mockedFs.access.mockRejectedValue(new Error('ENOENT'));
                
                const result = await policySourceExists(testUserId, testPolicyId, 'rego');
                
                expect(result).toBe(false);
            });
        });

        describe('getPolicyFileMetadata', () => {
            it('should return file metadata', async () => {
                const mockStats = {
                    size: 1024,
                    birthtime: new Date('2025-01-01'),
                    mtime: new Date('2025-01-02'),
                };
                mockedFs.stat.mockResolvedValue(mockStats as any);
                
                const result = await getPolicyFileMetadata(testUserId, testPolicyId, 'rego');
                
                expect(result.sizeBytes).toBe(1024);
                expect(result.createdAt).toEqual(new Date('2025-01-01'));
                expect(result.modifiedAt).toEqual(new Date('2025-01-02'));
            });

            it('should handle stat error', async () => {
                mockedFs.stat.mockRejectedValue(new Error('Stat failed'));
                
                await expect(getPolicyFileMetadata(testUserId, testPolicyId, 'rego'))
                    .rejects.toThrow('Failed to retrieve file metadata');
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('Listing Operations', () => {
        describe('listUserPolicyIds', () => {
            it('should list policy IDs', async () => {
                const mockEntries = [
                    { name: 'policy-1', isDirectory: () => true },
                    { name: 'policy-2', isDirectory: () => true },
                    { name: 'file.txt', isDirectory: () => false }, // Should be filtered out
                ];
                mockedFs.readdir.mockResolvedValue(mockEntries as any);
                
                const result = await listUserPolicyIds(testUserId);
                
                expect(result).toEqual(['policy-1', 'policy-2']);
                expect(result).not.toContain('file.txt');
            });

            it('should return empty array when user directory does not exist', async () => {
                const error: any = new Error('ENOENT');
                error.code = 'ENOENT';
                mockedFs.readdir.mockRejectedValue(error);
                
                const result = await listUserPolicyIds(testUserId);
                
                expect(result).toEqual([]);
            });

            it('should throw error for other readdir errors', async () => {
                mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));
                
                await expect(listUserPolicyIds(testUserId))
                    .rejects.toThrow('Failed to list policy files');
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('Utility Functions', () => {
        describe('calculateFileHash', () => {
            it('should calculate file hash from stream', async () => {
                // This test requires mocking fs.createReadStream which is complex
                // We'll test the basic flow
                const mockStream = require('events').EventEmitter;
                const stream = new mockStream();
                
                const createReadStreamSpy = jest.spyOn(require('fs'), 'createReadStream')
                    .mockReturnValue(stream);
                
                const hashPromise = calculateFileHash('/test/path');
                
                // Simulate stream events
                setImmediate(() => {
                    stream.emit('data', Buffer.from('test'));
                    stream.emit('end');
                });
                
                const result = await hashPromise;
                
                expect(result).toBeTruthy();
                expect(result).toHaveLength(64); // SHA-256 hex
                
                createReadStreamSpy.mockRestore();
            });

            it('should handle stream error', async () => {
                const mockStream = require('events').EventEmitter;
                const stream = new mockStream();
                
                const createReadStreamSpy = jest.spyOn(require('fs'), 'createReadStream')
                    .mockReturnValue(stream);
                
                const hashPromise = calculateFileHash('/test/path');
                
                // Simulate error
                setImmediate(() => {
                    stream.emit('error', new Error('Read error'));
                });
                
                await expect(hashPromise).rejects.toThrow('Read error');
                
                createReadStreamSpy.mockRestore();
            });
        });

        describe('cleanupOrphanedPolicies', () => {
            it('should cleanup orphaned policies', async () => {
                const mockEntries = [
                    { name: 'policy-1', isDirectory: () => true },
                    { name: 'policy-2', isDirectory: () => true },
                    { name: 'policy-3', isDirectory: () => true },
                ];
                mockedFs.readdir.mockResolvedValue(mockEntries as any);
                mockedFs.rm.mockResolvedValue(undefined);
                
                const validIds = new Set(['policy-1']); // Only policy-1 is valid
                const result = await cleanupOrphanedPolicies(validIds, testUserId);
                
                expect(result).toBe(2); // policy-2 and policy-3 cleaned
                expect(mockedFs.rm).toHaveBeenCalledTimes(2);
                expect(logger.info).toHaveBeenCalledWith(
                    'Orphaned policies cleaned up',
                    expect.objectContaining({ cleanedCount: 2 })
                );
            });

            it('should handle cleanup errors gracefully', async () => {
                mockedFs.readdir.mockRejectedValue(new Error('Read failed'));
                
                const validIds = new Set(['policy-1']);
                const result = await cleanupOrphanedPolicies(validIds, testUserId);
                
                expect(result).toBe(0);
                expect(logger.error).toHaveBeenCalled();
            });

            it('should not delete valid policies', async () => {
                const mockEntries = [
                    { name: 'policy-1', isDirectory: () => true },
                    { name: 'policy-2', isDirectory: () => true },
                ];
                mockedFs.readdir.mockResolvedValue(mockEntries as any);
                mockedFs.rm.mockResolvedValue(undefined);
                
                const validIds = new Set(['policy-1', 'policy-2']); // Both are valid
                const result = await cleanupOrphanedPolicies(validIds, testUserId);
                
                expect(result).toBe(0);
                expect(mockedFs.rm).not.toHaveBeenCalled();
            });
        });
    });

    describe('Security', () => {
        it('should prevent directory traversal in user ID', () => {
            const maliciousId = '../../../../../../etc/passwd';
            const result = getUserPoliciesDir(maliciousId);
            
            expect(result).not.toContain('../../../');
            expect(result).toContain('uploads');
        });

        it('should prevent directory traversal in policy ID', () => {
            const maliciousId = '../../../secret';
            const result = getPolicyDir('user', maliciousId);
            
            expect(result).not.toContain('../../');
        });

        it('should sanitize path separators', () => {
            const result = getUserPoliciesDir('user/with/path');
            
            expect(result).not.toContain('user/with/path');
            expect(result).toContain('user-with-path');
        });
    });

    describe('MAX_POLICY_SIZE_BYTES', () => {
        it('should export max policy size constant', () => {
            expect(MAX_POLICY_SIZE_BYTES).toBe(256 * 1024);
        });
    });
});

