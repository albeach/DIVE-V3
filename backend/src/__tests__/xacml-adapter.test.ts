/**
 * XACML Adapter Unit Tests
 * Tests for unified JSON to XACML XML conversion
 */

import { unifiedToXACMLRequest, normalizeXACMLResponse } from '../adapters/xacml-adapter';
import type { IUnifiedInput } from '../types/policies-lab.types';

describe('XACML Adapter', () => {
    // Base input for all tests
    const baseInput: IUnifiedInput = {
        subject: {
            uniqueID: 'john.doe@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            authenticated: true,
            aal: 'AAL2'
        },
        action: 'read',
        resource: {
            resourceId: 'doc-123',
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR']
        },
        context: {
            currentTime: '2025-10-27T12:00:00Z',
            requestId: 'req-789',
            deviceCompliant: true
        }
    };

    // Helper to create XACML response XML
    const createXACMLResponseXML = (decision: string, statusMessage?: string, obligations?: any[], advice?: any[]): string => {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17">
  <Result>
    <Decision>${decision}</Decision>`;

        // Status
        xml += `\n    <Status>
      <StatusCode Value="urn:oasis:names:tc:xacml:1.0:status:ok"/>`;
        if (statusMessage) {
            xml += `\n      <StatusMessage>${statusMessage}</StatusMessage>`;
        }
        xml += `\n    </Status>`;

        // Obligations
        if (obligations && obligations.length > 0) {
            xml += `\n    <Obligations>`;
            obligations.forEach(obl => {
                xml += `\n      <Obligation ObligationId="${obl.Id}">`;
                if (obl.AttributeAssignment) {
                    const assignments = Array.isArray(obl.AttributeAssignment) ? obl.AttributeAssignment : [obl.AttributeAssignment];
                    assignments.forEach((attr: any) => {
                        xml += `\n        <AttributeAssignment AttributeId="${attr.AttributeId}" DataType="${attr.DataType || 'http://www.w3.org/2001/XMLSchema#string'}">${attr._}</AttributeAssignment>`;
                    });
                }
                xml += `\n      </Obligation>`;
            });
            xml += `\n    </Obligations>`;
        }

        // Advice
        if (advice && advice.length > 0) {
            xml += `\n    <AssociatedAdvice>`;
            advice.forEach(adv => {
                xml += `\n      <Advice AdviceId="${adv.Id}">`;
                if (adv.AttributeAssignment) {
                    const assignments = Array.isArray(adv.AttributeAssignment) ? adv.AttributeAssignment : [adv.AttributeAssignment];
                    assignments.forEach((attr: any) => {
                        xml += `\n        <AttributeAssignment AttributeId="${attr.AttributeId}" DataType="${attr.DataType || 'http://www.w3.org/2001/XMLSchema#string'}">${attr._}</AttributeAssignment>`;
                    });
                }
                xml += `\n      </Advice>`;
            });
            xml += `\n    </AssociatedAdvice>`;
        }

        xml += `\n  </Result>
</Response>`;
        return xml;
    };

    const basePolicyMetadata = {
        id: 'test-policy-123',
        type: 'xacml' as const,
        packageOrPolicyId: 'urn:dive:lab:test',
        name: 'Test Policy'
    };

    describe('unifiedToXACMLRequest', () => {
        it('should convert unified input to valid XACML request XML', () => {
            const xacmlRequest = unifiedToXACMLRequest(baseInput);

            expect(xacmlRequest).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xacmlRequest).toContain('<Request');
            expect(xacmlRequest).toContain('xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17"');
            expect(xacmlRequest).toContain('CombinedDecision="false"');
            expect(xacmlRequest).toContain('ReturnPolicyIdList="true"'); // Set to true per implementation
            expect(xacmlRequest).toContain('</Request>');
        });

        it('should include subject attributes correctly', () => {
            const xacmlRequest = unifiedToXACMLRequest(baseInput);

            expect(xacmlRequest).toContain('Category="urn:oasis:names:tc:xacml:1.0:subject-category:access-subject"');
            expect(xacmlRequest).toContain('urn:dive:subject:uniqueID');
            expect(xacmlRequest).toContain('john.doe@example.com');
            expect(xacmlRequest).toContain('urn:dive:subject:clearance');
            expect(xacmlRequest).toContain('SECRET');
            expect(xacmlRequest).toContain('urn:dive:subject:countryOfAffiliation');
            expect(xacmlRequest).toContain('USA');
        });

        it('should handle multi-valued attributes (COI, releasabilityTo)', () => {
            const inputWithArrays: IUnifiedInput = {
                ...baseInput,
                subject: {
                    ...baseInput.subject,
                    acpCOI: ['FVEY', 'NATO-COSMIC']
                },
                resource: {
                    ...baseInput.resource,
                    releasabilityTo: ['USA', 'GBR', 'CAN'],
                    COI: ['FVEY']
                }
            };

            const xacmlRequest = unifiedToXACMLRequest(inputWithArrays);

            // Check for bag-based multi-valued attributes
            expect(xacmlRequest).toContain('urn:dive:subject:acpCOI');
            expect(xacmlRequest).toContain('FVEY');
            expect(xacmlRequest).toContain('NATO-COSMIC');
            expect(xacmlRequest).toContain('urn:dive:resource:releasabilityTo');
            expect(xacmlRequest).toContain('USA');
            expect(xacmlRequest).toContain('GBR');
            expect(xacmlRequest).toContain('CAN');
        });

        it('should include action attributes', () => {
            const xacmlRequest = unifiedToXACMLRequest(baseInput);

            expect(xacmlRequest).toContain('Category="urn:oasis:names:tc:xacml:3.0:attribute-category:action"');
            expect(xacmlRequest).toContain('urn:oasis:names:tc:xacml:1.0:action:action-id');
            expect(xacmlRequest).toContain('read');
        });

        it('should include resource attributes', () => {
            const xacmlRequest = unifiedToXACMLRequest(baseInput);

            expect(xacmlRequest).toContain('Category="urn:oasis:names:tc:xacml:3.0:attribute-category:resource"');
            expect(xacmlRequest).toContain('urn:oasis:names:tc:xacml:1.0:resource:resource-id');
            expect(xacmlRequest).toContain('doc-123');
            expect(xacmlRequest).toContain('urn:dive:resource:classification');
            expect(xacmlRequest).toContain('SECRET');
        });

        it('should include context/environment attributes', () => {
            const xacmlRequest = unifiedToXACMLRequest(baseInput);

            expect(xacmlRequest).toContain('Category="urn:oasis:names:tc:xacml:3.0:attribute-category:environment"');
            expect(xacmlRequest).toContain('urn:oasis:names:tc:xacml:1.0:environment:current-dateTime');
            expect(xacmlRequest).toContain('2025-10-27T12:00:00Z');
            expect(xacmlRequest).toContain('urn:dive:environment:requestId');
            expect(xacmlRequest).toContain('req-789');
        });

        it('should handle optional attributes correctly', () => {
            const inputWithOptionals: IUnifiedInput = {
                ...baseInput,
                context: {
                    ...baseInput.context,
                    sourceIP: '10.0.0.1'
                },
                resource: {
                    ...baseInput.resource,
                    encrypted: true,
                    creationDate: '2025-01-01T00:00:00Z'
                }
            };

            const xacmlRequest = unifiedToXACMLRequest(inputWithOptionals);

            expect(xacmlRequest).toContain('urn:dive:environment:sourceIP');
            expect(xacmlRequest).toContain('10.0.0.1');
            expect(xacmlRequest).toContain('urn:dive:resource:encrypted');
            expect(xacmlRequest).toContain('true');
            expect(xacmlRequest).toContain('urn:dive:resource:creationDate');
            expect(xacmlRequest).toContain('2025-01-01T00:00:00Z');
        });

        it('should handle boolean attributes correctly', () => {
            const inputWithBooleans: IUnifiedInput = {
                ...baseInput,
                subject: {
                    ...baseInput.subject,
                    authenticated: false
                },
                context: {
                    ...baseInput.context,
                    deviceCompliant: false
                },
                resource: {
                    ...baseInput.resource,
                    encrypted: true
                }
            };

            const xacmlRequest = unifiedToXACMLRequest(inputWithBooleans);

            expect(xacmlRequest).toMatch(/urn:dive:subject:authenticated[\s\S]*?boolean[\s\S]*?false/);
            expect(xacmlRequest).toMatch(/urn:dive:environment:deviceCompliant[\s\S]*?boolean[\s\S]*?false/);
            expect(xacmlRequest).toMatch(/urn:dive:resource:encrypted[\s\S]*?boolean[\s\S]*?true/);
        });

        it('should escape special XML characters', () => {
            const inputWithSpecialChars: IUnifiedInput = {
                ...baseInput,
                subject: {
                    ...baseInput.subject,
                    uniqueID: 'user<test>&"quote\'@example.com'
                }
            };

            const xacmlRequest = unifiedToXACMLRequest(inputWithSpecialChars);

            expect(xacmlRequest).not.toContain('user<test>&"quote\'@example.com');
            expect(xacmlRequest).toContain('&lt;'); // < escaped
            expect(xacmlRequest).toContain('&amp;'); // & escaped
            // Note: xml2js Builder handles character escaping automatically
        });
    });

    describe('normalizeXACMLResponse', () => {
        it('should normalize PERMIT decision', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit');

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.decision).toBe('PERMIT');
            expect(normalized.reason).toContain('Permit');
            expect(normalized.obligations).toHaveLength(0);
            expect(normalized.advice).toHaveLength(0);
        });

        it('should normalize DENY decision', async () => {
            const xacmlResponse = createXACMLResponseXML('Deny', 'Insufficient clearance');

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.decision).toBe('DENY');
            expect(normalized.reason).toContain('Insufficient clearance');
        });

        it('should normalize NOT_APPLICABLE decision', async () => {
            const xacmlResponse = createXACMLResponseXML('NotApplicable');

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.decision).toBe('NOT_APPLICABLE');
            expect(normalized.reason).toContain('NotApplicable'); // Contains XACML decision string
        });

        it('should normalize INDETERMINATE decision', async () => {
            const xacmlResponse = createXACMLResponseXML('Indeterminate', 'Missing required attribute');

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.decision).toBe('INDETERMINATE');
            expect(normalized.reason).toContain('Missing required attribute');
        });

        it('should parse obligations correctly', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit', undefined, [
                {
                    Id: 'log-access',
                    AttributeAssignment: [
                        { AttributeId: 'resourceId', _: 'doc-123', DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                        { AttributeId: 'timestamp', _: '2025-10-27T12:00:00Z', DataType: 'http://www.w3.org/2001/XMLSchema#string' }
                    ]
                },
                {
                    Id: 'encrypt-response',
                    AttributeAssignment: [
                        { AttributeId: 'algorithm', _: 'AES-256-GCM', DataType: 'http://www.w3.org/2001/XMLSchema#string' }
                    ]
                }
            ]);

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.obligations).toHaveLength(2);
            expect(normalized.obligations[0].type).toBe('LOG-ACCESS'); // Uppercase per implementation
            expect(normalized.obligations[0].params).toEqual({
                resourceId: 'doc-123',
                timestamp: '2025-10-27T12:00:00Z'
            });
            expect(normalized.obligations[1].type).toBe('ENCRYPT-RESPONSE'); // Uppercase per implementation
            expect(normalized.obligations[1].params).toEqual({
                algorithm: 'AES-256-GCM'
            });
        });

        it('should parse advice correctly', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit', undefined, undefined, [
                {
                    Id: 'mfa-recommended',
                    AttributeAssignment: [
                        { AttributeId: 'reason', _: 'High-value resource', DataType: 'http://www.w3.org/2001/XMLSchema#string' }
                    ]
                }
            ]);

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.advice).toHaveLength(1);
            expect(normalized.advice?.[0].type).toBe('MFA-RECOMMENDED'); // Uppercase as in XML
            expect(normalized.advice?.[0].params).toEqual({
                reason: 'High-value resource'
            });
        });

        it('should handle response with both obligations and advice', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit', undefined, [
                {
                    Id: 'log-access',
                    AttributeAssignment: [
                        { AttributeId: 'resourceId', _: 'doc-123', DataType: 'http://www.w3.org/2001/XMLSchema#string' }
                    ]
                }
            ], [
                {
                    Id: 'mfa-recommended',
                    AttributeAssignment: [
                        { AttributeId: 'reason', _: 'High risk', DataType: 'http://www.w3.org/2001/XMLSchema#string' }
                    ]
                }
            ]);

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.obligations).toHaveLength(1);
            expect(normalized.advice).toHaveLength(1);
        });

        it('should handle empty obligations and advice', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit');

            const normalized = await normalizeXACMLResponse(xacmlResponse, basePolicyMetadata, baseInput, 100);

            expect(normalized.obligations).toHaveLength(0);
            expect(normalized.advice).toHaveLength(0);
        });

        it('should extract policy metadata correctly', async () => {
            const xacmlResponse = createXACMLResponseXML('Permit');

            const customMetadata = {
                id: 'clearance-policy-456',
                type: 'xacml' as const,
                packageOrPolicyId: 'urn:dive:lab:clearance',
                name: 'Clearance Policy'
            };

            const normalized = await normalizeXACMLResponse(xacmlResponse, customMetadata, baseInput, 100);

            expect(normalized.policy_metadata.packageOrPolicyId).toBe('urn:dive:lab:clearance');
            expect(normalized.policy_metadata.name).toBe('Clearance Policy');
            expect(normalized.policy_metadata.type).toBe('xacml');
        });

        it('should throw for malformed response', async () => {
            const malformedResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17">
</Response>`;

            await expect(normalizeXACMLResponse(malformedResponse, basePolicyMetadata, baseInput, 100)).rejects.toThrow(
                'XACML Response normalization failed'
            );
        });
    });
});
