/**
 * XACML Adapter
 * 
 * Converts between Unified ABAC JSON format and XACML 3.0 Request/Response XML.
 * Enables consistent policy evaluation interface across OPA and AuthzForce engines.
 * 
 * Date: October 26, 2025
 */

import { Builder, parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger';
import {
    IUnifiedInput,
    INormalizedDecision,
    IObligation,
    IAdvice,
    DecisionType
} from '../types/policies-lab.types';

// XACML XML builder object types
interface IXacmlAttributeValue {
    $: { DataType: string };
    _: string;
}

interface IXacmlAttribute {
    $: { AttributeId: string; IncludeInResult: string };
    AttributeValue: IXacmlAttributeValue | IXacmlAttributeValue[];
}

interface IXacmlAttributeCategory {
    $: { Category: string };
    Attribute: IXacmlAttribute[];
}

interface IXacmlRequest {
    Request: {
        $: Record<string, string>;
        Attributes: IXacmlAttributeCategory[];
    };
}

// ============================================================================
// Unified JSON → XACML Request XML
// ============================================================================

/**
 * Convert Unified ABAC input to XACML 3.0 Request XML
 */
export function unifiedToXACMLRequest(input: IUnifiedInput): string {
    try {
        const requestObj: IXacmlRequest = {
            Request: {
                $: {
                    'xmlns': 'urn:oasis:names:tc:xacml:3.0:core:schema:wd-17',
                    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                    'ReturnPolicyIdList': 'true',
                    'CombinedDecision': 'false'
                },
                Attributes: []
            }
        };

        // Subject Attributes
        const subjectAttrs: IXacmlAttributeCategory = {
            $: { Category: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject' },
            Attribute: []
        };

        // uniqueID
        subjectAttrs.Attribute.push({
            $: { AttributeId: 'urn:dive:subject:uniqueID', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.subject.uniqueID
            }
        });

        // clearance
        subjectAttrs.Attribute.push({
            $: { AttributeId: 'urn:dive:subject:clearance', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.subject.clearance
            }
        });

        // countryOfAffiliation
        subjectAttrs.Attribute.push({
            $: { AttributeId: 'urn:dive:subject:countryOfAffiliation', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.subject.countryOfAffiliation
            }
        });

        // acpCOI (optional, multi-valued)
        if (input.subject.acpCOI && input.subject.acpCOI.length > 0) {
            const coiValues = input.subject.acpCOI.map(coi => ({
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: coi
            }));
            subjectAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:subject:acpCOI', IncludeInResult: 'false' },
                AttributeValue: coiValues
            });
        }

        // authenticated (optional)
        if (input.subject.authenticated !== undefined) {
            subjectAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:subject:authenticated', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#boolean' },
                    _: input.subject.authenticated.toString()
                }
            });
        }

        // aal (optional)
        if (input.subject.aal) {
            subjectAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:subject:aal', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                    _: input.subject.aal
                }
            });
        }

        requestObj.Request.Attributes.push(subjectAttrs);

        // Action Attributes
        const actionAttrs: IXacmlAttributeCategory = {
            $: { Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' },
            Attribute: [{
                $: { AttributeId: 'urn:oasis:names:tc:xacml:1.0:action:action-id', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                    _: input.action
                }
            }]
        };

        requestObj.Request.Attributes.push(actionAttrs);

        // Resource Attributes
        const resourceAttrs: IXacmlAttributeCategory = {
            $: { Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource' },
            Attribute: []
        };

        // resourceId
        resourceAttrs.Attribute.push({
            $: { AttributeId: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.resource.resourceId
            }
        });

        // classification
        resourceAttrs.Attribute.push({
            $: { AttributeId: 'urn:dive:resource:classification', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.resource.classification
            }
        });

        // releasabilityTo (multi-valued)
        if (input.resource.releasabilityTo && input.resource.releasabilityTo.length > 0) {
            const relValues = input.resource.releasabilityTo.map(country => ({
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: country
            }));
            resourceAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:resource:releasabilityTo', IncludeInResult: 'false' },
                AttributeValue: relValues
            });
        }

        // COI (optional, multi-valued)
        if (input.resource.COI && input.resource.COI.length > 0) {
            const coiValues = input.resource.COI.map(coi => ({
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: coi
            }));
            resourceAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:resource:COI', IncludeInResult: 'false' },
                AttributeValue: coiValues
            });
        }

        // encrypted (optional)
        if (input.resource.encrypted !== undefined) {
            resourceAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:resource:encrypted', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#boolean' },
                    _: input.resource.encrypted.toString()
                }
            });
        }

        // creationDate (optional)
        if (input.resource.creationDate) {
            resourceAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:resource:creationDate', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#dateTime' },
                    _: input.resource.creationDate
                }
            });
        }

        // sensitivity (optional)
        if (input.resource.sensitivity) {
            resourceAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:resource:sensitivity', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                    _: input.resource.sensitivity
                }
            });
        }

        requestObj.Request.Attributes.push(resourceAttrs);

        // Environment/Context Attributes
        const envAttrs: IXacmlAttributeCategory = {
            $: { Category: 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment' },
            Attribute: []
        };

        // currentTime
        envAttrs.Attribute.push({
            $: { AttributeId: 'urn:oasis:names:tc:xacml:1.0:environment:current-dateTime', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#dateTime' },
                _: input.context.currentTime
            }
        });

        // sourceIP (optional)
        if (input.context.sourceIP) {
            envAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:environment:sourceIP', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                    _: input.context.sourceIP
                }
            });
        }

        // requestId
        envAttrs.Attribute.push({
            $: { AttributeId: 'urn:dive:environment:requestId', IncludeInResult: 'false' },
            AttributeValue: {
                $: { DataType: 'http://www.w3.org/2001/XMLSchema#string' },
                _: input.context.requestId
            }
        });

        // deviceCompliant (optional)
        if (input.context.deviceCompliant !== undefined) {
            envAttrs.Attribute.push({
                $: { AttributeId: 'urn:dive:environment:deviceCompliant', IncludeInResult: 'false' },
                AttributeValue: {
                    $: { DataType: 'http://www.w3.org/2001/XMLSchema#boolean' },
                    _: input.context.deviceCompliant.toString()
                }
            });
        }

        requestObj.Request.Attributes.push(envAttrs);

        // Build XML
        const builder = new Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '  ', newline: '\n' }
        });

        const xml = builder.buildObject(requestObj);
        return xml;

    } catch (error) {
        logger.error('Failed to convert Unified input to XACML Request', { error: error.message });
        throw new Error('XACML Request conversion failed');
    }
}

// ============================================================================
// XACML Response XML → Normalized Decision
// ============================================================================

/**
 * Parse XACML 3.0 Response XML and normalize to unified decision format
 */
export async function normalizeXACMLResponse(
    responseXML: string,
    policyMetadata: { id: string; type: 'xacml'; packageOrPolicyId: string; name: string },
    unifiedInput: IUnifiedInput,
    latency_ms: number
): Promise<INormalizedDecision> {
    try {
        // Parse XML
        const parsed = await parseStringPromise(responseXML, {
            explicitArray: false,
            mergeAttrs: true
        });

        const response = parsed.Response;
        const result = response.Result;

        // Extract decision
        const xacmlDecision = result.Decision;
        const decision = mapXACMLDecision(xacmlDecision);

        // Extract status/reason
        // const statusCode = result.Status?.StatusCode?.Value || 'urn:oasis:names:tc:xacml:1.0:status:ok';
        const statusMessage = result.Status?.StatusMessage || '';

        // Determine reason
        let reason = `XACML decision: ${xacmlDecision}`;
        if (statusMessage) {
            reason += ` - ${statusMessage}`;
        }

        // Extract policy IDs that matched
        const policyIds: string[] = [];
        if (result.PolicyIdentifierList) {
            const policyRefs = result.PolicyIdentifierList.PolicyIdReference;
            if (policyRefs) {
                const refs = Array.isArray(policyRefs) ? policyRefs : [policyRefs];
                policyIds.push(...refs);
            }
        }

        if (policyIds.length > 0) {
            reason = `Policy '${policyIds.join(', ')}' returned ${xacmlDecision}`;
        }

        // Extract obligations
        const obligations: IObligation[] = [];
        if (result.Obligations?.Obligation) {
            const obligationList = Array.isArray(result.Obligations.Obligation)
                ? result.Obligations.Obligation
                : [result.Obligations.Obligation];

            for (const obl of obligationList) {
                const obligationType = obl.ObligationId.replace('urn:dive:obligation:', '').toUpperCase();
                const params: Record<string, unknown> = {};

                if (obl.AttributeAssignment) {
                    const assignments = Array.isArray(obl.AttributeAssignment)
                        ? obl.AttributeAssignment
                        : [obl.AttributeAssignment];

                    for (const assignment of assignments) {
                        const paramName = assignment.AttributeId.replace('urn:dive:obligation:param:', '');
                        params[paramName] = assignment._;
                    }
                }

                obligations.push({
                    type: obligationType,
                    params
                });
            }
        }

        // Extract advice
        const advice: IAdvice[] = [];
        if (result.AssociatedAdvice?.Advice) {
            const adviceList = Array.isArray(result.AssociatedAdvice.Advice)
                ? result.AssociatedAdvice.Advice
                : [result.AssociatedAdvice.Advice];

            for (const adv of adviceList) {
                const adviceType = adv.AdviceId.replace('urn:dive:advice:', '').toUpperCase();
                const params: Record<string, unknown> = {};

                if (adv.AttributeAssignment) {
                    const assignments = Array.isArray(adv.AttributeAssignment)
                        ? adv.AttributeAssignment
                        : [adv.AttributeAssignment];

                    for (const assignment of assignments) {
                        const paramName = assignment.AttributeId.replace('urn:dive:advice:param:', '');
                        params[paramName] = assignment._;
                    }
                }

                advice.push({
                    type: adviceType,
                    params
                });
            }
        }

        // Build trace (XACML doesn't provide detailed trace, so we create a summary)
        const trace = [{
            rule: policyIds.length > 0 ? policyIds[0] : 'unknown',
            result: decision === 'PERMIT' || decision === 'ALLOW',
            reason: reason
        }];

        // Generate Rego input format for comparison
        const rego_input = {
            input: {
                subject: unifiedInput.subject,
                action: unifiedInput.action,
                resource: unifiedInput.resource,
                context: unifiedInput.context
            }
        };

        // Generate XACML request for reference
        const xacml_request = unifiedToXACMLRequest(unifiedInput);

        return {
            engine: 'xacml',
            decision,
            reason,
            obligations,
            advice,
            evaluation_details: {
                latency_ms,
                policy_version: '1.0',
                trace
            },
            policy_metadata: policyMetadata,
            inputs: {
                unified: unifiedInput,
                rego_input,
                xacml_request
            }
        };

    } catch (error) {
        logger.error('Failed to normalize XACML Response', { error: error.message });
        throw new Error('XACML Response normalization failed');
    }
}

/**
 * Map XACML decision to unified decision type
 */
function mapXACMLDecision(xacmlDecision: string): DecisionType {
    switch (xacmlDecision) {
        case 'Permit':
            return 'PERMIT';
        case 'Deny':
            return 'DENY';
        case 'NotApplicable':
            return 'NOT_APPLICABLE';
        case 'Indeterminate':
            return 'INDETERMINATE';
        default:
            return 'INDETERMINATE';
    }
}
