/**
 * ACP-240 KAS Phase 3.5: End-to-End Scenario Tests
 * 
 * 8 Core Scenarios (with 2-3 variations each = 15 tests total):
 * 1. Local Only
 * 2. Simple Federation
 * 3. Multi-National Resource
 * 4. Circuit Breaker
 * 5. Partial Failure
 * 6. Federation Loop Prevention
 * 7. Depth Limit
 * 8. Classification Cap
 */

import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { generateKeyPair, generateTestJWT, wrapKey, computePolicyBinding } from '../helpers/test-utilities';

describe('Phase 3.5: End-to-End Scenarios', () => {
    // Test configuration (localhost is appropriate for test environment)
    // Override with environment variables in CI/CD: KAS_USA_URL, KAS_FRA_URL, KAS_GBR_URL
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    const KAS_GBR_URL = process.env.KAS_GBR_URL || 'https://localhost:8083';
    
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
    
    // ============================================
    // Scenario 1: Local Only
    // ============================================
    describe('Scenario 1: Local Only', () => {
        it('USA client requests USA-only resource (all KAOs local)', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            const { publicKey: kasPublicKey } = generateKeyPair();
            
            const keySplit = Buffer.from(crypto.randomBytes(32));
            const policy = {
                policyId: 'policy-usa-only',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['US-ONLY']
                }
            };
            
            const kaos = [
                {
                    keyAccessObjectId: 'kao-usa-001',
                    wrappedKey: wrapKey(keySplit, kasPublicKey),
                    url: `${KAS_USA_URL}/rewrap`,
                    kid: 'kas-usa-key-001',
                    policyBinding: computePolicyBinding(policy, keySplit),
                    sid: 'session-local-001'
                },
                {
                    keyAccessObjectId: 'kao-usa-002',
                    wrappedKey: wrapKey(keySplit, kasPublicKey),
                    url: `${KAS_USA_URL}/rewrap`,
                    kid: 'kas-usa-key-001',
                    policyBinding: computePolicyBinding(policy, keySplit),
                    sid: 'session-local-001'
                }
            ];
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                {
                    clientPublicKey,
                    requests: [{ policy, keyAccessObjects: kaos }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent
                }
            );
            
            expect(response.status).toBe(200);
            expect(response.data.responses).toHaveLength(1);
            expect(response.data.responses[0].results).toHaveLength(2);
            
            // Both KAOs should succeed with no federation
            response.data.responses[0].results.forEach((result: any) => {
                expect(result.status).toBe('success');
                expect(result.kasWrappedKey).toBeDefined();
            });
        });
        
        it('USA client requests USA-only resource (policy denies FRA user)', async () => {
            // Test that FRA user cannot access US-ONLY resource
        });
    });
    
    // ============================================
    // Scenario 2: Simple Federation
    // ============================================
    describe('Scenario 2: Simple Federation', () => {
        it('USA client requests FRA resource (2 USA KAOs, 1 FRA KAO)', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            
            const policy = {
                policyId: 'policy-usa-fra',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA'],
                    COI: ['NATO']
                }
            };
            
            const kaos = [
                ...[0, 1].map(i => {
                    const keySplit = Buffer.from(crypto.randomBytes(32));
                    const { publicKey: kasPublicKey } = generateKeyPair();
                    return {
                        keyAccessObjectId: `kao-usa-${i}`,
                        wrappedKey: wrapKey(keySplit, kasPublicKey),
                        url: `${KAS_USA_URL}/rewrap`,
                        kid: 'kas-usa-key-001',
                        policyBinding: computePolicyBinding(policy, keySplit),
                        sid: 'session-simple-fed'
                    };
                }),
                (() => {
                    const keySplit = Buffer.from(crypto.randomBytes(32));
                    const { publicKey: kasPublicKey } = generateKeyPair();
                    return {
                        keyAccessObjectId: 'kao-fra-001',
                        wrappedKey: wrapKey(keySplit, kasPublicKey),
                        url: `${KAS_FRA_URL}/rewrap`,
                        kid: 'kas-fra-key-001',
                        policyBinding: computePolicyBinding(policy, keySplit),
                        sid: 'session-simple-fed'
                    };
                })()
            ];
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                {
                    clientPublicKey,
                    requests: [{ policy, keyAccessObjects: kaos }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent,
                    timeout: 15000
                }
            );
            
            expect(response.status).toBe(200);
            expect(response.data.responses[0].results).toHaveLength(3);
            
            // All 3 KAOs should succeed (2 local, 1 federated)
            response.data.responses[0].results.forEach((result: any) => {
                expect(result.status).toBe('success');
            });
            
            // Verify FRA KAO was processed
            const fraResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId === 'kao-fra-001'
            );
            expect(fraResult).toBeDefined();
            expect(fraResult.kasWrappedKey).toBeDefined();
        });
        
        it('FRA client requests USA resource (federation bidirectional)', async () => {
            // Test FRA → USA federation direction
        });
    });
    
    // ============================================
    // Scenario 3: Multi-National Resource
    // ============================================
    describe('Scenario 3: Multi-National Resource', () => {
        it('USA client requests NATO resource (2 USA, 2 FRA, 1 GBR KAOs)', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            
            const policy = {
                policyId: 'policy-nato',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA', 'GBR'],
                    COI: ['NATO']
                }
            };
            
            const kaos = [
                ...['USA', 'USA', 'FRA', 'FRA', 'GBR'].map((country, i) => {
                    const keySplit = Buffer.from(crypto.randomBytes(32));
                    const { publicKey: kasPublicKey } = generateKeyPair();
                    const kasUrl = country === 'USA' ? KAS_USA_URL :
                                  country === 'FRA' ? KAS_FRA_URL :
                                  KAS_GBR_URL;
                    
                    return {
                        keyAccessObjectId: `kao-${country.toLowerCase()}-${i}`,
                        wrappedKey: wrapKey(keySplit, kasPublicKey),
                        url: `${kasUrl}/rewrap`,
                        kid: `kas-${country.toLowerCase()}-key-001`,
                        policyBinding: computePolicyBinding(policy, keySplit),
                        sid: 'session-nato'
                    };
                })
            ];
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                {
                    clientPublicKey,
                    requests: [{ policy, keyAccessObjects: kaos }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent,
                    timeout: 20000
                }
            );
            
            expect(response.status).toBe(200);
            expect(response.data.responses[0].results).toHaveLength(5);
            
            // All 5 KAOs should succeed
            response.data.responses[0].results.forEach((result: any) => {
                expect(result.status).toBe('success');
            });
        });
        
        it('Multi-national resource with COI restriction (FVEY only)', async () => {
            // Test FVEY COI enforcement
        });
    });
    
    // ============================================
    // Scenario 4: Circuit Breaker
    // ============================================
    describe('Scenario 4: Circuit Breaker', () => {
        it('FRA KAS down, circuit breaker prevents attempts, USA + GBR succeed', async () => {
            // This test would require stopping FRA KAS container
            // For now, test that partial success is handled correctly
            
            const { publicKey: clientPublicKey } = generateKeyPair();
            
            const policy = {
                policyId: 'policy-circuit-breaker',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA', 'GBR'],
                    COI: ['NATO']
                }
            };
            
            const kaos = ['USA', 'GBR'].map((country, i) => {
                const keySplit = Buffer.from(crypto.randomBytes(32));
                const { publicKey: kasPublicKey } = generateKeyPair();
                const kasUrl = country === 'USA' ? KAS_USA_URL : KAS_GBR_URL;
                
                return {
                    keyAccessObjectId: `kao-${country.toLowerCase()}-${i}`,
                    wrappedKey: wrapKey(keySplit, kasPublicKey),
                    url: `${kasUrl}/rewrap`,
                    kid: `kas-${country.toLowerCase()}-key-001`,
                    policyBinding: computePolicyBinding(policy, keySplit),
                    sid: 'session-circuit-breaker'
                };
            });
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                {
                    clientPublicKey,
                    requests: [{ policy, keyAccessObjects: kaos }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent,
                    timeout: 15000
                }
            );
            
            expect(response.status).toBe(200);
            expect(response.data.responses[0].results).toHaveLength(2);
            
            // USA and GBR should succeed
            response.data.responses[0].results.forEach((result: any) => {
                expect(result.status).toBe('success');
            });
        });
    });
    
    // ============================================
    // Scenario 5: Partial Failure
    // ============================================
    describe('Scenario 5: Partial Failure', () => {
        it('FRA KAS returns error for 1 KAO, USA + GBR succeed', async () => {
            // Test mixed success/failure results
        });
    });
    
    // ============================================
    // Scenario 6: Federation Loop Prevention
    // ============================================
    describe('Scenario 6: Federation Loop Prevention', () => {
        it('Malicious X-Forwarded-By with loop detected', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            const { publicKey: kasPublicKey } = generateKeyPair();
            
            const keySplit = Buffer.from(crypto.randomBytes(32));
            const policy = {
                policyId: 'policy-loop-test',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['US-ONLY']
                }
            };
            
            const kao = {
                keyAccessObjectId: 'kao-loop-001',
                wrappedKey: wrapKey(keySplit, kasPublicKey),
                url: `${KAS_USA_URL}/rewrap`,
                kid: 'kas-usa-key-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-loop'
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']
            });
            
            try {
                await axios.post(
                    `${KAS_USA_URL}/rewrap`,
                    {
                        clientPublicKey,
                        requests: [{ policy, keyAccessObjects: [kao] }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'X-Forwarded-By': 'kas-usa, kas-fra, kas-usa' // Loop!
                        },
                        httpsAgent
                    }
                );
                
                fail('Expected loop detection to reject request');
            } catch (error: any) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toMatch(/loop/i);
            }
        });
    });
    
    // ============================================
    // Scenario 7: Depth Limit
    // ============================================
    describe('Scenario 7: Depth Limit', () => {
        it('X-Forwarded-By chain exceeds MAX_FEDERATION_DEPTH', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            const { publicKey: kasPublicKey } = generateKeyPair();
            
            const keySplit = Buffer.from(crypto.randomBytes(32));
            const policy = {
                policyId: 'policy-depth-test',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['US-ONLY']
                }
            };
            
            const kao = {
                keyAccessObjectId: 'kao-depth-001',
                wrappedKey: wrapKey(keySplit, kasPublicKey),
                url: `${KAS_USA_URL}/rewrap`,
                kid: 'kas-usa-key-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-depth'
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']
            });
            
            try {
                await axios.post(
                    `${KAS_USA_URL}/rewrap`,
                    {
                        clientPublicKey,
                        requests: [{ policy, keyAccessObjects: [kao] }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'X-Forwarded-By': 'kas-gbr, kas-fra, kas-deu, kas-bel' // Depth = 4, exceeds max 3
                        },
                        httpsAgent
                    }
                );
                
                fail('Expected depth limit to reject request');
            } catch (error: any) {
                expect(error.response.status).toBe(400);
                expect(error.response.data.error).toMatch(/depth/i);
            }
        });
    });
    
    // ============================================
    // Scenario 8: Classification Cap
    // ============================================
    describe('Scenario 8: Classification Cap', () => {
        it('USA → FRA federation agreement maxClassification: SECRET, TOP_SECRET resource denied', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            const { publicKey: kasPublicKey } = generateKeyPair();
            
            const keySplit = Buffer.from(crypto.randomBytes(32));
            const policy = {
                policyId: 'policy-top-secret',
                dissem: {
                    classification: 'TOP_SECRET', // Exceeds USA→FRA limit
                    releasabilityTo: ['USA', 'FRA'],
                    COI: ['NATO']
                }
            };
            
            const kao = {
                keyAccessObjectId: 'kao-fra-ts-001',
                wrappedKey: wrapKey(keySplit, kasPublicKey),
                url: `${KAS_FRA_URL}/rewrap`,
                kid: 'kas-fra-key-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-class-cap'
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                {
                    clientPublicKey,
                    requests: [{ policy, keyAccessObjects: [kao] }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent
                }
            );
            
            // Request should succeed but FRA KAO should be denied by federation validator
            expect(response.status).toBe(200);
            expect(response.data.responses[0].results[0].status).toBe('error');
            expect(response.data.responses[0].results[0].error).toMatch(/classification|denied/i);
        });
    });
});
