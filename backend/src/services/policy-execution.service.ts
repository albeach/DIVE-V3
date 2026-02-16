/**
 * Policy Execution Service
 *
 * Orchestrates policy evaluation against OPA (Rego) and AuthzForce (XACML) engines.
 * Handles timeouts, error normalization, and decision logging.
 *
 * Date: October 26, 2025
 */

import axios from 'axios';
import * as https from 'https';
import { logger } from '../utils/logger';
import {
    IUnifiedInput,
    INormalizedDecision,
    PolicyType,
    DecisionType,
    IObligation,
    ITraceEntry
} from '../types/policies-lab.types';
import { unifiedToXACMLRequest, normalizeXACMLResponse } from '../adapters/xacml-adapter';
import { readPolicySource } from '../utils/policy-lab-fs.utils';

// ============================================================================
// Configuration
// ============================================================================

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const AUTHZFORCE_URL = process.env.AUTHZFORCE_URL || 'http://localhost:8282/authzforce-ce';

// Evaluation timeout: 5 seconds
const EVALUATION_TIMEOUT_MS = 5000;

// ============================================================================
// Policy Execution Interface
// ============================================================================

export interface IPolicyExecutionContext {
    policyId: string;
    userId: string;
    policyType: PolicyType;
    packageOrPolicyId: string;
    policyName: string;
}

// ============================================================================
// OPA Execution
// ============================================================================

/**
 * Evaluate policy using OPA (Rego engine)
 */
export async function evaluateRego(
    context: IPolicyExecutionContext,
    input: IUnifiedInput
): Promise<INormalizedDecision> {
    const startTime = Date.now();

    try {
        // Read policy source to upload to OPA (if not already loaded)
        const policySource = await readPolicySource(context.userId, context.policyId, 'rego');

        // Extract package path from source
        const packageMatch = policySource.match(/^\s*package\s+([a-zA-Z0-9_.]+)/m);
        const packagePath = packageMatch ? packageMatch[1] : context.packageOrPolicyId;

        // Convert package to URL path (e.g., "dive.lab.clearance" → "dive/lab/clearance")
        const policyPath = packagePath.replace(/\./g, '/');

        // Construct OPA input
        const opaInput = {
            input: {
                subject: input.subject,
                action: input.action,
                resource: input.resource,
                context: input.context
            }
        };

        // Upload policy to OPA (PUT to /v1/policies/{id})
        const httpsAgent = new https.Agent({
            minVersion: 'TLSv1.2',
            rejectUnauthorized: false, // Allow self-signed certs in development
        });

        const policyUploadUrl = `${OPA_URL}/v1/policies/${context.policyId}`;
        await axios.put(policyUploadUrl, policySource, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: EVALUATION_TIMEOUT_MS,
            httpsAgent,
        });

        logger.debug('Policy uploaded to OPA', { policyId: context.policyId, packagePath });

        // Query OPA for decision (POST to /v1/data/{package}/allow)
        const queryUrl = `${OPA_URL}/v1/data/${policyPath}`;
        const response = await axios.post(queryUrl, opaInput, {
            timeout: EVALUATION_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' },
            httpsAgent,
        });

        const latency_ms = Date.now() - startTime;

        // Parse OPA response
        const opaResult = response.data.result;

        // Extract decision (check for 'allow' field)
        const allow = opaResult?.allow === true;
        const decision: DecisionType = allow ? 'ALLOW' : 'DENY';

        // Extract reason
        let reason = opaResult?.reason || '';
        if (!reason) {
            reason = allow ? 'Policy evaluation succeeded' : 'Policy evaluation failed';
        }

        // Extract violations (if deny)
        const violations: string[] = [];
        if (!allow && opaResult) {
            // Look for violation fields (is_not_*, violation_*)
            for (const [key, value] of Object.entries(opaResult)) {
                if ((key.startsWith('is_not_') || key.startsWith('violation_')) && typeof value === 'string') {
                    violations.push(value as string);
                }
            }
        }

        if (violations.length > 0) {
            reason = violations.join('; ');
        }

        // Extract obligations
        const obligations: IObligation[] = [];
        if (opaResult?.obligations && Array.isArray(opaResult.obligations)) {
            obligations.push(...opaResult.obligations);
        }

        // Build trace from evaluation details
        const trace: ITraceEntry[] = [];
        if (opaResult?.evaluation_details?.trace && Array.isArray(opaResult.evaluation_details.trace)) {
            trace.push(...opaResult.evaluation_details.trace);
        } else {
            // Fallback trace
            trace.push({
                rule: 'allow',
                result: allow,
                reason: reason
            });
        }

        // Generate XACML request for comparison
        const xacml_request = unifiedToXACMLRequest(input);

        return {
            engine: 'opa',
            decision,
            reason,
            obligations,
            advice: [],
            evaluation_details: {
                latency_ms,
                policy_version: '1.0',
                trace
            },
            policy_metadata: {
                id: context.policyId,
                type: 'rego',
                packageOrPolicyId: context.packageOrPolicyId,
                name: context.policyName
            },
            inputs: {
                unified: input,
                rego_input: opaInput,
                xacml_request
            }
        };

    } catch (error) {
        const latency_ms = Date.now() - startTime;
        const err = error as Error & { code?: string };

        // Handle timeout
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            logger.error('OPA evaluation timeout', { policyId: context.policyId, latency_ms });
            throw new Error(`Policy evaluation exceeded ${EVALUATION_TIMEOUT_MS}ms timeout`);
        }

        // Handle other errors
        logger.error('OPA evaluation failed', {
            policyId: context.policyId,
            error: err.message,
            latency_ms
        });

        throw new Error(`OPA evaluation failed: ${err.message || 'Unknown error'}`);
    }
}

// ============================================================================
// AuthzForce (XACML) Execution
// ============================================================================

/**
 * Evaluate policy using AuthzForce (XACML engine)
 */
export async function evaluateXACML(
    context: IPolicyExecutionContext,
    input: IUnifiedInput
): Promise<INormalizedDecision> {
    const startTime = Date.now();

    try {
        // Read policy source (for validation - not currently used for AuthzForce inline submission)
        // const policySource = await readPolicySource(context.userId, context.policyId, 'xacml');

        // Upload policy to AuthzForce domain
        // Note: AuthzForce requires policies to be uploaded to a domain via REST API
        // For simplicity, we'll submit the policy inline with the request
        // In production, policies should be uploaded to the domain separately

        // Convert Unified input to XACML Request XML
        const xacmlRequest = unifiedToXACMLRequest(input);

        logger.debug('XACML Request generated', {
            policyId: context.policyId,
            requestLength: xacmlRequest.length
        });

        // Submit request to AuthzForce PDP
        // Note: In a full implementation, you'd first upload the policy to a domain,
        // then query that domain. For the lab, we'll use a test endpoint.
        const pdpUrl = `${AUTHZFORCE_URL}/domains/dive-lab/pdp`;

        const response = await axios.post(pdpUrl, xacmlRequest, {
            timeout: EVALUATION_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml'
            }
        });

        const latency_ms = Date.now() - startTime;

        const responseXML = response.data;

        logger.debug('XACML Response received', {
            policyId: context.policyId,
            responseLength: responseXML.length,
            latency_ms
        });

        // Normalize XACML response to unified format
        const normalizedDecision = await normalizeXACMLResponse(
            responseXML,
            {
                id: context.policyId,
                type: 'xacml',
                packageOrPolicyId: context.packageOrPolicyId,
                name: context.policyName
            },
            input,
            latency_ms
        );

        return normalizedDecision;

    } catch (error) {
        const latency_ms = Date.now() - startTime;
        const err = error as Error & { code?: string; response?: { data?: unknown } };

        // Handle timeout
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            logger.error('AuthzForce evaluation timeout', { policyId: context.policyId, latency_ms });
            throw new Error(`Policy evaluation exceeded ${EVALUATION_TIMEOUT_MS}ms timeout`);
        }

        // Handle other errors
        logger.error('AuthzForce evaluation failed', {
            policyId: context.policyId,
            error: err.message,
            response: err.response?.data,
            latency_ms
        });

        throw new Error(`XACML evaluation failed: ${err.message || 'Unknown error'}`);
    }
}

// ============================================================================
// Main Execution Entry Point
// ============================================================================

/**
 * Execute policy evaluation (automatically selects engine based on policy type)
 */
export async function evaluatePolicy(
    context: IPolicyExecutionContext,
    input: IUnifiedInput
): Promise<INormalizedDecision> {
    logger.info('Policy evaluation started', {
        policyId: context.policyId,
        policyType: context.policyType,
        userId: context.userId,
        action: input.action,
        resourceId: input.resource.resourceId
    });

    try {
        let result: INormalizedDecision;

        if (context.policyType === 'rego') {
            result = await evaluateRego(context, input);
        } else if (context.policyType === 'xacml') {
            result = await evaluateXACML(context, input);
        } else {
            throw new Error(`Unsupported policy type: ${context.policyType}`);
        }

        logger.info('Policy evaluation completed', {
            policyId: context.policyId,
            engine: result.engine,
            decision: result.decision,
            latency_ms: result.evaluation_details.latency_ms
        });

        return result;

    } catch (error) {
        logger.error('Policy evaluation error', {
            policyId: context.policyId,
            policyType: context.policyType,
            error: error instanceof Error ? error.message : String(error)
        });

        throw error;
    }
}
