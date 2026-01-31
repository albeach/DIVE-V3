/**
 * Unit Tests: Key Combiner Service
 * 
 * Phase 4.1.2: Key Split Recombination (All-Of Mode)
 * 
 * Test Coverage:
 * - Split mode detection
 * - Split mode validation
 * - XOR recombination (2, 3, 5 splits)
 * - Policy binding validation across splits
 * - Split length validation
 * - Error handling (mismatched lengths, invalid count)
 */

import crypto from 'crypto';
import {
    KeyCombinerService,
    SplitMode,
    IKeySplitValidationResult,
    IKeyCombinationOptions,
} from '../services/key-combiner';
import { IKeyAccessObject, IPolicy } from '../types/rewrap.types';

describe('KeyCombinerService', () => {
    let service: KeyCombinerService;

    beforeEach(() => {
        service = new KeyCombinerService();
    });

    // ============================================
    // Test 1: Split Mode Detection
    // ============================================
    describe('detectSplitMode', () => {
        test('should detect single mode for 1 KAO', () => {
            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'binding-1',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const splitMode = service.detectSplitMode(kaos);
            expect(splitMode).toBe('single');
        });

        test('should detect allOf mode for multiple KAOs with same policy binding', () => {
            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'same-binding',
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: 'same-binding',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const splitMode = service.detectSplitMode(kaos);
            expect(splitMode).toBe('allOf');
        });

        test('should detect single mode for multiple KAOs with different policy bindings', () => {
            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'binding-1',
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: 'binding-2',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const splitMode = service.detectSplitMode(kaos);
            expect(splitMode).toBe('single');
        });
    });

    // ============================================
    // Test 2: Split Mode Validation
    // ============================================
    describe('validateSplitMode', () => {
        test('should validate single mode with 1 split', () => {
            const result = service.validateSplitMode('single', 1);
            expect(result.valid).toBe(true);
            expect(result.splitsValidated).toBe(1);
        });

        test('should reject single mode with multiple splits', () => {
            const result = service.validateSplitMode('single', 2);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('exactly 1 KAO');
        });

        test('should validate allOf mode with 2 splits', () => {
            const result = service.validateSplitMode('allOf', 2);
            expect(result.valid).toBe(true);
            expect(result.splitsValidated).toBe(2);
        });

        test('should validate allOf mode with 5 splits', () => {
            const result = service.validateSplitMode('allOf', 5);
            expect(result.valid).toBe(true);
            expect(result.splitsValidated).toBe(5);
        });

        test('should reject allOf mode with < 2 splits', () => {
            const result = service.validateSplitMode('allOf', 1);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('at least 2 KAOs');
        });

        test('should reject allOf mode with > 5 splits', () => {
            const result = service.validateSplitMode('allOf', 6);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('max 5 KAOs');
        });

        test('should validate anyOf mode with 1+ splits', () => {
            const result = service.validateSplitMode('anyOf', 3);
            expect(result.valid).toBe(true);
            expect(result.splitsValidated).toBe(3);
        });
    });

    // ============================================
    // Test 3: XOR Recombination
    // ============================================
    describe('combineKeySplits - XOR', () => {
        test('should combine 2 key splits using XOR', async () => {
            // Create test DEK
            const originalDek = crypto.randomBytes(32);

            // Split DEK into 2 parts using XOR
            const split1 = crypto.randomBytes(32);
            const split2 = Buffer.from(
                originalDek.map((byte, i) => byte ^ split1[i])
            );

            const policy: IPolicy = {
                policyId: 'policy-1',
                dissem: { classification: 'SECRET' },
            };

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: crypto
                        .createHmac('sha256', split1)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: crypto
                        .createHmac('sha256', split2)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const result = await service.combineKeySplits([split1, split2], kaos, {
                method: 'xor',
                validatePolicyBindings: true,
                expectedPolicy: policy,
            });

            expect(result.dek).toEqual(originalDek);
            expect(result.splitsCombined).toBe(2);
            expect(result.method).toBe('xor');
            expect(result.sources).toEqual(['kao-1', 'kao-2']);
            expect(result.validation.valid).toBe(true);
        });

        test('should combine 3 key splits using XOR', async () => {
            const originalDek = crypto.randomBytes(32);
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);
            const split3 = Buffer.from(
                originalDek.map((byte, i) => byte ^ split1[i] ^ split2[i])
            );

            const policy: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: crypto
                        .createHmac('sha256', split1)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: crypto
                        .createHmac('sha256', split2)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-3',
                    wrappedKey: 'test3',
                    url: 'https://kas-gbr.example.com',
                    kid: 'key-3',
                    policyBinding: crypto
                        .createHmac('sha256', split3)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const result = await service.combineKeySplits([split1, split2, split3], kaos, {
                method: 'xor',
                validatePolicyBindings: true,
                expectedPolicy: policy,
            });

            expect(result.dek).toEqual(originalDek);
            expect(result.splitsCombined).toBe(3);
        });

        test('should combine 5 key splits using XOR', async () => {
            const originalDek = crypto.randomBytes(32);
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);
            const split3 = crypto.randomBytes(32);
            const split4 = crypto.randomBytes(32);
            const split5 = Buffer.from(
                originalDek.map((byte, i) => 
                    byte ^ split1[i] ^ split2[i] ^ split3[i] ^ split4[i]
                )
            );

            const policy: IPolicy = {
                dissem: { classification: 'TOP_SECRET' },
            };

            const kaos: IKeyAccessObject[] = [split1, split2, split3, split4, split5].map((split, idx) => ({
                keyAccessObjectId: `kao-${idx + 1}`,
                wrappedKey: `test${idx + 1}`,
                url: `https://kas-${idx}.example.com`,
                kid: `key-${idx + 1}`,
                policyBinding: crypto
                    .createHmac('sha256', split)
                    .update(JSON.stringify(policy, Object.keys(policy).sort()))
                    .digest('base64'),
                signature: { alg: 'RS256', sig: '' },
            }));

            const result = await service.combineKeySplits(
                [split1, split2, split3, split4, split5],
                kaos,
                {
                    method: 'xor',
                    validatePolicyBindings: true,
                    expectedPolicy: policy,
                }
            );

            expect(result.dek).toEqual(originalDek);
            expect(result.splitsCombined).toBe(5);
        });
    });

    // ============================================
    // Test 4: Policy Binding Validation
    // ============================================
    describe('validatePolicyBindings', () => {
        test('should pass validation when all bindings match', () => {
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);

            const policy: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: crypto
                        .createHmac('sha256', split1)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: crypto
                        .createHmac('sha256', split2)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const result = service.validatePolicyBindings([split1, split2], kaos, policy);

            expect(result.valid).toBe(true);
            expect(result.splitsValidated).toBe(2);
            expect(result.mismatches).toBeUndefined();
        });

        test('should fail validation on policy binding mismatch', () => {
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);

            const policy: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: crypto
                        .createHmac('sha256', split1)
                        .update(JSON.stringify(policy, Object.keys(policy).sort()))
                        .digest('base64'),
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: 'wrong-binding-value',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const result = service.validatePolicyBindings([split1, split2], kaos, policy);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('Policy binding mismatches');
            expect(result.mismatches).toHaveLength(1);
            expect(result.mismatches![0].keyAccessObjectId).toBe('kao-2');
        });

        test('should fail validation on split/KAO count mismatch', () => {
            const splits = [crypto.randomBytes(32), crypto.randomBytes(32)];
            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'binding',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            const policy: IPolicy = { dissem: {} };

            const result = service.validatePolicyBindings(splits, kaos, policy);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('count mismatch');
        });
    });

    // ============================================
    // Test 5: Error Handling
    // ============================================
    describe('Error Handling', () => {
        test('should reject insufficient splits (< 2)', async () => {
            const split = crypto.randomBytes(32);
            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'binding',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            await expect(
                service.combineKeySplits([split], kaos, { method: 'xor' })
            ).rejects.toThrow(/Insufficient key splits/);
        });

        test('should reject too many splits (> 5)', async () => {
            const splits = Array(6).fill(null).map(() => crypto.randomBytes(32));
            const kaos: IKeyAccessObject[] = splits.map((_, i) => ({
                keyAccessObjectId: `kao-${i}`,
                wrappedKey: `test${i}`,
                url: `https://kas-${i}.example.com`,
                kid: `key-${i}`,
                policyBinding: `binding-${i}`,
                signature: { alg: 'RS256', sig: '' },
            }));

            await expect(
                service.combineKeySplits(splits, kaos, { method: 'xor' })
            ).rejects.toThrow(/Too many key splits/);
        });

        test('should reject mismatched split lengths', async () => {
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(16); // Wrong length

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'binding-1',
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: 'binding-2',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            await expect(
                service.combineKeySplits([split1, split2], kaos, { 
                    method: 'xor',
                    validatePolicyBindings: false 
                })
            ).rejects.toThrow(/length mismatch/);
        });

        test('should reject on policy binding validation failure', async () => {
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);

            const policy: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const kaos: IKeyAccessObject[] = [
                {
                    keyAccessObjectId: 'kao-1',
                    wrappedKey: 'test1',
                    url: 'https://kas-usa.example.com',
                    kid: 'key-1',
                    policyBinding: 'wrong-binding',
                    signature: { alg: 'RS256', sig: '' },
                },
                {
                    keyAccessObjectId: 'kao-2',
                    wrappedKey: 'test2',
                    url: 'https://kas-fra.example.com',
                    kid: 'key-2',
                    policyBinding: 'wrong-binding',
                    signature: { alg: 'RS256', sig: '' },
                },
            ];

            await expect(
                service.combineKeySplits([split1, split2], kaos, {
                    method: 'xor',
                    validatePolicyBindings: true,
                    expectedPolicy: policy,
                })
            ).rejects.toThrow(/Policy binding validation failed/);
        });
    });

    // ============================================
    // Test 6: Split Length Validation
    // ============================================
    describe('validateSplitLengths', () => {
        test('should validate splits with same length', () => {
            const splits = [
                crypto.randomBytes(32),
                crypto.randomBytes(32),
                crypto.randomBytes(32),
            ];

            const result = service.validateSplitLengths(splits);
            expect(result).toBe(true);
        });

        test('should reject splits with different lengths', () => {
            const splits = [
                crypto.randomBytes(32),
                crypto.randomBytes(16),
                crypto.randomBytes(32),
            ];

            const result = service.validateSplitLengths(splits);
            expect(result).toBe(false);
        });

        test('should reject empty array', () => {
            const result = service.validateSplitLengths([]);
            expect(result).toBe(false);
        });
    });

    // ============================================
    // Test 7: Performance
    // ============================================
    describe('Performance', () => {
        test('should combine 5 splits in < 100ms', async () => {
            const originalDek = crypto.randomBytes(32);
            const split1 = crypto.randomBytes(32);
            const split2 = crypto.randomBytes(32);
            const split3 = crypto.randomBytes(32);
            const split4 = crypto.randomBytes(32);
            const split5 = Buffer.from(
                originalDek.map((byte, i) => 
                    byte ^ split1[i] ^ split2[i] ^ split3[i] ^ split4[i]
                )
            );

            const kaos: IKeyAccessObject[] = [split1, split2, split3, split4, split5].map((split, idx) => ({
                keyAccessObjectId: `kao-${idx}`,
                wrappedKey: `test${idx}`,
                url: `https://kas-${idx}.example.com`,
                kid: `key-${idx}`,
                policyBinding: `binding-${idx}`,
                signature: { alg: 'RS256', sig: '' },
            }));

            const startTime = Date.now();
            await service.combineKeySplits(
                [split1, split2, split3, split4, split5],
                kaos,
                { method: 'xor', validatePolicyBindings: false }
            );
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(100);
        });
    });
});
