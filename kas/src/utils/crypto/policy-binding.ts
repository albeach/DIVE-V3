/**
 * Policy Binding Verification Utilities
 * 
 * Implements HMAC-based policy integrity verification per ACP-240
 * Reference: KAS-REQ-042, KAS-REQ-043, Phase 2.3
 * 
 * CRITICAL SECURITY: Prevents policy tampering attacks
 */

import crypto from 'crypto';
import { kasLogger } from '../kas-logger';
import { IPolicy, IPolicyBindingResult } from '../../types/rewrap.types';

/**
 * Canonicalize policy for deterministic hashing
 * 
 * Produces consistent JSON representation regardless of key ordering
 * or whitespace variations in original policy
 * 
 * @param policy - Policy object to canonicalize
 * @returns Canonical JSON string
 */
export function canonicalizePolicy(policy: IPolicy): string {
    // Recursive function to sort object keys
    const sortKeys = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(sortKeys);
        }

        const sorted: Record<string, any> = {};
        Object.keys(obj)
            .sort()
            .forEach((key) => {
                sorted[key] = sortKeys(obj[key]);
            });

        return sorted;
    };

    const sortedPolicy = sortKeys(policy);
    return JSON.stringify(sortedPolicy);
}

/**
 * Compute policyBinding HMAC
 * 
 * HMAC-SHA256 of canonicalized policy using unwrapped key material as key
 * 
 * @param policy - Policy to bind
 * @param keySplit - Unwrapped key material (HMAC key)
 * @returns Base64-encoded HMAC
 */
export function computePolicyBinding(
    policy: IPolicy,
    keySplit: Buffer
): string {
    const algorithm = process.env.POLICY_BINDING_ALGORITHM || 'sha256';
    const policyJson = canonicalizePolicy(policy);

    const hmac = crypto.createHmac(algorithm, keySplit);
    hmac.update(policyJson, 'utf8');

    return hmac.digest('base64');
}

/**
 * Verify policyBinding value
 * 
 * Recomputes HMAC and compares with provided binding
 * 
 * @param policy - Policy from request
 * @param keySplit - Unwrapped key material
 * @param providedBinding - policyBinding value from keyAccessObject
 * @returns Verification result
 */
export function verifyPolicyBinding(
    policy: IPolicy,
    keySplit: Buffer,
    providedBinding: string
): IPolicyBindingResult {
    try {
        const expectedBinding = computePolicyBinding(policy, keySplit);

        // Timing-safe comparison to prevent timing attacks
        const expectedBuffer = Buffer.from(expectedBinding, 'base64');
        const providedBuffer = Buffer.from(providedBinding, 'base64');

        if (expectedBuffer.length !== providedBuffer.length) {
            return {
                valid: false,
                expectedBinding,
                providedBinding,
                reason: 'Policy binding length mismatch',
            };
        }

        const equal = crypto.timingSafeEqual(expectedBuffer, providedBuffer);

        if (!equal) {
            return {
                valid: false,
                expectedBinding,
                providedBinding,
                reason: 'Policy binding verification failed: possible policy tampering',
            };
        }

        return {
            valid: true,
            expectedBinding,
            providedBinding,
        };
    } catch (error) {
        kasLogger.error('PolicyBinding verification error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
            valid: false,
            reason: `PolicyBinding computation error: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`,
        };
    }
}

/**
 * Verify multiple policy bindings (for All-Of scenarios)
 * 
 * @param policy - Policy from request
 * @param keySplits - Array of unwrapped key splits
 * @param providedBindings - Array of policyBinding values
 * @returns True if all bindings valid
 */
export function verifyMultiplePolicyBindings(
    policy: IPolicy,
    keySplits: Buffer[],
    providedBindings: string[]
): boolean {
    if (keySplits.length !== providedBindings.length) {
        return false;
    }

    for (let i = 0; i < keySplits.length; i++) {
        const result = verifyPolicyBinding(
            policy,
            keySplits[i],
            providedBindings[i]
        );

        if (!result.valid) {
            return false;
        }
    }

    return true;
}
