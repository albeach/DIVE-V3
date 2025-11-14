/**
 * Policy Execution Service Unit Tests
 * Tests for OPA and AuthzForce policy evaluation orchestration
 */

import { evaluateRego, evaluateXACML, IPolicyExecutionContext } from '../services/policy-execution.service';
import type { IUnifiedInput, IPolicyUpload } from '../types/policies-lab.types';

// Mock axios for OPA and AuthzForce calls
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock file system utilities
jest.mock('../utils/policy-lab-fs.utils');
import { readPolicySource } from '../utils/policy-lab-fs.utils';
const mockedReadPolicySource = readPolicySource as jest.MockedFunction<typeof readPolicySource>;

// Helper function to create execution context from policy upload
const createExecutionContext = (policy: IPolicyUpload): IPolicyExecutionContext => ({
    policyId: policy.policyId,
    userId: policy.ownerId,
    policyType: policy.type,
    packageOrPolicyId: policy.metadata?.packageOrPolicyId || 'unknown',
    policyName: policy.metadata?.name || policy.filename
});

// Helper function to generate XACML Response XML
const createXACMLResponseXML = (decision: string, statusMessage?: string, obligations?: any[], advice?: any[]): string => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17">
    <Result>
        <Decision>${decision}</Decision>
        <Status>
            <StatusCode Value="urn:oasis:names:tc:xacml:1.0:status:ok"/>`;

    if (statusMessage) {
        xml += `
            <StatusMessage>${statusMessage}</StatusMessage>`;
    }

    xml += `
        </Status>`;

    if (obligations && obligations.length > 0) {
        xml += `
        <Obligations>`;
        obligations.forEach(obl => {
            xml += `
            <Obligation ObligationId="${obl.Id}">`;
            if (obl.AttributeAssignment) {
                obl.AttributeAssignment.forEach((attr: any) => {
                    xml += `
                <AttributeAssignment AttributeId="${attr.AttributeId}">${attr.Value}</AttributeAssignment>`;
                });
            }
            xml += `
            </Obligation>`;
        });
        xml += `
        </Obligations>`;
    }

    if (advice && advice.length > 0) {
        xml += `
        <AssociatedAdvice>`;
        advice.forEach(adv => {
            xml += `
            <Advice AdviceId="${adv.Id}">`;
            if (adv.AttributeAssignment) {
                adv.AttributeAssignment.forEach((attr: any) => {
                    xml += `
                <AttributeAssignment AttributeId="${attr.AttributeId}">${attr.Value}</AttributeAssignment>`;
                });
            }
            xml += `
            </Advice>`;
        });
        xml += `
        </AssociatedAdvice>`;
    }

    xml += `
    </Result>
</Response>`;

    return xml;
};

describe('Policy Execution Service', () => {
    const mockPolicy: IPolicyUpload = {
        policyId: 'test-policy-123',
        ownerId: 'user-456',
        type: 'rego',
        filename: 'test-policy.rego',
        sizeBytes: 1024,
        hash: 'abc123',
        validated: true,
        validationErrors: [],
        metadata: {
            name: 'Test Policy',
            packageOrPolicyId: 'dive.lab.test',
            rulesCount: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        structure: {
            package: 'dive.lab.test',
            imports: ['rego.v1'],
            rules: [
                { name: 'allow', type: 'allow' },
                { name: 'is_not_authenticated', type: 'violation' }
            ]
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const mockUnifiedInput: IUnifiedInput = {
        subject: {
            uniqueID: 'john.doe@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['FVEY'],
            authenticated: true,
            aal: 'AAL2'
        },
        action: 'read',
        resource: {
            resourceId: 'doc-123',
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR'],
            COI: ['FVEY'],
            encrypted: false
        },
        context: {
            currentTime: new Date().toISOString(),
            sourceIP: '10.0.0.1',
            requestId: 'req-789',
            deviceCompliant: true
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock file system to return dummy policy source
        mockedReadPolicySource.mockResolvedValue(`
package dive.lab.test

import rego.v1

default allow := false

allow if {
    input.subject.clearance == "SECRET"
    input.resource.classification == "SECRET"
}
`);
    });

    describe('evaluateRego', () => {
        it('should successfully evaluate a Rego policy with ALLOW decision', async () => {
            const opaResponse = {
                data: {
                    result: {
                        allow: true,
                        reason: 'All conditions satisfied',
                        obligations: [
                            {
                                type: 'LOG_ACCESS',
                                params: { resourceId: 'doc-123' }
                            }
                        ],
                        evaluation_details: {
                            trace: [
                                { rule: 'is_not_authenticated', result: false, reason: 'Subject is authenticated' },
                                { rule: 'allow', result: true, reason: 'No violations found' }
                            ]
                        }
                    }
                }
            };

            mockedAxios.post.mockResolvedValueOnce({ data: opaResponse.data });

            const result = await evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput);

            expect(result.engine).toBe('opa');
            expect(result.decision).toBe('ALLOW');
            expect(result.reason).toBe('All conditions satisfied');
            expect(result.obligations).toHaveLength(1);
            expect(result.obligations[0].type).toBe('LOG_ACCESS');
            expect(result.evaluation_details.trace).toHaveLength(2);
            expect(result.policy_metadata.packageOrPolicyId).toBe('dive.lab.test');
            expect(result.inputs.unified).toEqual(mockUnifiedInput);
        });

        it('should successfully evaluate a Rego policy with DENY decision', async () => {
            const opaResponse = {
                data: {
                    result: {
                        allow: false,
                        reason: 'Insufficient clearance',
                        obligations: [],
                        evaluation_details: {
                            trace: [
                                { rule: 'is_insufficient_clearance', result: true, reason: 'CONFIDENTIAL < SECRET' }
                            ]
                        }
                    }
                }
            };

            mockedAxios.post.mockResolvedValueOnce({ data: opaResponse.data });

            const result = await evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput);

            expect(result.engine).toBe('opa');
            expect(result.decision).toBe('DENY');
            expect(result.reason).toBe('Insufficient clearance');
        });

        it('should handle OPA timeout errors', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                code: 'ECONNABORTED',
                message: 'timeout of 5000ms exceeded'
            });

            await expect(evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput)).rejects.toThrow(
                'Policy evaluation exceeded'
            );
        });

        it('should handle OPA service unavailable', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                code: 'ECONNREFUSED',
                message: 'connect ECONNREFUSED 127.0.0.1:8181'
            });

            await expect(evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput)).rejects.toThrow(
                'OPA evaluation failed'
            );
        });

        it('should handle OPA evaluation errors', async () => {
            // OPA returns empty result when there are errors
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    result: undefined  // No result due to error
                }
            });

            const result = await evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput);

            // Should return DENY when result is undefined
            expect(result.decision).toBe('DENY');
            expect(result.reason).toBe('Policy evaluation failed');
        });

        it('should measure latency correctly', async () => {
            const opaResponse = {
                data: {
                    result: {
                        allow: true,
                        reason: 'Allowed',
                        obligations: [],
                        evaluation_details: {
                            trace: []
                        }
                    }
                }
            };

            mockedAxios.post.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => resolve({ data: opaResponse.data }), 50);
                });
            });

            const result = await evaluateRego(createExecutionContext(mockPolicy), mockUnifiedInput);

            expect(result.evaluation_details.latency_ms).toBeGreaterThanOrEqual(45); // Be lenient with timing
            expect(result.evaluation_details.latency_ms).toBeLessThan(1000);
        });
    });

    describe('evaluateXACML', () => {
        const mockXACMLPolicy: IPolicyUpload = {
            ...mockPolicy,
            type: 'xacml',
            filename: 'test-policy.xml',
            metadata: {
                ...mockPolicy.metadata,
                packageOrPolicyId: 'urn:dive:lab:test'
            },
            structure: {
                policySetId: 'urn:dive:lab:test',
                policyCombiningAlg: 'deny-overrides',
                policies: [
                    { policyId: 'main-policy', ruleCombiningAlg: 'permit-overrides', rulesCount: 2 }
                ]
            }
        };

        it('should successfully evaluate a XACML policy with PERMIT decision', async () => {
            const authzForceResponseXML = createXACMLResponseXML('Permit', undefined, [
                {
                    Id: 'log-access',
                    AttributeAssignment: [
                        { AttributeId: 'resourceId', Value: 'doc-123' }
                    ]
                }
            ]);

            mockedAxios.post.mockResolvedValueOnce({ data: authzForceResponseXML });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            expect(result.engine).toBe('xacml');
            expect(result.decision).toBe('PERMIT');
            expect(result.obligations).toHaveLength(1);
            expect(result.policy_metadata.packageOrPolicyId).toBe('urn:dive:lab:test');
            expect(result.inputs.xacml_request).toBeDefined();
            expect(result.inputs.xacml_request).toContain('<Request');
        });

        it('should successfully evaluate a XACML policy with DENY decision', async () => {
            const authzForceResponseXML = createXACMLResponseXML('Deny', 'Insufficient clearance');

            mockedAxios.post.mockResolvedValueOnce({ data: authzForceResponseXML });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            expect(result.engine).toBe('xacml');
            expect(result.decision).toBe('DENY');
            expect(result.reason).toContain('Insufficient clearance');
        });

        it('should handle NOT_APPLICABLE decision', async () => {
            const authzForceResponseXML = createXACMLResponseXML('NotApplicable');

            mockedAxios.post.mockResolvedValueOnce({ data: authzForceResponseXML });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            expect(result.engine).toBe('xacml');
            expect(result.decision).toBe('NOT_APPLICABLE');
        });

        it('should handle INDETERMINATE decision', async () => {
            const authzForceResponseXML = createXACMLResponseXML('Indeterminate', 'Missing required attribute');

            mockedAxios.post.mockResolvedValueOnce({ data: authzForceResponseXML });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            expect(result.engine).toBe('xacml');
            expect(result.decision).toBe('INDETERMINATE');
            expect(result.reason).toContain('Missing required attribute');
        });

        it('should handle AuthzForce timeout errors', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                code: 'ECONNABORTED',
                message: 'timeout of 5000ms exceeded'
            });

            await expect(evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput)).rejects.toThrow(
                'Policy evaluation exceeded'
            );
        });

        it('should handle AuthzForce service unavailable', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                code: 'ECONNREFUSED',
                message: 'connect ECONNREFUSED 127.0.0.1:8282'
            });

            await expect(evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput)).rejects.toThrow(
                'XACML evaluation failed'
            );
        });

        it('should parse XACML Advice correctly', async () => {
            const authzForceResponseXML = createXACMLResponseXML('Permit', undefined, undefined, [
                {
                    Id: 'mfa-recommended',
                    AttributeAssignment: [
                        { AttributeId: 'reason', Value: 'High-value resource' }
                    ]
                }
            ]);

            mockedAxios.post.mockResolvedValueOnce({ data: authzForceResponseXML });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            expect(result.advice).toBeDefined();
            expect(result.advice?.length).toBeGreaterThan(0);
            expect(result.advice?.[0].type).toBe('MFA-RECOMMENDED'); // Uppercase as parsed from XML
        });

        it('should measure latency correctly', async () => {
            const authzForceResponseXML = createXACMLResponseXML('Permit');

            mockedAxios.post.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => resolve({ data: authzForceResponseXML }), 80);
                });
            });

            const result = await evaluateXACML(createExecutionContext(mockXACMLPolicy), mockUnifiedInput);

            // ✅ GOOD: Only test what matters (performance regression)
            expect(result.evaluation_details.latency_ms).toBeGreaterThan(0);        // Sanity: latency exists
            expect(result.evaluation_details.latency_ms).toBeLessThan(1000);        // Performance: not too slow
            expect(typeof result.evaluation_details.latency_ms).toBe('number');      // Type safety
        });
    });
});

