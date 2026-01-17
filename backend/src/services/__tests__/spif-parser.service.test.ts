/**
 * SPIF Parser Service Tests
 *
 * Tests for parsing NATO_Security_Policy.xml and generating STANAG-compliant markings.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs for testing without actual SPIF file
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// Sample SPIF XML for testing
const SAMPLE_SPIF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<SPIF xmlns="urn:nato:stanag:4774:1:0:spif" version="1" creationDate="2024-01-01">
    <defaultSecurityPolicyId name="NATO" id="1.3.26.1.3.1"/>
    <securityClassifications>
        <securityClassification name="UNCLASSIFIED" lacv="0" hierarchy="1">
            <markingData phrase="UNCLASSIFIED" code="pageTopBottom" xml:lang="en"/>
            <markingData phrase="NU" code="portionMarking"/>
        </securityClassification>
        <securityClassification name="CONFIDENTIAL" lacv="1" hierarchy="3">
            <markingData phrase="CONFIDENTIAL" code="pageTopBottom" xml:lang="en"/>
            <markingData phrase="NC" code="portionMarking"/>
        </securityClassification>
        <securityClassification name="SECRET" lacv="2" hierarchy="4">
            <markingData phrase="SECRET" code="pageTopBottom" xml:lang="en"/>
            <markingData phrase="NS" code="portionMarking"/>
        </securityClassification>
        <securityClassification name="TOP SECRET" lacv="3" hierarchy="5">
            <markingData phrase="TOP SECRET" code="pageTopBottom" xml:lang="en"/>
            <markingData phrase="CTS" code="portionMarking"/>
        </securityClassification>
    </securityClassifications>
    <securityCategoryTagSets>
        <securityCategoryTagSet name="Releasable To" id="1.3.26.1.4.2">
            <securityCategoryTag name="Releasable To Nations" tagType="permissive">
                <markingQualifier markingCode="pageTop">
                    <qualifier qualifierCode="prefix" markingQualifier="REL TO "/>
                    <qualifier qualifierCode="separator" markingQualifier=", "/>
                </markingQualifier>
                <tagCategory name="USA" lacv="1">
                    <markingData phrase="United States of America" xml:lang="en"/>
                </tagCategory>
                <tagCategory name="GBR" lacv="2">
                    <markingData phrase="United Kingdom" xml:lang="en"/>
                </tagCategory>
                <tagCategory name="CAN" lacv="3">
                    <markingData phrase="Canada" xml:lang="en"/>
                </tagCategory>
            </securityCategoryTag>
        </securityCategoryTagSet>
    </securityCategoryTagSets>
</SPIF>`;

describe('SPIF Parser Service', () => {
    beforeAll(() => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(SAMPLE_SPIF_XML);
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('parseSPIF', () => {
        it('should parse SPIF XML and extract classifications', async () => {
            // Import after mocks are set up
            const { parseSPIF, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const spifData = await parseSPIF();

            expect(spifData).toBeDefined();
            expect(spifData.policyName).toBe('NATO');
            expect(spifData.classifications.size).toBeGreaterThan(0);
        });

        it('should extract correct classification hierarchy', async () => {
            const { parseSPIF, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const spifData = await parseSPIF();

            const unclass = spifData.classifications.get('UNCLASSIFIED');
            const secret = spifData.classifications.get('SECRET');
            const topSecret = spifData.classifications.get('TOP SECRET');

            expect(unclass?.hierarchy).toBe(1);
            expect(secret?.hierarchy).toBe(4);
            expect(topSecret?.hierarchy).toBe(5);
        });
    });

    describe('getSPIFMarkingRules', () => {
        it('should return simplified marking rules', async () => {
            const { getSPIFMarkingRules, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const rules = await getSPIFMarkingRules();

            expect(rules.classifications.size).toBeGreaterThan(0);
            expect(rules.countries.size).toBeGreaterThan(0);
            expect(rules.releasableToQualifier.prefix).toBe('REL TO ');
        });
    });

    describe('generateMarking', () => {
        it('should generate correct display marking for SECRET//REL TO USA', async () => {
            const { generateMarking, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const marking = await generateMarking('SECRET', ['USA']);

            expect(marking.displayMarking).toContain('SECRET');
            expect(marking.displayMarking).toContain('REL TO');
            expect(marking.displayMarking).toContain('USA');
            expect(marking.portionMarking).toBe('(NS)');
        });

        it('should generate correct display marking for UNCLASSIFIED', async () => {
            const { generateMarking, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const marking = await generateMarking('UNCLASSIFIED', []);

            expect(marking.displayMarking).toBe('UNCLASSIFIED');
            expect(marking.portionMarking).toBe('(NU)');
        });

        it('should handle multiple releasability countries', async () => {
            const { generateMarking, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const marking = await generateMarking('SECRET', ['USA', 'GBR', 'CAN']);

            expect(marking.displayMarking).toContain('REL TO');
            expect(marking.releasabilityPhrase).toContain('USA');
            expect(marking.releasabilityPhrase).toContain('GBR');
            expect(marking.releasabilityPhrase).toContain('CAN');
        });

        it('should include caveats in marking', async () => {
            const { generateMarking, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            const marking = await generateMarking('SECRET', ['USA'], {
                caveats: ['NOFORN', 'ATOMAL'],
            });

            expect(marking.displayMarking).toContain('NOFORN');
            expect(marking.displayMarking).toContain('ATOMAL');
        });
    });

    describe('getClassificationLevel', () => {
        it('should return correct hierarchy levels', async () => {
            const { getClassificationLevel } = await import('../spif-parser.service');

            expect(getClassificationLevel('UNCLASSIFIED')).toBe(1);
            expect(getClassificationLevel('CONFIDENTIAL')).toBe(3);
            expect(getClassificationLevel('SECRET')).toBe(4);
            expect(getClassificationLevel('TOP_SECRET')).toBe(5);
        });

        it('should handle various classification formats', async () => {
            const { getClassificationLevel } = await import('../spif-parser.service');

            expect(getClassificationLevel('top_secret')).toBe(5);
            expect(getClassificationLevel('TOP SECRET')).toBe(5);
        });
    });

    describe('compareClassifications', () => {
        it('should correctly compare classification levels', async () => {
            const { compareClassifications } = await import('../spif-parser.service');

            expect(compareClassifications('SECRET', 'CONFIDENTIAL')).toBeGreaterThan(0);
            expect(compareClassifications('UNCLASSIFIED', 'SECRET')).toBeLessThan(0);
            expect(compareClassifications('SECRET', 'SECRET')).toBe(0);
        });
    });

    describe('meetsClassificationRequirement', () => {
        it('should correctly check clearance requirements', async () => {
            const { meetsClassificationRequirement } = await import('../spif-parser.service');

            expect(meetsClassificationRequirement('TOP_SECRET', 'SECRET')).toBe(true);
            expect(meetsClassificationRequirement('SECRET', 'SECRET')).toBe(true);
            expect(meetsClassificationRequirement('CONFIDENTIAL', 'SECRET')).toBe(false);
        });
    });

    describe('isValidClassification', () => {
        it('should validate known classifications', async () => {
            const { isValidClassification, clearSPIFCache } = await import('../spif-parser.service');
            clearSPIFCache();

            expect(await isValidClassification('SECRET')).toBe(true);
            expect(await isValidClassification('TOP SECRET')).toBe(true);
        });
    });
});
