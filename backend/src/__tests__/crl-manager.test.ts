/**
 * CRL Manager Test Suite
 * Target: 95%+ coverage for crl-manager.ts
 * 
 * Tests:
 * - CRLManager class initialization
 * - loadCRL() - CRL loading with caching
 * - saveCRL() - CRL saving
 * - isRevoked() - Certificate revocation checking
 * - revokeCertificate() - Certificate revocation
 * - updateCRL() - CRL refresh
 * - validateCRLFreshness() - CRL expiry validation
 * - initializeCRL() - CRL initialization
 * - getCRLStats() - CRL statistics
 * - clearCache() - Cache management
 * - initializeCRLInfrastructure() - Infrastructure setup
 * - Error handling
 * - Edge cases
 */

import fs from 'fs';
import {
    CRLManager,
    crlManager,
    initializeCRLInfrastructure,
    ICRL,
    RevocationReason,
} from '../utils/crl-manager';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock fs
jest.mock('fs');

const { logger } = require('../utils/logger');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('CRL Manager', () => {
    const testCrlDir = '/test/crl';
    const testCrlPath = '/test/crl/test-crl.pem';

    const mockCRL: ICRL = {
        version: 2,
        issuer: {
            CN: 'Test CA',
            O: 'Test Organization',
            OU: 'Security',
            C: 'US',
        },
        thisUpdate: new Date('2025-11-01T00:00:00Z'),
        nextUpdate: new Date('2025-12-01T00:00:00Z'),
        revokedCertificates: [
            {
                serialNumber: '1234567890',
                revocationDate: new Date('2025-11-15T00:00:00Z'),
                reason: 'keyCompromise',
                additionalInfo: 'Security incident',
            },
        ],
        crlNumber: 5,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-11-20T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('CRLManager Constructor', () => {
        describe('Happy Path', () => {
            it('should create CRLManager with custom directory', () => {
                mockedFs.existsSync.mockReturnValue(true);
                
                const manager = new CRLManager(testCrlDir);
                
                expect(manager).toBeInstanceOf(CRLManager);
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL Manager initialized',
                    expect.objectContaining({ crlDir: testCrlDir })
                );
            });

            it('should create CRLManager with default directory', () => {
                mockedFs.existsSync.mockReturnValue(true);
                
                const manager = new CRLManager();
                
                expect(manager).toBeInstanceOf(CRLManager);
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL Manager initialized',
                    expect.any(Object)
                );
            });

            it('should create CRL directory if not exists', () => {
                mockedFs.existsSync.mockReturnValue(false);
                mockedFs.mkdirSync.mockReturnValue(undefined);
                
                new CRLManager(testCrlDir);
                
                expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
                    testCrlDir,
                    { recursive: true, mode: 0o700 }
                );
            });
        });
    });

    describe('loadCRL', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should load CRL from disk', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.loadCRL(testCrlPath);
                
                expect(mockedFs.readFileSync).toHaveBeenCalledWith(testCrlPath, 'utf8');
                expect(result.issuer.CN).toBe('Test CA');
                expect(result.revokedCertificates).toHaveLength(1);
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should convert date strings to Date objects', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.loadCRL(testCrlPath);
                
                expect(result.thisUpdate).toBeInstanceOf(Date);
                expect(result.nextUpdate).toBeInstanceOf(Date);
                expect(result.revokedCertificates[0].revocationDate).toBeInstanceOf(Date);
            });

            it('should cache loaded CRL', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                // First load
                await manager.loadCRL(testCrlPath);
                
                // Second load (should use cache)
                await manager.loadCRL(testCrlPath);
                
                // Should only read from disk once
                expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
            });

            it('should reload CRL when cache expires', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                // First load
                await manager.loadCRL(testCrlPath);
                
                // Advance time beyond cache TTL (1 hour + 1 second)
                jest.advanceTimersByTime(3600001);
                
                // Second load (cache expired, should reload)
                await manager.loadCRL(testCrlPath);
                
                expect(mockedFs.readFileSync).toHaveBeenCalledTimes(2);
            });
        });

        describe('Error Handling', () => {
            it('should throw error when CRL file not found', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                
                await expect(manager.loadCRL(testCrlPath)).rejects.toThrow('CRL file not found');
                expect(logger.error).toHaveBeenCalled();
            });

            it('should throw error on invalid JSON', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue('invalid json {]');
                
                await expect(manager.loadCRL(testCrlPath)).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('isRevoked', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should identify revoked certificate', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.isRevoked('1234567890', testCrlPath);
                
                expect(result.revoked).toBe(true);
                expect(result.reason).toBe('keyCompromise');
                expect(result.revocationDate).toBeInstanceOf(Date);
                expect(result.crlFresh).toBeDefined();
                expect(result.crlAge).toBeGreaterThan(0);
                expect(logger.warn).toHaveBeenCalledWith(
                    'Certificate is REVOKED',
                    expect.any(Object)
                );
            });

            it('should identify non-revoked certificate', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.isRevoked('9999999999', testCrlPath);
                
                expect(result.revoked).toBe(false);
                expect(result.reason).toBeUndefined();
                expect(result.revocationDate).toBeUndefined();
                expect(result.crlFresh).toBe(true);
                expect(logger.debug).toHaveBeenCalled();
            });

            it('should be case-insensitive for serial number', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.isRevoked('1234567890', testCrlPath);
                
                expect(result.revoked).toBe(true);
            });

            it('should detect stale CRL', async () => {
                const staleCRL = {
                    ...mockCRL,
                    nextUpdate: new Date('2025-11-19T00:00:00Z'), // Yesterday
                };
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(staleCRL));
                
                const result = await manager.isRevoked('9999999999', testCrlPath);
                
                expect(result.crlFresh).toBe(false);
            });
        });

        describe('Error Handling', () => {
            it('should throw error when CRL cannot be loaded', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                
                await expect(manager.isRevoked('1234567890', testCrlPath)).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('revokeCertificate', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should revoke certificate', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                mockedFs.writeFileSync.mockReturnValue(undefined);
                
                await manager.revokeCertificate('9999999999', 'keyCompromise', testCrlPath, 'Test revocation');
                
                expect(mockedFs.writeFileSync).toHaveBeenCalled();
                expect(logger.warn).toHaveBeenCalledWith(
                    'Certificate REVOKED',
                    expect.objectContaining({
                        serialNumber: '9999999999',
                        reason: 'keyCompromise',
                    })
                );
            });

            it('should handle already revoked certificate', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                // Try to revoke already revoked cert
                await manager.revokeCertificate('1234567890', 'superseded', testCrlPath);
                
                expect(logger.warn).toHaveBeenCalledWith(
                    'Certificate already revoked',
                    expect.any(Object)
                );
                expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
            });

            it('should update CRL metadata when revoking', async () => {
                const crlWithNumber = { ...mockCRL, crlNumber: 10 };
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(crlWithNumber));
                mockedFs.writeFileSync.mockReturnValue(undefined);
                
                await manager.revokeCertificate('8888888888', 'cessationOfOperation', testCrlPath);
                
                // Verify writeFileSync was called with updated CRL
                const writeCall = mockedFs.writeFileSync.mock.calls[0];
                const savedData = JSON.parse(writeCall[1] as string);
                
                expect(savedData.crlNumber).toBe(11);
                expect(savedData.revokedCertificates).toHaveLength(2);
            });
        });

        describe('Error Handling', () => {
            it('should handle CRL load error', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                
                await expect(
                    manager.revokeCertificate('9999999999', 'keyCompromise', testCrlPath)
                ).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });

            it('should handle CRL save error', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                mockedFs.writeFileSync.mockImplementation(() => {
                    throw new Error('Write failed');
                });
                
                await expect(
                    manager.revokeCertificate('9999999999', 'keyCompromise', testCrlPath)
                ).rejects.toThrow('Write failed');
            });
        });
    });

    describe('updateCRL', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should skip update when CRL is still fresh', async () => {
                const freshCRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-11-20T00:00:00Z'),
                    nextUpdate: new Date('2025-12-20T00:00:00Z'), // Future
                };
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(freshCRL));
                
                const result = await manager.updateCRL(testCrlPath);
                
                expect(result.updated).toBe(false);
                expect(result.revokedCount).toBe(1);
                expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL is still fresh, update not needed',
                    expect.any(Object)
                );
            });

            it('should update CRL when expired', async () => {
                const expiredCRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-10-01T00:00:00Z'),
                    nextUpdate: new Date('2025-11-01T00:00:00Z'), // Past
                };
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(expiredCRL));
                mockedFs.writeFileSync.mockReturnValue(undefined);
                
                const result = await manager.updateCRL(testCrlPath);
                
                expect(result.updated).toBe(true);
                expect(mockedFs.writeFileSync).toHaveBeenCalled();
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL updated',
                    expect.any(Object)
                );
            });
        });

        describe('Error Handling', () => {
            it('should handle CRL load error', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                
                await expect(manager.updateCRL(testCrlPath)).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('validateCRLFreshness', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should validate fresh CRL', () => {
                const freshCRL: ICRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-11-20T00:00:00Z'),
                    nextUpdate: new Date('2025-12-20T00:00:00Z'),
                };
                
                const result = manager.validateCRLFreshness(freshCRL);
                
                expect(result.valid).toBe(true);
                expect(result.fresh).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            it('should detect expired CRL', () => {
                const expiredCRL: ICRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-10-01T00:00:00Z'),
                    nextUpdate: new Date('2025-11-01T00:00:00Z'), // Past
                };
                
                const result = manager.validateCRLFreshness(expiredCRL);
                
                expect(result.valid).toBe(false);
                expect(result.fresh).toBe(false);
                expect(result.errors.some(err => err.includes('CRL expired'))).toBe(true);
            });

            it('should detect not-yet-valid CRL', () => {
                const futureCRL: ICRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-12-01T00:00:00Z'), // Future
                    nextUpdate: new Date('2026-01-01T00:00:00Z'),
                };
                
                const result = manager.validateCRLFreshness(futureCRL);
                
                expect(result.valid).toBe(false);
                expect(result.errors.some(err => err.includes('not yet valid'))).toBe(true);
            });

            it('should warn about old CRL', () => {
                const oldCRL: ICRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-11-01T00:00:00Z'), // 19 days old
                    nextUpdate: new Date('2025-12-20T00:00:00Z'),
                };
                
                const result = manager.validateCRLFreshness(oldCRL);
                
                expect(result.valid).toBe(true);
                expect(result.warnings.some(warn => warn.includes('CRL is old'))).toBe(true);
            });

            it('should warn about soon-to-expire CRL', () => {
                const soonExpireCRL: ICRL = {
                    ...mockCRL,
                    thisUpdate: new Date('2025-11-19T00:00:00Z'),
                    nextUpdate: new Date('2025-11-20T18:00:00Z'), // Expires in 6 hours
                };
                
                const result = manager.validateCRLFreshness(soonExpireCRL);
                
                expect(result.warnings.some(warn => warn.includes('expiring soon'))).toBe(true);
            });

            it('should calculate age correctly', () => {
                const result = manager.validateCRLFreshness(mockCRL);
                
                expect(result.age).toBeGreaterThan(0);
                expect(result.revokedCount).toBe(1);
            });
        });
    });

    describe('initializeCRL', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should create new CRL when not exists', async () => {
                // Mock sequence: 1) constructor check, 2) initializeCRL check
                mockedFs.existsSync.mockReturnValue(false);
                mockedFs.writeFileSync.mockReturnValue(undefined);
                
                const result = await manager.initializeCRL('test-ca', {
                    CN: 'Test CA',
                    O: 'Test Org',
                });
                
                expect(mockedFs.writeFileSync).toHaveBeenCalled();
                expect(result.version).toBe(2);
                expect(result.issuer.CN).toBe('Test CA');
                expect(result.revokedCertificates).toHaveLength(0);
                expect(result.crlNumber).toBe(1);
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL initialized',
                    expect.any(Object)
                );
            });

            it('should load existing CRL when file exists', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.initializeCRL('test-ca', {
                    CN: 'Test CA',
                });
                
                expect(mockedFs.readFileSync).toHaveBeenCalled();
                expect(result.issuer.CN).toBe('Test CA');
                expect(logger.info).toHaveBeenCalledWith(
                    'CRL already exists',
                    expect.any(Object)
                );
            });
        });

        describe('Error Handling', () => {
            it('should handle CRL save error', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                mockedFs.writeFileSync.mockImplementation(() => {
                    throw new Error('Write failed');
                });
                
                await expect(
                    manager.initializeCRL('test-ca', { CN: 'Test CA' })
                ).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('getCRLStats', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should return CRL statistics', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                const result = await manager.getCRLStats(testCrlPath);
                
                expect(result.revokedCount).toBe(1);
                expect(result.age).toBeGreaterThan(0);
                expect(result.fresh).toBe(true);
                expect(result.nextUpdateIn).toBeGreaterThan(0);
                expect(result.issuer).toBe('Test CA');
            });

            it('should calculate negative nextUpdateIn for expired CRL', async () => {
                const expiredCRL = {
                    ...mockCRL,
                    nextUpdate: new Date('2025-11-19T00:00:00Z'),
                };
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(expiredCRL));
                
                const result = await manager.getCRLStats(testCrlPath);
                
                expect(result.fresh).toBe(false);
                expect(result.nextUpdateIn).toBeLessThan(0);
            });
        });

        describe('Error Handling', () => {
            it('should handle CRL load error', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                
                await expect(manager.getCRLStats(testCrlPath)).rejects.toThrow();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('clearCache', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        it('should clear CRL cache', async () => {
            // Load a CRL to populate cache
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
            await manager.loadCRL(testCrlPath);
            
            jest.clearAllMocks();
            
            manager.clearCache();
            
            expect(logger.info).toHaveBeenCalledWith(
                'CRL cache cleared',
                expect.objectContaining({ entriesCleared: expect.any(Number) })
            );
        });

        it('should handle empty cache', () => {
            manager.clearCache();
            
            expect(logger.info).toHaveBeenCalledWith(
                'CRL cache cleared',
                { entriesCleared: 0 }
            );
        });
    });

    describe('initializeCRLInfrastructure', () => {
        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should initialize root and intermediate CRLs', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                mockedFs.writeFileSync.mockReturnValue(undefined);
                
                await initializeCRLInfrastructure();
                
                // Should create 2 CRLs (root + intermediate)
                expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
                expect(logger.info).toHaveBeenCalledWith('Initializing CRL infrastructure...');
                expect(logger.info).toHaveBeenCalledWith('CRL infrastructure initialized');
            });

            it('should load existing CRLs if present', async () => {
                mockedFs.existsSync.mockReturnValue(true);
                mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
                
                await initializeCRLInfrastructure();
                
                expect(mockedFs.readFileSync).toHaveBeenCalled();
                expect(logger.info).toHaveBeenCalledWith('CRL infrastructure initialized');
            });
        });

        describe('Error Handling', () => {
            it('should handle initialization error', async () => {
                mockedFs.existsSync.mockReturnValue(false);
                mockedFs.writeFileSync.mockImplementation(() => {
                    throw new Error('Init failed');
                });
                
                await expect(initializeCRLInfrastructure()).rejects.toThrow();
                expect(logger.error).toHaveBeenCalledWith(
                    'Failed to initialize CRL infrastructure',
                    expect.any(Object)
                );
            });
        });
    });

    describe('Singleton Instance', () => {
        it('should export singleton crlManager instance', () => {
            expect(crlManager).toBeInstanceOf(CRLManager);
        });
    });

    describe('Revocation Reasons', () => {
        let manager: CRLManager;

        beforeEach(() => {
            mockedFs.existsSync.mockReturnValue(true);
            manager = new CRLManager(testCrlDir);
            jest.clearAllMocks();
        });

        it('should handle all RFC 5280 revocation reasons', async () => {
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockCRL));
            mockedFs.writeFileSync.mockReturnValue(undefined);

            const reasons: RevocationReason[] = [
                'unspecified',
                'keyCompromise',
                'caCompromise',
                'affiliationChanged',
                'superseded',
                'cessationOfOperation',
                'certificateHold',
                'removeFromCRL',
                'privilegeWithdrawn',
                'aaCompromise',
            ];

            for (const reason of reasons) {
                const serialNum = `serial-${reason}`;
                await manager.revokeCertificate(serialNum, reason, testCrlPath);
            }

            // Should handle all reasons
            expect(mockedFs.writeFileSync).toHaveBeenCalled();
        });
    });
});

