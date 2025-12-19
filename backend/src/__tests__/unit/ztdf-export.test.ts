/**
 * ZTDF Export Service Unit Tests
 * 
 * Tests the conversion from DIVE V3 custom ZTDF format to OpenTDF spec 4.3.0
 * Validates ZIP structure, manifest format, and spec compliance
 */

import JSZip from 'jszip';
import { convertToOpenTDFFormat, validateExportedZTDF } from '../../services/ztdf-export.service';
import { IZTDFObject, ClassificationLevel } from '../../types/ztdf.types';
import { IOpenTDFManifest } from '../../types/opentdf.types';

describe('ZTDF Export Service', () => {
    
    // ============================================
    // Mock Data
    // ============================================
    
    const mockZTDFObject: IZTDFObject = {
        manifest: {
            version: '1.0',
            objectId: 'test-doc-123',
            objectType: 'uploaded-document',
            contentType: 'application/pdf',
            owner: 'john.doe@mil',
            ownerOrganization: 'DIVE-V3',
            createdAt: '2025-11-17T10:00:00.000Z',
            payloadSize: 1024
        },
        policy: {
            policyVersion: '1.0',
            securityLabel: {
                classification: 'SECRET' as ClassificationLevel,
                originalClassification: 'SECRET',
                originalCountry: 'USA',
                natoEquivalent: 'NATO_SECRET',
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['FVEY'],
                coiOperator: 'ALL',
                caveats: ['NOFORN'],
                originatingCountry: 'USA',
                creationDate: '2025-11-17T10:00:00.000Z',
                displayMarking: 'SECRET//NOFORN//FVEY//REL USA, GBR, CAN'
            },
            policyAssertions: []
        },
        payload: {
            encryptionAlgorithm: 'AES-256-GCM',
            iv: 'abc123def456',
            authTag: 'xyz789',
            keyAccessObjects: [
                {
                    kaoId: 'kao-1',
                    kasUrl: 'https://kas.dive25.com',
                    kasId: 'kas-dive-v3',
                    wrappedKey: 'base64-wrapped-key-data-here',
                    wrappingAlgorithm: 'RSA-OAEP-256',
                    policyBinding: {
                        clearanceRequired: 'SECRET' as ClassificationLevel,
                        countriesAllowed: ['USA', 'GBR', 'CAN'],
                        coiRequired: ['FVEY']
                    },
                    createdAt: '2025-11-17T10:00:00.000Z'
                }
            ],
            encryptedChunks: [
                {
                    chunkId: 0,
                    encryptedData: Buffer.from('encrypted-payload-data').toString('base64'),
                    size: Buffer.from('encrypted-payload-data').length,
                    integrityHash: 'base64-chunk-hash-here'
                }
            ],
            payloadHash: 'base64-payload-hash-here'
        }
    };

    // ============================================
    // Export Function Tests
    // ============================================

    describe('convertToOpenTDFFormat', () => {
        
        it('should successfully convert DIVE V3 ZTDF to OpenTDF ZIP', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);

            expect(result.success).toBe(true);
            expect(result.zipBuffer).toBeInstanceOf(Buffer);
            expect(result.fileSize).toBeGreaterThan(0);
            expect(result.zipHash).toBeTruthy();
            expect(result.filename).toBe('test-doc-123.ztdf');
            expect(result.metadata.tdfSpecVersion).toBe('4.3.0');
        });

        it('should create a valid ZIP archive', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            
            // Verify ZIP magic bytes (PK)
            expect(result.zipBuffer[0]).toBe(0x50); // 'P'
            expect(result.zipBuffer[1]).toBe(0x4B); // 'K'
            
            // Should be loadable by JSZip
            const zip = await JSZip.loadAsync(result.zipBuffer);
            expect(zip).toBeDefined();
        });

        it('should include 0.manifest.json in ZIP', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            expect(zip.files['0.manifest.json']).toBeDefined();
        });

        it('should include 0.payload in ZIP', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            expect(zip.files['0.payload']).toBeDefined();
        });

        it('should create manifest with tdf_spec_version 4.3.0', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.tdf_spec_version).toBe('4.3.0');
        });

        it('should set payload.type to "reference"', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.payload.type).toBe('reference');
        });

        it('should set payload.url to "0.payload"', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.payload.url).toBe('0.payload');
        });

        it('should set payload.protocol to "zip"', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.payload.protocol).toBe('zip');
        });

        it('should set payload.isEncrypted to true', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.payload.isEncrypted).toBe(true);
        });

        it('should include encryptionInformation', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.encryptionInformation).toBeDefined();
            expect(manifest.encryptionInformation.type).toBe('split');
            expect(manifest.encryptionInformation.method).toBeDefined();
            expect(manifest.encryptionInformation.keyAccess).toBeDefined();
            expect(manifest.encryptionInformation.policy).toBeDefined();
            expect(manifest.encryptionInformation.integrityInformation).toBeDefined();
        });

        it('should map keyAccessObjects to OpenTDF format', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            const kao = manifest.encryptionInformation.keyAccess[0];
            expect(kao.type).toBe('wrapped');
            expect(kao.protocol).toBe('kas');
            expect(kao.url).toBe('https://kas.dive25.com');
            expect(kao.kid).toBe('r1');
            expect(kao.sid).toBe('1');
            expect(kao.wrappedKey).toBe('base64-wrapped-key-data-here');
            expect(kao.policyBinding).toBeDefined();
            expect(kao.tdf_spec_version).toBe('1.0');
        });

        it('should base64-encode policy', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.encryptionInformation.policy).toBeTruthy();
            
            // Verify it's base64-encoded JSON
            const policyJson = Buffer.from(manifest.encryptionInformation.policy, 'base64').toString('utf-8');
            const policy = JSON.parse(policyJson);
            
            expect(policy.uuid).toBeDefined();
            expect(policy.body).toBeDefined();
        });

        it('should include integrityInformation with segments', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            const integrity = manifest.encryptionInformation.integrityInformation;
            expect(integrity.rootSignature).toBeDefined();
            expect(integrity.rootSignature.alg).toBe('HS256');
            expect(integrity.segmentHashAlg).toBe('GMAC');
            expect(integrity.segments).toBeInstanceOf(Array);
            expect(integrity.segments.length).toBeGreaterThan(0);
        });

        it('should include assertions with STANAG 4774 labels', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            expect(manifest.assertions).toBeInstanceOf(Array);
            expect(manifest.assertions.length).toBeGreaterThan(0);
            
            const assertion = manifest.assertions[0];
            expect(assertion.id).toBe('1');
            expect(assertion.type).toBe('handling');
            expect(assertion.scope).toBe('payload');
            expect(assertion.appliesToState).toBe('unencrypted');
            expect(assertion.statement).toBeDefined();
            expect(assertion.binding).toBeDefined();
        });

        it('should extract binary payload correctly', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            const zip = await JSZip.loadAsync(result.zipBuffer);
            
            const payloadBuffer = await zip.files['0.payload'].async('nodebuffer');
            const expectedPayload = Buffer.from('encrypted-payload-data');
            
            expect(payloadBuffer).toEqual(expectedPayload);
        });

        it('should calculate correct metadata sizes', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject);
            
            expect(result.metadata.manifestSize).toBeGreaterThan(0);
            expect(result.metadata.payloadSize).toBe(Buffer.from('encrypted-payload-data').length);
            expect(result.fileSize).toBeGreaterThan(result.metadata.manifestSize + result.metadata.payloadSize);
        });

        it('should use STORE compression (no compression)', async () => {
            const result = await convertToOpenTDFFormat(mockZTDFObject, {
                compressionLevel: 0
            });
            
            // For STORE compression, file size should be close to sum of parts
            // (plus ZIP overhead for headers, central directory, etc.)
            const minExpectedSize = result.metadata.manifestSize + result.metadata.payloadSize;
            expect(result.fileSize).toBeGreaterThanOrEqual(minExpectedSize);
        });

    });

    // ============================================
    // Validation Tests
    // ============================================

    describe('validateExportedZTDF', () => {
        
        it('should validate a correctly exported ZTDF', async () => {
            const exportResult = await convertToOpenTDFFormat(mockZTDFObject);
            const validation = await validateExportedZTDF(exportResult.zipBuffer);
            
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        it('should detect missing 0.manifest.json', async () => {
            const zip = new JSZip();
            zip.file('0.payload', 'some data');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            const validation = await validateExportedZTDF(zipBuffer);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Missing 0.manifest.json');
        });

        it('should detect missing 0.payload', async () => {
            const zip = new JSZip();
            zip.file('0.manifest.json', JSON.stringify({ tdf_spec_version: '4.3.0' }));
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            const validation = await validateExportedZTDF(zipBuffer);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Missing 0.payload');
        });

        it('should detect invalid tdf_spec_version', async () => {
            const zip = new JSZip();
            const invalidManifest = {
                tdf_spec_version: '1.0', // Wrong version
                payload: { type: 'reference', url: '0.payload', protocol: 'zip', isEncrypted: true, mimeType: 'text/plain' },
                encryptionInformation: {},
                assertions: []
            };
            zip.file('0.manifest.json', JSON.stringify(invalidManifest));
            zip.file('0.payload', 'data');
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            const validation = await validateExportedZTDF(zipBuffer);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors.some(e => e.includes('tdf_spec_version'))).toBe(true);
        });

        it('should detect empty payload', async () => {
            const zip = new JSZip();
            zip.file('0.manifest.json', JSON.stringify({
                tdf_spec_version: '4.3.0',
                payload: { type: 'reference', url: '0.payload', protocol: 'zip', isEncrypted: true, mimeType: 'text/plain' },
                encryptionInformation: {},
                assertions: []
            }));
            zip.file('0.payload', Buffer.from([])); // Empty payload
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            
            const validation = await validateExportedZTDF(zipBuffer);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Payload is empty');
        });

    });

    // ============================================
    // Error Handling Tests
    // ============================================

    describe('Error Handling', () => {
        
        it('should throw error for missing manifest.objectId', async () => {
            const invalidZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            invalidZTDF.manifest.objectId = '';
            
            await expect(convertToOpenTDFFormat(invalidZTDF)).rejects.toThrow('Missing manifest.objectId');
        });

        it('should throw error for missing encrypted chunks', async () => {
            const invalidZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            invalidZTDF.payload.encryptedChunks = [];
            
            await expect(convertToOpenTDFFormat(invalidZTDF)).rejects.toThrow('Missing encrypted payload chunks');
        });

        it('should throw error for missing key access objects', async () => {
            const invalidZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            invalidZTDF.payload.keyAccessObjects = [];
            
            await expect(convertToOpenTDFFormat(invalidZTDF)).rejects.toThrow('Missing key access objects');
        });

        it('should throw error for missing security label', async () => {
            const invalidZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            (invalidZTDF.policy as any).securityLabel = null;
            
            await expect(convertToOpenTDFFormat(invalidZTDF)).rejects.toThrow('Missing security label');
        });

    });

    // ============================================
    // Options Tests
    // ============================================

    describe('Export Options', () => {
        
        it('should skip integrity validation when disabled', async () => {
            const invalidZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            invalidZTDF.manifest.objectId = ''; // Would normally fail validation
            
            // With validation disabled, export should succeed despite invalid objectId
            const result = await convertToOpenTDFFormat(invalidZTDF, { validateIntegrity: false });
            
            expect(result.success).toBe(true);
            expect(result.filename).toBe('.ztdf'); // Empty objectId = empty filename (valid for test)
        });

        it('should skip assertion signatures when disabled', async () => {
            const testZTDF: IZTDFObject = JSON.parse(JSON.stringify(mockZTDFObject));
            
            const result = await convertToOpenTDFFormat(testZTDF, {
                includeAssertionSignatures: false
            });
            
            const zip = await JSZip.loadAsync(result.zipBuffer);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;
            
            // Signature should be empty string
            expect(manifest.assertions[0].binding.signature).toBe('');
        });

    });

});
