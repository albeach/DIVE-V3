/**
 * DIVE V3 - Spoke Registration E2E Flow Test
 *
 * Tests the complete spoke registration lifecycle:
 * 1. Spoke generates CSR
 * 2. Spoke submits registration to Hub
 * 3. Hub admin approves spoke
 * 4. Hub signs CSR and issues certificate
 * 5. Spoke receives token
 * 6. Spoke connects to OPAL and receives policies
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { hubSpokeRegistry, IRegistrationRequest } from '../../services/hub-spoke-registry.service';
import { ISpokeConfig } from '../../services/spoke-registration.service';
import { spokeMTLS } from '../../services/spoke-mtls.service';
import { spokeToken } from '../../services/spoke-token.service';
import { spokePolicyCache } from '../../services/spoke-policy-cache.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Test configuration
const TEST_TIMEOUT = 30000;
const TEST_INSTANCE_CODE = 'TST';
const TEST_INSTANCE_NAME = 'Test Federation Instance';

describe('Spoke Registration E2E Flow', () => {
    let tempDir: string;
    let registeredSpokeId: string;
    let spokeConfig: ISpokeConfig;

    beforeAll(async () => {
        // Create temporary directory for test certificates and config
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dive-spoke-e2e-'));

        // Initialize spoke config
        spokeConfig = {
            identity: {
                spokeId: `spoke-${TEST_INSTANCE_CODE.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`,
                instanceCode: TEST_INSTANCE_CODE,
                name: TEST_INSTANCE_NAME,
                description: 'E2E Test Instance',
                country: TEST_INSTANCE_CODE.substring(0, 2),
                organizationType: 'government',
                contactEmail: 'test@dive-e2e.test',
            },
            endpoints: {
                hubUrl: 'https://hub.dive25.com',
                hubApiUrl: 'https://hub.dive25.com/api',
                hubOpalUrl: 'https://hub.dive25.com:7002',
                baseUrl: `https://${TEST_INSTANCE_CODE.toLowerCase()}-app.dive25.com`,
                apiUrl: `https://${TEST_INSTANCE_CODE.toLowerCase()}-api.dive25.com`,
                idpUrl: `https://${TEST_INSTANCE_CODE.toLowerCase()}-idp.dive25.com`,
            },
            certificates: {
                certificatePath: path.join(tempDir, 'spoke.crt'),
                privateKeyPath: path.join(tempDir, 'spoke.key'),
                csrPath: path.join(tempDir, 'spoke.csr'),
                caBundlePath: path.join(tempDir, 'hub-ca.crt'),
            },
            authentication: {},
            federation: {
                status: 'unregistered',
                requestedScopes: ['policy:base', `policy:${TEST_INSTANCE_CODE.toLowerCase()}`, 'data:federation_matrix'],
            },
            operational: {
                heartbeatIntervalMs: 30000,
                tokenRefreshBufferMs: 300000,
                offlineGracePeriodMs: 3600000,
                policyCachePath: path.join(tempDir, 'cache', 'policies'),
                auditQueuePath: path.join(tempDir, 'cache', 'audit'),
                maxAuditQueueSize: 1000,
                auditFlushIntervalMs: 60000,
            },
            metadata: {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
            },
        };

        // Create cache directories
        await fs.mkdir(path.join(tempDir, 'cache', 'policies'), { recursive: true });
        await fs.mkdir(path.join(tempDir, 'cache', 'audit'), { recursive: true });
    }, TEST_TIMEOUT);

    afterAll(async () => {
        // Cleanup: revoke test spoke if registered
        if (registeredSpokeId) {
            try {
                await hubSpokeRegistry.revokeSpoke(registeredSpokeId, 'E2E test cleanup');
            } catch {
                // Ignore if already revoked
            }
        }

        // Cleanup temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    // ===========================================
    // PHASE 1: CSR GENERATION
    // ===========================================

    describe('Phase 1: CSR Generation', () => {
        it('should generate RSA private key and CSR', async () => {
            // Initialize mTLS service
            await spokeMTLS.initialize({
                certPath: spokeConfig.certificates.certificatePath,
                keyPath: spokeConfig.certificates.privateKeyPath,
                verifyServer: false,
                minTLSVersion: 'TLSv1.2',
                allowSelfSigned: true,
            });

            // Generate CSR
            const csrInfo = await spokeMTLS.generateCSR({
                spokeId: spokeConfig.identity.spokeId,
                instanceCode: spokeConfig.identity.instanceCode,
                organization: 'DIVE Federation',
                country: spokeConfig.identity.country,
                algorithm: 'rsa',
                keySize: 2048, // Smaller key for faster tests
                outputDir: tempDir,
            });

            expect(csrInfo).toBeDefined();
            expect(csrInfo.csr).toContain('CERTIFICATE REQUEST');
            expect(csrInfo.privateKeyPath).toBe(path.join(tempDir, 'spoke.key'));
            expect(csrInfo.algorithm).toBe('rsa');

            // Verify files were created
            const keyExists = await fs.access(path.join(tempDir, 'spoke.key')).then(() => true).catch(() => false);
            const csrExists = await fs.access(path.join(tempDir, 'spoke.csr')).then(() => true).catch(() => false);

            expect(keyExists).toBe(true);
            expect(csrExists).toBe(true);
        });

        it('should generate EC private key and CSR', async () => {
            const ecDir = path.join(tempDir, 'ec');
            await fs.mkdir(ecDir, { recursive: true });

            const csrInfo = await spokeMTLS.generateCSR({
                spokeId: spokeConfig.identity.spokeId,
                instanceCode: spokeConfig.identity.instanceCode,
                organization: 'DIVE Federation',
                country: spokeConfig.identity.country,
                algorithm: 'ec',
                outputDir: ecDir,
            });

            expect(csrInfo).toBeDefined();
            expect(csrInfo.algorithm).toBe('ec');
            expect(csrInfo.keySize).toBe(256); // EC P-256
        });
    });

    // ===========================================
    // PHASE 2: REGISTRATION SUBMISSION
    // ===========================================

    describe('Phase 2: Registration Submission', () => {
        it('should submit registration request to Hub', async () => {
            const request: IRegistrationRequest = {
                instanceCode: spokeConfig.identity.instanceCode,
                name: spokeConfig.identity.name,
                description: spokeConfig.identity.description,
                baseUrl: spokeConfig.endpoints.baseUrl,
                apiUrl: spokeConfig.endpoints.apiUrl,
                idpUrl: spokeConfig.endpoints.idpUrl,
                requestedScopes: spokeConfig.federation.requestedScopes,
                contactEmail: spokeConfig.identity.contactEmail,
                validateEndpoints: false, // Skip endpoint validation in tests
            };

            const spoke = await hubSpokeRegistry.registerSpoke(request);

            expect(spoke).toBeDefined();
            expect(spoke.spokeId).toBeDefined();
            expect(spoke.instanceCode).toBe(TEST_INSTANCE_CODE);
            expect(spoke.status).toBe('pending');
            expect(spoke.name).toBe(TEST_INSTANCE_NAME);

            // Store for later phases
            registeredSpokeId = spoke.spokeId;
        });

        it('should reject duplicate registration', async () => {
            const request: IRegistrationRequest = {
                instanceCode: spokeConfig.identity.instanceCode,
                name: 'Duplicate Instance',
                baseUrl: spokeConfig.endpoints.baseUrl,
                apiUrl: spokeConfig.endpoints.apiUrl,
                idpUrl: spokeConfig.endpoints.idpUrl,
                requestedScopes: ['policy:base'],
                contactEmail: 'duplicate@test.com',
                validateEndpoints: false,
            };

            await expect(hubSpokeRegistry.registerSpoke(request))
                .rejects.toThrow(/already registered/i);
        });

        it('should list spoke in pending approvals', async () => {
            const pending = await hubSpokeRegistry.listPendingApprovals();

            expect(pending.some(s => s.spokeId === registeredSpokeId)).toBe(true);
        });
    });

    // ===========================================
    // PHASE 3: HUB ADMIN APPROVAL
    // ===========================================

    describe('Phase 3: Hub Admin Approval', () => {
        it('should approve spoke with policy scopes', async () => {
            const spoke = await hubSpokeRegistry.approveSpoke(
                registeredSpokeId,
                'e2e-test-admin',
                {
                    allowedScopes: ['policy:base', `policy:${TEST_INSTANCE_CODE.toLowerCase()}`],
                    trustLevel: 'development',
                    maxClassification: 'SECRET',
                    dataIsolationLevel: 'filtered',
                }
            );

            expect(spoke).toBeDefined();
            expect(spoke.status).toBe('approved');
            expect(spoke.approvedBy).toBe('e2e-test-admin');
            expect(spoke.allowedPolicyScopes).toContain('policy:base');
            expect(spoke.trustLevel).toBe('development');
            expect(spoke.maxClassificationAllowed).toBe('SECRET');
        });

        it('should not be in pending list after approval', async () => {
            const pending = await hubSpokeRegistry.listPendingApprovals();

            expect(pending.some(s => s.spokeId === registeredSpokeId)).toBe(false);
        });

        it('should be in active spokes list', async () => {
            const active = await hubSpokeRegistry.listActiveSpokes();

            expect(active.some(s => s.spokeId === registeredSpokeId)).toBe(true);
        });
    });

    // ===========================================
    // PHASE 4: TOKEN GENERATION
    // ===========================================

    describe('Phase 4: Token Generation', () => {
        let generatedToken: { token: string; expiresAt: Date; scopes: string[] };

        it('should generate token for approved spoke', async () => {
            const token = await hubSpokeRegistry.generateSpokeToken(registeredSpokeId);

            expect(token).toBeDefined();
            expect(token.token).toBeDefined();
            expect(token.token.length).toBeGreaterThan(20);
            expect(token.spokeId).toBe(registeredSpokeId);
            expect(token.scopes).toContain('policy:base');
            expect(token.expiresAt).toBeInstanceOf(Date);
            expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());

            generatedToken = token;
        });

        it('should validate generated token', async () => {
            const validation = await hubSpokeRegistry.validateToken(generatedToken.token);

            expect(validation.valid).toBe(true);
            expect(validation.spoke?.spokeId).toBe(registeredSpokeId);
            expect(validation.scopes).toEqual(generatedToken.scopes);
        });

        it('should reject invalid token', async () => {
            const validation = await hubSpokeRegistry.validateToken('invalid-token-123');

            expect(validation.valid).toBe(false);
            expect(validation.error).toBeDefined();
        });

        it('should store token in spoke token service', async () => {
            // Initialize token service
            await spokeToken.initialize({
                storagePath: path.join(tempDir, 'token.json'),
                autoRefresh: false,
            });

            // Store the token
            await spokeToken.storeToken({
                token: generatedToken.token,
                spokeId: registeredSpokeId,
                scopes: generatedToken.scopes,
                issuedAt: new Date(),
                expiresAt: generatedToken.expiresAt,
                tokenType: 'bearer',
                version: 1,
            });

            // Verify token is stored
            const storedToken = await spokeToken.getToken();
            expect(storedToken).toBe(generatedToken.token);

            // Verify token validation
            expect(spokeToken.isTokenValid()).toBe(true);
            expect(spokeToken.hasToken()).toBe(true);
        });
    });

    // ===========================================
    // PHASE 5: HEARTBEAT & HEALTH
    // ===========================================

    describe('Phase 5: Heartbeat & Health', () => {
        it('should record heartbeat from spoke', async () => {
            await hubSpokeRegistry.recordHeartbeat(registeredSpokeId, {
                opaHealthy: true,
                opalClientConnected: true,
                latencyMs: 50,
            });

            const spoke = await hubSpokeRegistry.getSpoke(registeredSpokeId);
            expect(spoke?.lastHeartbeat).toBeDefined();
            expect(spoke?.lastHeartbeat?.getTime()).toBeLessThanOrEqual(Date.now());
        });

        it('should check spoke health', async () => {
            const health = await hubSpokeRegistry.checkSpokeHealth(registeredSpokeId);

            expect(health).toBeDefined();
            expect(health.spokeId).toBe(registeredSpokeId);
            expect(health.healthy).toBe(true);
            expect(health.lastCheck).toBeInstanceOf(Date);
        });

        it('should not be in unhealthy spokes list', async () => {
            const unhealthy = await hubSpokeRegistry.getUnhealthySpokes();

            expect(unhealthy.some(s => s.spokeId === registeredSpokeId)).toBe(false);
        });
    });

    // ===========================================
    // PHASE 6: POLICY CACHE INITIALIZATION
    // ===========================================

    describe('Phase 6: Policy Cache Setup', () => {
        it('should initialize policy cache', async () => {
            await spokePolicyCache.initialize({
                cachePath: path.join(tempDir, 'cache', 'policies'),
                verifySignatures: false, // Skip signature verification in tests
                maxCacheAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
                opaUrl: 'http://localhost:8181',
            });

            const state = spokePolicyCache.getCacheState();
            // After initialization, cache state should be accessible
            expect(state).toBeDefined();
            expect(typeof state.hasCachedPolicy).toBe('boolean');
        });

        it('should cache a policy bundle', async () => {
            const testBundle = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                policies: [
                    {
                        path: 'base/guardrails',
                        content: 'package base.guardrails\n\ndefault allow := false',
                        hash: crypto.createHash('sha256').update('package base.guardrails\n\ndefault allow := false').digest('hex'),
                    },
                ],
                metadata: {
                    hubVersion: '1.0.0',
                    tenantId: 'test-tenant',
                    scopes: ['policy:base'],
                    sourceHub: 'hub.dive25.com',
                },
            };

            await spokePolicyCache.cachePolicy(testBundle);

            const cached = await spokePolicyCache.getCachedPolicy();
            expect(cached).toBeDefined();
            expect(cached?.version).toBe(testBundle.version);
        });

        it('should get current cached version', async () => {
            const currentVersion = spokePolicyCache.getCurrentVersion();
            expect(currentVersion).toBe('1.0.0');
        });
    });

    // ===========================================
    // PHASE 7: SUSPENSION & REVOCATION
    // ===========================================

    describe('Phase 7: Suspension & Revocation', () => {
        it('should suspend spoke', async () => {
            const spoke = await hubSpokeRegistry.suspendSpoke(
                registeredSpokeId,
                'E2E test suspension'
            );

            expect(spoke.status).toBe('suspended');
        });

        it('should fail token validation after suspension', async () => {
            const token = await hubSpokeRegistry.generateSpokeToken(registeredSpokeId)
                .catch(() => null);

            expect(token).toBeNull();
        });

        it('should revoke spoke', async () => {
            await hubSpokeRegistry.revokeSpoke(
                registeredSpokeId,
                'E2E test revocation'
            );

            const spoke = await hubSpokeRegistry.getSpoke(registeredSpokeId);
            expect(spoke?.status).toBe('revoked');
        });

        it('should allow re-registration after revocation', async () => {
            const request: IRegistrationRequest = {
                instanceCode: 'TST',
                name: 'Re-registered Test Instance',
                baseUrl: spokeConfig.endpoints.baseUrl,
                apiUrl: spokeConfig.endpoints.apiUrl,
                idpUrl: spokeConfig.endpoints.idpUrl,
                requestedScopes: ['policy:base'],
                contactEmail: 're-register@test.com',
                validateEndpoints: false,
            };

            const newSpoke = await hubSpokeRegistry.registerSpoke(request);

            expect(newSpoke).toBeDefined();
            expect(newSpoke.status).toBe('pending');

            // Update for cleanup
            registeredSpokeId = newSpoke.spokeId;
        });
    });

    // ===========================================
    // STATISTICS & QUERIES
    // ===========================================

    describe('Statistics & Queries', () => {
        it('should return hub statistics', async () => {
            const stats = await hubSpokeRegistry.getStatistics();

            expect(stats).toBeDefined();
            expect(typeof stats.totalSpokes).toBe('number');
            expect(typeof stats.activeSpokes).toBe('number');
            expect(typeof stats.pendingApprovals).toBe('number');
        });

        it('should find spoke by instance code', async () => {
            const spoke = await hubSpokeRegistry.getSpokeByInstanceCode(TEST_INSTANCE_CODE);

            expect(spoke).toBeDefined();
            expect(spoke?.instanceCode).toBe(TEST_INSTANCE_CODE);
        });
    });
});

