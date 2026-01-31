/**
 * ACP-240 Key Split Combiner Service
 * 
 * Implements KAS-REQ-003, KAS-REQ-004: Key Split Recombination (All-Of Mode)
 * 
 * Phase 4.1.2: Optional Features - Key Split Recombination
 * 
 * Features:
 * - Support splitMode: "allOf" for multi-KAS key splitting
 * - XOR recombination for 2-5 key splits
 * - Policy binding validation across all splits
 * - Parallel KAS federation calls
 * - Comprehensive error handling and logging
 */

import crypto from 'crypto';
import { kasLogger } from '../utils/kas-logger';
import { IKeyAccessObject, IPolicy } from '../types/rewrap.types';
import { recombineKeySplits } from '../utils/crypto/rewrap';

// ============================================
// Type Definitions
// ============================================

/**
 * Split Mode Configuration
 */
export type SplitMode = 'allOf' | 'anyOf' | 'single';

/**
 * Key Split Group
 */
export interface IKeySplitGroup {
    /** Split mode for this group */
    splitMode: SplitMode;

    /** Key Access Objects in this group */
    keyAccessObjects: IKeyAccessObject[];

    /** Policy governing this group */
    policy: IPolicy;

    /** Expected number of splits */
    expectedSplits: number;
}

/**
 * Key Split Validation Result
 */
export interface IKeySplitValidationResult {
    /** Validation passed */
    valid: boolean;

    /** Reason for validation failure (if invalid) */
    reason?: string;

    /** Policy binding mismatches */
    mismatches?: IPolicyBindingMismatch[];

    /** Number of splits validated */
    splitsValidated?: number;
}

/**
 * Policy Binding Mismatch
 */
export interface IPolicyBindingMismatch {
    /** KAO identifier */
    keyAccessObjectId: string;

    /** Expected policy binding */
    expectedBinding: string;

    /** Actual policy binding */
    actualBinding: string;
}

/**
 * Key Recombination Options
 */
export interface IKeyCombinationOptions {
    /** Recombination method (default: xor) */
    method?: 'xor' | 'aes-kw' | 'shamir';

    /** Validate policy bindings (default: true) */
    validatePolicyBindings?: boolean;

    /** Expected policy for validation */
    expectedPolicy?: IPolicy;

    /** Minimum number of splits required (2-5) */
    minSplits?: number;

    /** Maximum number of splits allowed (2-5) */
    maxSplits?: number;
}

/**
 * Key Recombination Result
 */
export interface IKeyCombinationResult {
    /** Combined DEK */
    dek: Buffer;

    /** Number of splits combined */
    splitsCombined: number;

    /** Recombination method used */
    method: string;

    /** Split sources (KAO IDs) */
    sources: string[];

    /** Validation result */
    validation: IKeySplitValidationResult;
}

// ============================================
// Key Combiner Service
// ============================================

export class KeyCombinerService {
    /**
     * Detect split mode from KeyAccessObjects
     * 
     * @param kaos - Array of Key Access Objects
     * @returns Detected split mode
     */
    detectSplitMode(kaos: IKeyAccessObject[]): SplitMode {
        if (kaos.length === 1) {
            return 'single';
        }

        // Check if any KAO specifies splitMode (future extension)
        const firstKao = kaos[0] as any;
        if (firstKao.splitMode) {
            return firstKao.splitMode as SplitMode;
        }

        // Default: If multiple KAOs with same policy, assume allOf
        // This is a heuristic - proper implementation should have explicit splitMode field
        const policyBindings = new Set(kaos.map(kao => kao.policyBinding));
        
        if (policyBindings.size === 1 && kaos.length > 1) {
            // All KAOs have same policy binding -> likely allOf
            kasLogger.debug('Detected allOf split mode (same policy binding)', {
                kaoCount: kaos.length,
                policyBinding: kaos[0].policyBinding,
            });
            return 'allOf';
        }

        // Default to single (process each KAO independently)
        return 'single';
    }

    /**
     * Validate split mode configuration
     * 
     * @param splitMode - Split mode to validate
     * @param splitCount - Number of splits
     * @returns Validation result
     */
    validateSplitMode(splitMode: SplitMode, splitCount: number): IKeySplitValidationResult {
        if (splitMode === 'single') {
            if (splitCount !== 1) {
                return {
                    valid: false,
                    reason: `Single split mode requires exactly 1 KAO, got ${splitCount}`,
                };
            }
            return { valid: true, splitsValidated: 1 };
        }

        if (splitMode === 'allOf') {
            if (splitCount < 2) {
                return {
                    valid: false,
                    reason: `All-Of split mode requires at least 2 KAOs, got ${splitCount}`,
                };
            }

            if (splitCount > 5) {
                return {
                    valid: false,
                    reason: `All-Of split mode supports max 5 KAOs, got ${splitCount}`,
                };
            }

            return { valid: true, splitsValidated: splitCount };
        }

        if (splitMode === 'anyOf') {
            if (splitCount < 1) {
                return {
                    valid: false,
                    reason: `Any-Of split mode requires at least 1 KAO`,
                };
            }

            return { valid: true, splitsValidated: splitCount };
        }

        return {
            valid: false,
            reason: `Unsupported split mode: ${splitMode}`,
        };
    }

    /**
     * Validate policy bindings across all key splits
     * 
     * @param keySplits - Array of unwrapped key splits
     * @param kaos - Corresponding Key Access Objects
     * @param expectedPolicy - Expected policy
     * @returns Validation result
     */
    validatePolicyBindings(
        keySplits: Buffer[],
        kaos: IKeyAccessObject[],
        expectedPolicy: IPolicy
    ): IKeySplitValidationResult {
        if (keySplits.length !== kaos.length) {
            return {
                valid: false,
                reason: `Key split count mismatch: ${keySplits.length} splits vs ${kaos.length} KAOs`,
            };
        }

        const mismatches: IPolicyBindingMismatch[] = [];

        // Compute expected policy binding for each split
        for (let i = 0; i < keySplits.length; i++) {
            const keySplit = keySplits[i];
            const kao = kaos[i];

            // Compute expected policy binding (HMAC-SHA256)
            const policyJson = JSON.stringify(expectedPolicy, Object.keys(expectedPolicy).sort());
            const expectedBinding = crypto
                .createHmac('sha256', keySplit)
                .update(policyJson, 'utf8')
                .digest('base64');

            if (expectedBinding !== kao.policyBinding) {
                mismatches.push({
                    keyAccessObjectId: kao.keyAccessObjectId,
                    expectedBinding,
                    actualBinding: kao.policyBinding,
                });

                kasLogger.warn('Policy binding mismatch', {
                    keyAccessObjectId: kao.keyAccessObjectId,
                    expectedBinding: expectedBinding.substring(0, 16) + '...',
                    actualBinding: kao.policyBinding.substring(0, 16) + '...',
                });
            }
        }

        if (mismatches.length > 0) {
            return {
                valid: false,
                reason: `Policy binding mismatches in ${mismatches.length} splits`,
                mismatches,
                splitsValidated: keySplits.length,
            };
        }

        kasLogger.info('Policy binding validation passed', {
            splitsValidated: keySplits.length,
        });

        return {
            valid: true,
            splitsValidated: keySplits.length,
        };
    }

    /**
     * Combine multiple key splits into a single DEK
     * 
     * @param keySplits - Array of unwrapped key splits (Buffers)
     * @param kaos - Corresponding Key Access Objects
     * @param options - Combination options
     * @returns Combined key result
     */
    async combineKeySplits(
        keySplits: Buffer[],
        kaos: IKeyAccessObject[],
        options: IKeyCombinationOptions = {}
    ): Promise<IKeyCombinationResult> {
        const method = options.method || 'xor';
        const validateBindings = options.validatePolicyBindings !== false;
        const minSplits = options.minSplits || 2;
        const maxSplits = options.maxSplits || 5;

        try {
            // Validate split count
            if (keySplits.length < minSplits) {
                throw new Error(
                    `Insufficient key splits: ${keySplits.length} (minimum: ${minSplits})`
                );
            }

            if (keySplits.length > maxSplits) {
                throw new Error(
                    `Too many key splits: ${keySplits.length} (maximum: ${maxSplits})`
                );
            }

            kasLogger.info('Combining key splits', {
                splitCount: keySplits.length,
                method,
                kaoIds: kaos.map(kao => kao.keyAccessObjectId),
            });

            // Validate all splits have same length
            const firstLength = keySplits[0].length;
            for (let i = 1; i < keySplits.length; i++) {
                if (keySplits[i].length !== firstLength) {
                    throw new Error(
                        `Key split length mismatch: split[0]=${firstLength} bytes, split[${i}]=${keySplits[i].length} bytes`
                    );
                }
            }

            // Validate policy bindings (if requested)
            let validation: IKeySplitValidationResult = { valid: true };
            if (validateBindings && options.expectedPolicy) {
                validation = this.validatePolicyBindings(keySplits, kaos, options.expectedPolicy);

                if (!validation.valid) {
                    throw new Error(`Policy binding validation failed: ${validation.reason}`);
                }
            }

            // Recombine splits using specified method
            const dek = recombineKeySplits(keySplits, method);

            kasLogger.info('Key splits combined successfully', {
                splitsCombined: keySplits.length,
                method,
                dekLength: dek.length,
                sources: kaos.map(kao => kao.keyAccessObjectId),
            });

            return {
                dek,
                splitsCombined: keySplits.length,
                method,
                sources: kaos.map(kao => kao.keyAccessObjectId),
                validation,
            };

        } catch (error) {
            kasLogger.error('Key split recombination failed', {
                splitCount: keySplits.length,
                method,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new Error(
                `Failed to combine key splits: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    /**
     * Validate key split length compatibility
     * 
     * @param splits - Array of key splits
     * @returns True if all splits have same length
     */
    validateSplitLengths(splits: Buffer[]): boolean {
        if (splits.length === 0) {
            return false;
        }

        const firstLength = splits[0].length;
        return splits.every(split => split.length === firstLength);
    }

    /**
     * Extract key splits from unwrapped KAOs
     * 
     * @param unwrappedResults - Array of unwrapped key materials
     * @returns Array of key splits (Buffers)
     */
    extractSplitsFromUnwrapped(unwrappedResults: any[]): Buffer[] {
        return unwrappedResults.map(result => {
            if (result.keySplit && Buffer.isBuffer(result.keySplit)) {
                return result.keySplit;
            }
            throw new Error('Invalid unwrapped result: missing or invalid keySplit');
        });
    }
}

// ============================================
// Singleton Export
// ============================================

export const keyCombinerService = new KeyCombinerService();
