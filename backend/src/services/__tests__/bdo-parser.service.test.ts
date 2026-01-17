/**
 * BDO Parser Service Tests
 *
 * Tests for extracting STANAG 4778 Binding Data Objects from various file formats.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import JSZip from 'jszip';

describe('BDO Parser Service', () => {
    describe('extractBDO', () => {
        it('should return null for unsupported MIME types', async () => {
            const { extractBDO } = await import('../bdo-parser.service');

            const result = await extractBDO(
                Buffer.from('test content'),
                'application/octet-stream',
                'test.bin'
            );

            expect(result).toBeNull();
        });

        it('should attempt to extract BDO from DOCX files', async () => {
            const { extractBDO } = await import('../bdo-parser.service');

            // Create a minimal DOCX-like ZIP file
            const zip = new JSZip();
            zip.file('word/document.xml', '<w:document><w:body><w:p><w:t>Test</w:t></w:p></w:body></w:document>');
            zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            const result = await extractBDO(
                buffer,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'test.docx'
            );

            // Should return null since there's no BDO in the test file
            expect(result).toBeNull();
        });

        it('should extract BDO from DOCX with custom XML binding', async () => {
            const { extractBDO } = await import('../bdo-parser.service');

            // Create DOCX with binding information
            const bindingXml = `<?xml version="1.0" encoding="UTF-8"?>
<BindingInformation xmlns="urn:nato:stanag:4778:bindinginformation:1:0">
    <originatorConfidentialityLabel>
        <ConfidentialityInformation>
            <PolicyIdentifier>1.3.26.1.3.1</PolicyIdentifier>
            <Classification>SECRET</Classification>
        </ConfidentialityInformation>
    </originatorConfidentialityLabel>
</BindingInformation>`;

            const zip = new JSZip();
            zip.file('word/document.xml', '<w:document><w:body><w:p><w:t>Test</w:t></w:p></w:body></w:document>');
            zip.file('customXml/item1.xml', bindingXml);
            zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            const result = await extractBDO(
                buffer,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'classified.docx'
            );

            expect(result).toBeDefined();
            if (result) {
                expect(result.originatorConfidentialityLabel.classification).toBe('SECRET');
                expect(result.originatorConfidentialityLabel.policyIdentifier).toBe('1.3.26.1.3.1');
            }
        });
    });

    describe('parseSidecarBDO', () => {
        it('should parse XML sidecar file', async () => {
            const { parseSidecarBDO } = await import('../bdo-parser.service');

            const sidecarContent = `<?xml version="1.0" encoding="UTF-8"?>
<BindingInformation xmlns="urn:nato:stanag:4778:bindinginformation:1:0">
    <originatorConfidentialityLabel>
        <ConfidentialityInformation>
            <PolicyIdentifier>1.3.26.1.3.1</PolicyIdentifier>
            <Classification>CONFIDENTIAL</Classification>
        </ConfidentialityInformation>
    </originatorConfidentialityLabel>
    <DataReference URI="" />
</BindingInformation>`;

            const result = await parseSidecarBDO(
                Buffer.from(sidecarContent),
                'document.bdo'
            );

            expect(result).toBeDefined();
            if (result) {
                expect(result.originatorConfidentialityLabel.classification).toBe('CONFIDENTIAL');
            }
        });

        it('should parse JSON sidecar file', async () => {
            const { parseSidecarBDO } = await import('../bdo-parser.service');

            const sidecarContent = JSON.stringify({
                classification: 'SECRET',
                policyIdentifier: '1.3.26.1.3.1',
                categories: [
                    { tagSetId: '1.3.26.1.4.2', tagName: 'Releasable To', values: ['USA', 'GBR'] }
                ]
            });

            const result = await parseSidecarBDO(
                Buffer.from(sidecarContent),
                'document.json'
            );

            expect(result).toBeDefined();
            if (result) {
                expect(result.originatorConfidentialityLabel.classification).toBe('SECRET');
            }
        });
    });

    describe('createBDOFromMetadata', () => {
        it('should create BDO from ZTDF metadata', async () => {
            const { createBDOFromMetadata } = await import('../bdo-parser.service');

            const bdo = createBDOFromMetadata('SECRET', ['USA', 'GBR', 'CAN'], {
                COI: ['FVEY', 'NATO'],
                caveats: ['NOFORN'],
                title: 'Test Document',
                creator: 'test-user',
            });

            expect(bdo.originatorConfidentialityLabel.classification).toBe('SECRET');
            expect(bdo.originatorConfidentialityLabel.policyIdentifier).toBe('1.3.26.1.3.1');
            expect(bdo.originatorConfidentialityLabel.categories).toBeDefined();
            expect(bdo.title).toBe('Test Document');
            expect(bdo.creator).toBe('test-user');

            // Check releasability category
            const relCat = bdo.originatorConfidentialityLabel.categories?.find(
                c => c.tagName === 'Releasable To'
            );
            expect(relCat).toBeDefined();
            expect(relCat?.values).toContain('USA');
            expect(relCat?.values).toContain('GBR');
            expect(relCat?.values).toContain('CAN');

            // Check COI category
            const coiCat = bdo.originatorConfidentialityLabel.categories?.find(
                c => c.tagName === 'COI'
            );
            expect(coiCat).toBeDefined();
            expect(coiCat?.values).toContain('FVEY');
            expect(coiCat?.values).toContain('NATO');
        });

        it('should create minimal BDO without optional fields', async () => {
            const { createBDOFromMetadata } = await import('../bdo-parser.service');

            const bdo = createBDOFromMetadata('UNCLASSIFIED', []);

            expect(bdo.originatorConfidentialityLabel.classification).toBe('UNCLASSIFIED');
            expect(bdo.dataReferences).toHaveLength(1);
            expect(bdo.dataReferences[0].uri).toBe('');
        });
    });

    describe('classification normalization', () => {
        it('should normalize various classification formats', async () => {
            const { createBDOFromMetadata } = await import('../bdo-parser.service');

            const bdo1 = createBDOFromMetadata('TS', []);
            expect(bdo1.originatorConfidentialityLabel.classification).toBe('TOP SECRET');

            const bdo2 = createBDOFromMetadata('s', []);
            expect(bdo2.originatorConfidentialityLabel.classification).toBe('SECRET');

            const bdo3 = createBDOFromMetadata('TOP_SECRET', []);
            expect(bdo3.originatorConfidentialityLabel.classification).toBe('TOP SECRET');
        });
    });
});
