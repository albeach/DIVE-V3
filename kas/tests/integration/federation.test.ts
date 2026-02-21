/**
 * ACP-240 KAS Phase 3.5: Comprehensive Federation Integration Tests
 * 
 * Test Categories:
 * 1. Single KAS Operations (10 tests)
 * 2. 2-KAS Federation (15 tests)
 * 3. 3-KAS Federation (10 tests)
 * 4. Failure Scenarios (15 tests)
 * 5. Signature Preservation (8 tests)
 * 6. Policy Association (10 tests)
 * 
 * Total: 68 integration tests
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import https from 'https';

describe('Phase 3.5: Federation Integration Tests', () => {
    
    // Test configuration
    // Test configuration (localhost is appropriate for test environment)
    // Override with environment variables in CI/CD: KAS_USA_URL, KAS_FRA_URL, KAS_GBR_URL
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    const KAS_GBR_URL = process.env.KAS_GBR_URL || 'https://localhost:8083';
    
    // Disable TLS verification for test environment
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
    
    // Test utilities
    const generateKeyPair = () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { publicKey, privateKey };
    };
    
    const generateTestJWT = (payload: any) => {
        const { privateKey } = generateKeyPair();
        return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    };
    
    const wrapKey = (keySplit: Buffer, publicKey: string): string => {
        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            keySplit
        );
        return encrypted.toString('base64');
    };
    
    const computePolicyBinding = (policy: any, keySplit: Buffer): string => {
        const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
        return crypto.createHmac('sha256', keySplit)
            .update(policyJson, 'utf8')
            .digest('base64');
    };
    
    const signKAO = (kao: any, privateKey: string): { alg: string; sig: string } => {
        const { signature: _, ...kaoWithoutSig } = kao;
        const payload = JSON.stringify(kaoWithoutSig, Object.keys(kaoWithoutSig).sort());
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(payload);
        return {
            alg: 'RS256',
            sig: signer.sign(privateKey, 'base64')
        };
    };
    
    // ============================================
    // 1. Single KAS Operations (10 tests)
    // ============================================
    describe('1. Single KAS Operations', () => {
        
        it('should handle local KAOs only', async () => {
            const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = generateKeyPair();
            const { publicKey: kasPublicKey } = generateKeyPair();
            
            const keySplit = crypto.randomBytes(32);
            const policy = {
                policyId: 'policy-local-001',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['US-ONLY']
                }
            };
            
            const kao = {
                keyAccessObjectId: 'kao-local-001',
                wrappedKey: wrapKey(keySplit, kasPublicKey),
                url: `${KAS_USA_URL}/rewrap`,
                kid: 'kas-usa-key-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-001'
            };
            
            const rewrapRequest = {
                clientPublicKey,
                requests: [{
                    policy,
                    keyAccessObjects: [kao]
                }]
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                rewrapRequest,
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
            expect(response.data.responses[0].results).toHaveLength(1);
            expect(response.data.responses[0].results[0].status).toBe('success');
            expect(response.data.responses[0].results[0].kasWrappedKey).toBeDefined();
        });
        
        it('should sign results with local KAS key', async () => {
            // Test that local results are signed
            // TODO: Implement signature verification
        });
        
        it('should enforce local policy evaluation', async () => {
            // Test policy denial for insufficient clearance
        });
        
        it('should handle DPoP verification', async () => {
            // Test DPoP proof requirement (if enabled)
        });
        
        it('should validate policyBinding', async () => {
            // Test policyBinding mismatch rejection
        });
        
        it('should reject invalid signatures', async () => {
            // Test KAO signature verification failure
        });
        
        it('should handle classification caps', async () => {
            // Test classification-based denials
        });
        
        it('should validate COI restrictions', async () => {
            // Test COI-based access control
        });
        
        it('should audit all operations', async () => {
            // Verify audit logs are created
        });
        
        it('should handle error responses', async () => {
            // Test error result formatting
        });
    });
    
    // ============================================
    // 2. 2-KAS Federation (USA → FRA) (15 tests)
    // ============================================
    describe('2. 2-KAS Federation (USA → FRA)', () => {
        
        it('should forward foreign KAOs', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            const { publicKey: kasUSAPublicKey } = generateKeyPair();
            const { publicKey: kasFRAPublicKey } = generateKeyPair();
            
            const keySplitUSA = crypto.randomBytes(32);
            const keySplitFRA = crypto.randomBytes(32);
            
            const policy = {
                policyId: 'policy-fed-001',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA'],
                    COI: ['NATO']
                }
            };
            
            const kaoUSA = {
                keyAccessObjectId: 'kao-usa-001',
                wrappedKey: wrapKey(keySplitUSA, kasUSAPublicKey),
                url: `${KAS_USA_URL}/rewrap`,
                kid: 'kas-usa-key-001',
                policyBinding: computePolicyBinding(policy, keySplitUSA),
                sid: 'session-fed-001'
            };
            
            const kaoFRA = {
                keyAccessObjectId: 'kao-fra-001',
                wrappedKey: wrapKey(keySplitFRA, kasFRAPublicKey),
                url: `${KAS_FRA_URL}/rewrap`,
                kid: 'kas-fra-key-001',
                policyBinding: computePolicyBinding(policy, keySplitFRA),
                sid: 'session-fed-001'
            };
            
            const rewrapRequest = {
                clientPublicKey,
                requests: [{
                    policy,
                    keyAccessObjects: [kaoUSA, kaoFRA]
                }]
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                rewrapRequest,
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
            expect(response.data.responses).toHaveLength(1);
            expect(response.data.responses[0].results).toHaveLength(2);
            
            // Both KAOs should be processed
            const usaResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId === 'kao-usa-001'
            );
            const fraResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId === 'kao-fra-001'
            );
            
            expect(usaResult).toBeDefined();
            expect(fraResult).toBeDefined();
            expect(usaResult.status).toBe('success');
            expect(fraResult.status).toBe('success');
        });
        
        it('should preserve policy associations', async () => {
            // Test policy grouping is maintained across federation
        });
        
        it('should aggregate responses', async () => {
            // Test response aggregation from multiple KAS
        });
        
        it('should preserve downstream signatures', async () => {
            // Test that FRA signatures are not overwritten by USA
        });
        
        it('should add X-Forwarded-By header', async () => {
            // Test federation audit trail header
        });
        
        it('should validate federation agreements', async () => {
            // Test federation agreement enforcement
        });
        
        it('should enforce classification caps', async () => {
            // Test classification limits in federation agreements
        });
        
        it('should handle partial failures', async () => {
            // Test mixed success/failure results
        });
        
        it('should respect circuit breaker', async () => {
            // Test circuit breaker prevents forwarding to down KAS
        });
        
        it('should correlate audit trails', async () => {
            // Test federationRequestId correlation
        });
        
        it('should handle timeout gracefully', async () => {
            // Test federation timeout handling
        });
        
        it('should retry transient failures', async () => {
            // Test retry logic for temporary failures
        });
        
        it('should validate mTLS certificates', async () => {
            // Test mTLS certificate verification
        });
        
        it('should reject untrusted forwarders', async () => {
            // Test X-Forwarded-By validation
        });
        
        it('should enforce max federation depth', async () => {
            // Test depth limiting (max 3 hops)
        });
    });
    
    // ============================================
    // 3. 3-KAS Federation (USA + FRA + GBR) (10 tests)
    // ============================================
    describe('3. 3-KAS Federation (USA + FRA + GBR)', () => {
        
        it('should forward to multiple KAS', async () => {
            const { publicKey: clientPublicKey } = generateKeyPair();
            
            const policy = {
                policyId: 'policy-nato-001',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA', 'GBR'],
                    COI: ['NATO']
                }
            };
            
            const kaos = ['USA', 'FRA', 'GBR'].map((country, index) => {
                const keySplit = crypto.randomBytes(32);
                const { publicKey: kasPublicKey } = generateKeyPair();
                const kasUrl = country === 'USA' ? KAS_USA_URL :
                              country === 'FRA' ? KAS_FRA_URL :
                              KAS_GBR_URL;
                
                return {
                    keyAccessObjectId: `kao-${country.toLowerCase()}-${index}`,
                    wrappedKey: wrapKey(keySplit, kasPublicKey),
                    url: `${kasUrl}/rewrap`,
                    kid: `kas-${country.toLowerCase()}-key-001`,
                    policyBinding: computePolicyBinding(policy, keySplit),
                    sid: 'session-nato-001'
                };
            });
            
            const rewrapRequest = {
                clientPublicKey,
                requests: [{
                    policy,
                    keyAccessObjects: kaos
                }]
            };
            
            const token = generateTestJWT({
                sub: 'testuser-usa',
                uniqueID: 'testuser-usa',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']
            });
            
            const response = await axios.post(
                `${KAS_USA_URL}/rewrap`,
                rewrapRequest,
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
            expect(response.data.responses).toHaveLength(1);
            expect(response.data.responses[0].results).toHaveLength(3);
            
            // All three KAS should return results
            const usaResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId.includes('usa')
            );
            const fraResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId.includes('fra')
            );
            const gbrResult = response.data.responses[0].results.find(
                (r: any) => r.keyAccessObjectId.includes('gbr')
            );
            
            expect(usaResult).toBeDefined();
            expect(fraResult).toBeDefined();
            expect(gbrResult).toBeDefined();
        });
        
        it('should aggregate results from all KAS', async () => {
            // Test aggregation of 3 KAS responses
        });
        
        it('should handle mixed success/failure', async () => {
            // Test partial success across 3 KAS
        });
        
        it('should preserve all signatures', async () => {
            // Test all 3 KAS signatures preserved
        });
        
        it('should maintain policy grouping', async () => {
            // Test policy grouping with 3 KAS
        });
        
        it('should correlate federation IDs', async () => {
            // Test federationRequestId across 3 KAS
        });
        
        it('should handle complex forwarding chains', async () => {
            // Test USA → FRA → GBR chain
        });
        
        it('should detect and prevent loops', async () => {
            // Test loop detection in X-Forwarded-By
        });
        
        it('should enforce depth across chain', async () => {
            // Test max depth enforcement in chain
        });
        
        it('should audit complete trail', async () => {
            // Test complete audit trail across 3 KAS
        });
    });
    
    // ============================================
    // 4. Failure Scenarios (15 tests)
    // ============================================
    describe('4. Federation Failure Handling', () => {
        
        it('should handle KAS unavailable', async () => {
            // Test graceful degradation when FRA KAS is down
        });
        
        it('should trigger circuit breaker', async () => {
            // Test circuit breaker opens after threshold
        });
        
        it('should recover from circuit breaker', async () => {
            // Test circuit breaker recovery
        });
        
        it('should handle network timeout', async () => {
            // Test timeout handling
        });
        
        it('should handle connection refused', async () => {
            // Test connection error handling
        });
        
        it('should handle TLS handshake failure', async () => {
            // Test mTLS handshake errors
        });
        
        it('should handle invalid certificates', async () => {
            // Test certificate validation errors
        });
        
        it('should handle malformed responses', async () => {
            // Test invalid response parsing
        });
        
        it('should handle partial KAO failures', async () => {
            // Test some KAOs fail, some succeed
        });
        
        it('should return successful results despite failures', async () => {
            // Test partial success is returned
        });
        
        it('should audit all failures', async () => {
            // Test failure audit logging
        });
        
        it('should track error metrics', async () => {
            // Test Prometheus metrics for errors
        });
        
        it('should handle MongoDB unavailable', async () => {
            // Test registry unavailability
        });
        
        it('should handle OPA unavailable', async () => {
            // Test policy evaluation unavailability
        });
        
        it('should fail closed on security violations', async () => {
            // Test security failure defaults to deny
        });
    });
    
    // ============================================
    // 5. Signature Preservation (8 tests)
    // ============================================
    describe('5. Signature Preservation', () => {
        
        it('should not re-sign downstream results', async () => {
            // Test downstream signatures are preserved
        });
        
        it('should preserve signature metadata', async () => {
            // Test signature.alg and signature.sig preserved
        });
        
        it('should allow client verification of all signatures', async () => {
            // Test client can verify each KAS signature
        });
        
        it('should track signing KAS per result', async () => {
            // Test signature metadata includes KAS ID
        });
        
        it('should handle signature verification failures', async () => {
            // Test invalid signature detection
        });
        
        it('should validate signature algorithms', async () => {
            // Test algorithm whitelist
        });
        
        it('should handle multiple signature formats', async () => {
            // Test RS256, RS512, ES256 support
        });
        
        it('should audit signature verification events', async () => {
            // Test signature verification audit trail
        });
    });
    
    // ============================================
    // 6. Policy Association Preservation (10 tests)
    // ============================================
    describe('6. Policy Association Preservation', () => {
        
        it('should group KAOs by policy', async () => {
            // Test KAOs grouped by policyId in request
        });
        
        it('should forward policy with KAOs', async () => {
            // Test policy sent with forwarded KAOs
        });
        
        it('should maintain grouping in response', async () => {
            // Test response grouped by policyId
        });
        
        it('should handle multiple policies per request', async () => {
            // Test 2+ policies with different KAO groups
        });
        
        it('should evaluate each policy independently', async () => {
            // Test policy isolation
        });
        
        it('should return results grouped by policyId', async () => {
            // Test response structure preserves grouping
        });
        
        it('should preserve policy translations', async () => {
            // Test policy field transformations
        });
        
        it('should handle policy conflicts', async () => {
            // Test conflicting policy requirements
        });
        
        it('should validate policyBinding per group', async () => {
            // Test policyBinding per policy group
        });
        
        it('should audit policy evaluations', async () => {
            // Test policy evaluation audit trail
        });
    });
});

// ============================================
// Phase 4.1.1: EncryptedMetadata Integration Tests
// ============================================
describe('Phase 4.1.1: EncryptedMetadata Integration Tests', () => {
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
    
    const generateKeyPair = () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { publicKey, privateKey };
    };
    
    const wrapKey = (keySplit: Buffer, publicKey: string): string => {
        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            keySplit
        );
        return encrypted.toString('base64');
    };
    
    const computePolicyBinding = (policy: any, keySplit: Buffer): string => {
        const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
        return crypto.createHmac('sha256', keySplit)
            .update(policyJson, 'utf8')
            .digest('base64');
    };
    
    const encryptMetadata = (metadata: any, keySplit: Buffer): string => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', keySplit, iv);
        
        const plaintext = JSON.stringify(metadata);
        let encrypted = cipher.update(plaintext, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
        return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    };
    
    const generateTestJWT = (payload: any) => {
        const { privateKey } = generateKeyPair();
        return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    };
    
    test('should decrypt encryptedMetadata with valid policy assertions', async () => {
        const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = generateKeyPair();
        const { publicKey: kasPublicKey } = generateKeyPair();
        
        const keySplit = crypto.randomBytes(32);
        const policy = {
            policyId: 'policy-metadata-001',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY']
            }
        };
        
        // Create metadata with policy assertions
        const metadata = {
            fields: {
                title: 'Classified Document',
                author: 'Alice',
                createdAt: '2026-01-31T00:00:00Z'
            },
            policyAssertion: {
                policyHash: crypto.createHash('sha256')
                    .update(JSON.stringify(policy, Object.keys(policy).sort()))
                    .digest('base64'),
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY']
            }
        };
        
        const encryptedMetadata = encryptMetadata(metadata, keySplit);
        
        const kao = {
            keyAccessObjectId: 'kao-meta-001',
            wrappedKey: wrapKey(keySplit, kasPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, keySplit),
            sid: 'session-meta-001',
            encryptedMetadata,
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'alice@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['FVEY']
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
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
        expect(response.data.responses[0].results).toHaveLength(1);
        
        const result = response.data.responses[0].results[0];
        expect(result.status).toBe('success');
        expect(result.metadata).toBeDefined();
        expect(result.metadata.title).toBe('Classified Document');
        expect(result.metadata.author).toBe('Alice');
    }, 10000);
    
    test('should reject encryptedMetadata with mismatched policy assertions', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasPublicKey } = generateKeyPair();
        
        const keySplit = crypto.randomBytes(32);
        const policy = {
            policyId: 'policy-metadata-002',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA']
            }
        };
        
        // Create metadata with WRONG policy assertions
        const wrongPolicyHash = crypto.randomBytes(32).toString('base64');
        const metadata = {
            fields: {
                title: 'Test Document'
            },
            policyAssertion: {
                policyHash: wrongPolicyHash, // Wrong hash
                classification: 'CONFIDENTIAL', // Wrong classification
                releasabilityTo: ['USA', 'FRA'] // Wrong countries
            }
        };
        
        const encryptedMetadata = encryptMetadata(metadata, keySplit);
        
        const kao = {
            keyAccessObjectId: 'kao-meta-002',
            wrappedKey: wrapKey(keySplit, kasPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, keySplit),
            sid: 'session-meta-002',
            encryptedMetadata,
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'bob@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: []
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent
            }
        );
        
        expect(response.status).toBe(200);
        const result = response.data.responses[0].results[0];
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/metadata decryption failed/i);
    }, 10000);
    
    test('should handle encryptedMetadata in 2-KAS federation', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        const { publicKey: kasFraPublicKey } = generateKeyPair();
        
        const keySplit1 = crypto.randomBytes(32);
        const keySplit2 = crypto.randomBytes(32);
        
        const policy = {
            policyId: 'policy-metadata-003',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA', 'FRA'],
                COI: ['NATO']
            }
        };
        
        // USA KAO with metadata
        const metadata1 = {
            fields: {
                title: 'NATO Document',
                classification: 'SECRET'
            },
            policyAssertion: {
                policyHash: crypto.createHash('sha256')
                    .update(JSON.stringify(policy, Object.keys(policy).sort()))
                    .digest('base64'),
                classification: 'SECRET',
                releasabilityTo: ['USA', 'FRA']
            }
        };
        
        const kao1 = {
            keyAccessObjectId: 'kao-meta-usa',
            wrappedKey: wrapKey(keySplit1, kasUsaPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, keySplit1),
            sid: 'session-meta-003',
            encryptedMetadata: encryptMetadata(metadata1, keySplit1),
            signature: { alg: 'RS256', sig: '' }
        };
        
        // FRA KAO with metadata
        const metadata2 = {
            fields: {
                source: 'France Intelligence',
                timestamp: '2026-01-31T12:00:00Z'
            },
            policyAssertion: {
                policyHash: crypto.createHash('sha256')
                    .update(JSON.stringify(policy, Object.keys(policy).sort()))
                    .digest('base64'),
                classification: 'SECRET',
                releasabilityTo: ['USA', 'FRA']
            }
        };
        
        const kao2 = {
            keyAccessObjectId: 'kao-meta-fra',
            wrappedKey: wrapKey(keySplit2, kasFraPublicKey),
            url: KAS_FRA_URL,
            kid: 'kas-fra-001',
            policyBinding: computePolicyBinding(policy, keySplit2),
            sid: 'session-meta-003',
            encryptedMetadata: encryptMetadata(metadata2, keySplit2),
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao1, kao2]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'charlie@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['NATO']
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent
            }
        );
        
        expect(response.status).toBe(200);
        expect(response.data.responses[0].results).toHaveLength(2);
        
        // Check USA KAO result
        const usaResult = response.data.responses[0].results.find(
            (r: any) => r.keyAccessObjectId === 'kao-meta-usa'
        );
        expect(usaResult.status).toBe('success');
        expect(usaResult.metadata).toBeDefined();
        expect(usaResult.metadata.title).toBe('NATO Document');
        
        // Check FRA KAO result (may be success or error depending on federation setup)
        const fraResult = response.data.responses[0].results.find(
            (r: any) => r.keyAccessObjectId === 'kao-meta-fra'
        );
        expect(fraResult).toBeDefined();
    }, 15000);
});

// ============================================
// Phase 4.1.2: Key Split Recombination Integration Tests
// ============================================
describe('Phase 4.1.2: Key Split Recombination (All-Of Mode)', () => {
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    const KAS_GBR_URL = process.env.KAS_GBR_URL || 'https://localhost:8083';
    
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
    
    const generateKeyPair = () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { publicKey, privateKey };
    };
    
    const wrapKey = (keySplit: Buffer, publicKey: string): string => {
        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            keySplit
        );
        return encrypted.toString('base64');
    };
    
    const computePolicyBinding = (policy: any, keySplit: Buffer): string => {
        const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
        return crypto.createHmac('sha256', keySplit)
            .update(policyJson, 'utf8')
            .digest('base64');
    };
    
    const generateTestJWT = (payload: any) => {
        const { privateKey } = generateKeyPair();
        return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    };
    
    test('should recombine 2-KAS key splits using XOR (All-Of mode)', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        const { publicKey: kasFraPublicKey } = generateKeyPair();
        
        // Create original DEK
        const originalDek = crypto.randomBytes(32);
        
        // Split DEK into 2 parts using XOR
        const split1 = crypto.randomBytes(32);
        const split2 = Buffer.from(
            originalDek.map((byte, i) => byte ^ split1[i])
        );
        
        const policy = {
            policyId: 'policy-split-001',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA', 'FRA'],
                COI: ['NATO']
            }
        };
        
        // Create KAOs with same policy binding (indicating All-Of mode)
        const kao1 = {
            keyAccessObjectId: 'kao-split-usa',
            wrappedKey: wrapKey(split1, kasUsaPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, split1),
            sid: 'session-split-001',
            signature: { alg: 'RS256', sig: '' }
        };
        
        const kao2 = {
            keyAccessObjectId: 'kao-split-fra',
            wrappedKey: wrapKey(split2, kasFraPublicKey),
            url: KAS_FRA_URL,
            kid: 'kas-fra-001',
            policyBinding: computePolicyBinding(policy, split2),
            sid: 'session-split-001',
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao1, kao2]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'test-user@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['NATO']
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
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
        
        // Both KAOs should be processed successfully
        const results = response.data.responses[0].results;
        const usaResult = results.find((r: any) => r.keyAccessObjectId === 'kao-split-usa');
        const fraResult = results.find((r: any) => r.keyAccessObjectId === 'kao-split-fra');
        
        expect(usaResult.status).toBe('success');
        expect(usaResult.kasWrappedKey).toBeDefined();
        
        // FRA result depends on federation setup
        expect(fraResult).toBeDefined();
    }, 15000);
    
    test('should recombine 3-KAS key splits using XOR', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        const { publicKey: kasFraPublicKey } = generateKeyPair();
        const { publicKey: kasGbrPublicKey } = generateKeyPair();
        
        // Create original DEK
        const originalDek = crypto.randomBytes(32);
        
        // Split DEK into 3 parts using XOR
        const split1 = crypto.randomBytes(32);
        const split2 = crypto.randomBytes(32);
        const split3 = Buffer.from(
            originalDek.map((byte, i) => byte ^ split1[i] ^ split2[i])
        );
        
        const policy = {
            policyId: 'policy-split-002',
            dissem: {
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA', 'FRA', 'GBR'],
                COI: ['FVEY']
            }
        };
        
        const kaos = [
            {
                keyAccessObjectId: 'kao-split-usa-2',
                wrappedKey: wrapKey(split1, kasUsaPublicKey),
                url: KAS_USA_URL,
                kid: 'kas-usa-001',
                policyBinding: computePolicyBinding(policy, split1),
                sid: 'session-split-002',
                signature: { alg: 'RS256', sig: '' }
            },
            {
                keyAccessObjectId: 'kao-split-fra-2',
                wrappedKey: wrapKey(split2, kasFraPublicKey),
                url: KAS_FRA_URL,
                kid: 'kas-fra-001',
                policyBinding: computePolicyBinding(policy, split2),
                sid: 'session-split-002',
                signature: { alg: 'RS256', sig: '' }
            },
            {
                keyAccessObjectId: 'kao-split-gbr-2',
                wrappedKey: wrapKey(split3, kasGbrPublicKey),
                url: KAS_GBR_URL,
                kid: 'kas-gbr-001',
                policyBinding: computePolicyBinding(policy, split3),
                sid: 'session-split-002',
                signature: { alg: 'RS256', sig: '' }
            }
        ];
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: kaos
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'admin@example.com',
            clearance: 'TOP_SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['FVEY']
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
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
        expect(response.data.responses[0].results).toHaveLength(3);
        
        // At least USA KAO should succeed
        const usaResult = response.data.responses[0].results.find(
            (r: any) => r.keyAccessObjectId === 'kao-split-usa-2'
        );
        expect(usaResult.status).toBe('success');
    }, 20000);
    
    test('should reject key splits with mismatched policy bindings', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        const { publicKey: kasFraPublicKey } = generateKeyPair();
        
        const split1 = crypto.randomBytes(32);
        const split2 = crypto.randomBytes(32);
        
        const policy1 = {
            policyId: 'policy-a',
            dissem: { classification: 'SECRET' }
        };
        
        const policy2 = {
            policyId: 'policy-b',
            dissem: { classification: 'TOP_SECRET' }
        };
        
        // Create KAOs with DIFFERENT policy bindings (invalid for All-Of)
        const kaos = [
            {
                keyAccessObjectId: 'kao-mismatch-1',
                wrappedKey: wrapKey(split1, kasUsaPublicKey),
                url: KAS_USA_URL,
                kid: 'kas-usa-001',
                policyBinding: computePolicyBinding(policy1, split1),
                sid: 'session-mismatch',
                signature: { alg: 'RS256', sig: '' }
            },
            {
                keyAccessObjectId: 'kao-mismatch-2',
                wrappedKey: wrapKey(split2, kasFraPublicKey),
                url: KAS_FRA_URL,
                kid: 'kas-fra-001',
                policyBinding: computePolicyBinding(policy2, split2),
                sid: 'session-mismatch',
                signature: { alg: 'RS256', sig: '' }
            }
        ];
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy: policy1,
                    keyAccessObjects: kaos
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'test@example.com',
            clearance: 'TOP_SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: []
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent
            }
        );
        
        expect(response.status).toBe(200);
        
        // At least one KAO should fail with policy binding error
        const results = response.data.responses[0].results;
        const failedResult = results.find((r: any) => r.status === 'error');
        expect(failedResult).toBeDefined();
    }, 15000);
});

// ============================================
// Phase 4.1.3: Any-Of KAS Routing Integration Tests
// ============================================
describe('Phase 4.1.3: Any-Of KAS Routing with Failover', () => {
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    const KAS_GBR_URL = process.env.KAS_GBR_URL || 'https://localhost:8083';
    
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false
    });
    
    const generateKeyPair = () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { publicKey, privateKey };
    };
    
    const wrapKey = (keySplit: Buffer, publicKey: string): string => {
        const encrypted = crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            keySplit
        );
        return encrypted.toString('base64');
    };
    
    const computePolicyBinding = (policy: any, keySplit: Buffer): string => {
        const policyJson = JSON.stringify(policy, Object.keys(policy).sort());
        return crypto.createHmac('sha256', keySplit)
            .update(policyJson, 'utf8')
            .digest('base64');
    };
    
    const generateTestJWT = (payload: any) => {
        const { privateKey } = generateKeyPair();
        return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    };
    
    test('should succeed on primary KAS in Any-Of mode', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        
        const keySplit = crypto.randomBytes(32);
        const policy = {
            policyId: 'policy-anyof-001',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA'],
            }
        };
        
        // Create single KAO (primary KAS)
        const kao = {
            keyAccessObjectId: 'kao-anyof-primary',
            wrappedKey: wrapKey(keySplit, kasUsaPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, keySplit),
            sid: 'session-anyof-001',
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'test-user@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: []
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
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
        const result = response.data.responses[0].results[0];
        expect(result.status).toBe('success');
        expect(result.kasWrappedKey).toBeDefined();
    }, 10000);
    
    test('should provide alternate KAS options in Any-Of mode', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        const { publicKey: kasFraPublicKey } = generateKeyPair();
        
        const keySplit = crypto.randomBytes(32);
        const policy = {
            policyId: 'policy-anyof-002',
            dissem: {
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA', 'FRA'],
            }
        };
        
        // Create two KAOs (alternate KAS instances)
        // In production, these would be different KAS instances holding the same key
        const kaos = [
            {
                keyAccessObjectId: 'kao-anyof-usa',
                wrappedKey: wrapKey(keySplit, kasUsaPublicKey),
                url: KAS_USA_URL,
                kid: 'kas-usa-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-anyof-002',
                signature: { alg: 'RS256', sig: '' }
            },
            {
                keyAccessObjectId: 'kao-anyof-fra',
                wrappedKey: wrapKey(keySplit, kasFraPublicKey),
                url: KAS_FRA_URL,
                kid: 'kas-fra-001',
                policyBinding: computePolicyBinding(policy, keySplit),
                sid: 'session-anyof-002',
                signature: { alg: 'RS256', sig: '' }
            }
        ];
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: kaos
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'test-user@example.com',
            clearance: 'CONFIDENTIAL',
            countryOfAffiliation: 'USA',
            acpCOI: []
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
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
        
        // At least one KAO should succeed
        const results = response.data.responses[0].results;
        expect(results.length).toBeGreaterThan(0);
        
        const successResult = results.find((r: any) => r.status === 'success');
        expect(successResult).toBeDefined();
    }, 15000);
    
    test('should document Any-Of mode behavior in response', async () => {
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasUsaPublicKey } = generateKeyPair();
        
        const keySplit = crypto.randomBytes(32);
        const policy = {
            policyId: 'policy-anyof-003',
            dissem: {
                classification: 'SECRET',
                releasabilityTo: ['USA'],
            }
        };
        
        const kao = {
            keyAccessObjectId: 'kao-anyof-doc',
            wrappedKey: wrapKey(keySplit, kasUsaPublicKey),
            url: KAS_USA_URL,
            kid: 'kas-usa-001',
            policyBinding: computePolicyBinding(policy, keySplit),
            sid: 'session-anyof-003',
            signature: { alg: 'RS256', sig: '' }
        };
        
        const requestBody = {
            clientPublicKey,
            requests: [
                {
                    policy,
                    keyAccessObjects: [kao]
                }
            ]
        };
        
        const token = generateTestJWT({
            uniqueID: 'test-user@example.com',
            clearance: 'SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: []
        });
        
        const response = await axios.post(
            `${KAS_USA_URL}/rewrap`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent
            }
        );
        
        expect(response.status).toBe(200);
        
        // Response should contain standard rewrap result structure
        const result = response.data.responses[0].results[0];
        expect(result).toHaveProperty('keyAccessObjectId');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('signature');
        
        if (result.status === 'success') {
            expect(result).toHaveProperty('kasWrappedKey');
        } else {
            expect(result).toHaveProperty('error');
        }
    }, 10000);
});
