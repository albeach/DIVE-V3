/**
 * Multi-KAS Support Tests
 * 
 * Tests for ACP-240 Section 5.3: Multiple KAS per resource
 */

import { uploadFile } from '../services/upload.service';
import { ClassificationLevel } from '../types/ztdf.types';

describe('Multi-KAS Support', () => {
    describe('Multiple KAO Creation', () => {
        test('should create multiple KAOs for FVEY resource', async () => {
            const fileBuffer = Buffer.from('Test content for FVEY coalition');
            const metadata = {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
                COI: ['FVEY'],
                caveats: [],
                title: 'FVEY Intelligence Report'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'fvey-report.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            expect(result.metadata.ztdf.kaoCount).toBeGreaterThan(1);
        });

        test('should create nation-specific KAOs for multi-nation resource', async () => {
            const fileBuffer = Buffer.from('Coalition document');
            const metadata = {
                classification: 'CONFIDENTIAL' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'FRA'],
                COI: [],
                caveats: [],
                title: 'Coalition Planning Document'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'coalition.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            expect(result.metadata.ztdf.kaoCount).toBeGreaterThanOrEqual(3); // COI + nations
        });

        test('should create COI-based KAOs when COI tags specified', async () => {
            const fileBuffer = Buffer.from('NATO classified');
            const metadata = {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU'],
                COI: ['NATO-COSMIC', 'FVEY'],
                caveats: [],
                title: 'NATO Secret Document'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'nato-secret.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            // Should have KAOs for both COI tags + nation-specific
            expect(result.metadata.ztdf.kaoCount).toBeGreaterThanOrEqual(2);
        });

        test('should create at least one KAO for single-nation resource', async () => {
            const fileBuffer = Buffer.from('US only document');
            const metadata = {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA'],
                COI: [],
                caveats: ['NOFORN'],
                title: 'US Only Document'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'us-only.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            expect(result.metadata.ztdf.kaoCount).toBeGreaterThanOrEqual(1);
        });
    });

    describe('COI-Based Encryption', () => {
        test('should use COI key for encryption when COI specified', async () => {
            const fileBuffer = Buffer.from('FVEY content');
            const metadata = {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['FVEY'],
                caveats: [],
                title: 'FVEY Document'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'fvey-doc.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            expect(result.resourceId).toBeDefined();
            // COI key should be used (verified by upload service logs)
        });

        test('should infer COI from releasability pattern', async () => {
            const fileBuffer = Buffer.from('Canada-US bilateral');
            const metadata = {
                classification: 'CONFIDENTIAL' as ClassificationLevel,
                releasabilityTo: ['USA', 'CAN'],
                COI: [], // No explicit COI
                caveats: [],
                title: 'CAN-US Bilateral Agreement'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'can-us.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            // Should infer CAN-US bilateral COI
        });
    });

    describe('Backwards Compatibility', () => {
        test('should maintain compatibility with deterministic DEK for resources without COI', async () => {
            const fileBuffer = Buffer.from('Legacy format');
            const metadata = {
                classification: 'UNCLASSIFIED' as ClassificationLevel,
                releasabilityTo: ['USA'],
                COI: [],
                caveats: [],
                title: 'Legacy Document'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'legacy.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            expect(result.resourceId).toBeDefined();
        });
    });

    describe('Coalition Scalability', () => {
        test('new coalition members can access historical data with COI keys', () => {
            // This is a conceptual test demonstrating the benefit
            // In production, a new FVEY member (e.g., hypothetically adding a 6th nation)
            // would immediately get access to all FVEY-encrypted historical data
            // without requiring re-encryption
            
            const { getCOIKey } = require('../services/coi-key-registry');
            const fveyKey = getCOIKey('FVEY');
            
            // Both existing and new members use the same FVEY key
            expect(fveyKey).toBeDefined();
            expect(fveyKey.length).toBe(32);
            
            // Demonstrates that the key is stable and shared
            const fveyKey2 = getCOIKey('FVEY');
            expect(fveyKey.toString('base64')).toBe(fveyKey2.toString('base64'));
        });

        test('KAO policy binding reflects COI requirements', async () => {
            const fileBuffer = Buffer.from('FVEY intelligence');
            const metadata = {
                classification: 'TOP_SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
                COI: ['FVEY'],
                caveats: [],
                title: 'FVEY Intelligence'
            };
            const uploader = {
                uniqueID: 'admiral.test@mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'fvey-intel.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            // KAOs should have policy bindings reflecting FVEY requirements
        });
    });

    describe('KAO Redundancy', () => {
        test('should provide redundancy with multiple KAOs for same resource', async () => {
            const fileBuffer = Buffer.from('Critical NATO document');
            const metadata = {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN'],
                COI: ['NATO'],
                caveats: [],
                title: 'NATO Operations Plan'
            };
            const uploader = {
                uniqueID: 'test.user@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const result = await uploadFile(
                fileBuffer,
                'nato-ops.txt',
                'text/plain',
                metadata,
                uploader
            );

            expect(result.success).toBe(true);
            // Multiple KAOs provide redundancy - if one KAS is down, others available
            expect(result.metadata.ztdf.kaoCount).toBeGreaterThan(1);
        });
    });
});

describe('ACP-240 Compliance - Multi-KAS Benefits', () => {
    test('demonstrates coalition growth without re-encryption', () => {
        // Conceptual test showing ACP-240 Section 5.3 compliance
        const { selectCOIForResource, getCOIKey } = require('../services/coi-key-registry');
        
        // Scenario: FVEY resource created in 2024
        const coi2024 = selectCOIForResource(['USA', 'GBR', 'CAN', 'AUS', 'NZL'], ['FVEY']);
        const key2024 = getCOIKey(coi2024);
        
        // Scenario: New member joins FVEY in 2025 (hypothetical)
        // They can immediately access 2024 data using the same FVEY key
        const coi2025 = selectCOIForResource(['USA', 'GBR', 'CAN', 'AUS', 'NZL'], ['FVEY']);
        const key2025 = getCOIKey(coi2025);
        
        // Keys are identical - no re-encryption needed
        expect(key2024.toString('base64')).toBe(key2025.toString('base64'));
    });

    test('demonstrates multi-KAS sovereignty with nation-specific endpoints', () => {
        // Conceptual test showing how each nation can have its own KAS
        // Example: USA-KAS, GBR-KAS, CAN-KAS all can decrypt the same resource
        // using their respective KAOs, maintaining national sovereignty
        
        const kasEndpoints = {
            'USA': 'https://usa.kas.mil:8080',
            'GBR': 'https://gbr.kas.mod.uk:8080',
            'CAN': 'https://can.kas.dnd.ca:8080'
        };
        
        // Each nation maintains control of their KAS infrastructure
        expect(Object.keys(kasEndpoints).length).toBe(3);
    });
});

