/**
 * Phase 3.4 Security Tests - mTLS and Federation Validation
 * 
 * Comprehensive test suite for:
 * - mTLS configuration and certificate loading
 * - HTTPS agent creation with mutual TLS
 * - Federation validator middleware
 * - X-Forwarded-By header validation
 * - Federation depth limiting
 * - Circuit breaker integration
 * 
 * Target: 23+ tests as specified in CONTINUATION-PROMPT.md
 */

import { Request, Response, NextFunction } from 'express';
import {
    loadMTLSConfig,
    createMTLSAgent,
    getMTLSAgent,
    validateMTLSConfig,
    isMTLSEnabled,
    invalidateMTLSAgentCache,
    getMTLSAgentStats,
} from '../utils/mtls-config';
import {
    validateFederatedRequest,
    validateForwardedByHeader,
    getFederationAgreement,
    validateFederationAgreement,
    MAX_FEDERATION_DEPTH,
} from '../middleware/federation-validator.middleware';

// Mock kasRegistry directly from kas-federation
jest.mock('../utils/kas-federation', () => ({
    kasRegistry: {
        get: jest.fn(),
    },
    policyTranslator: {},
}));

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    invalidateMTLSAgentCache();
});

afterEach(() => {
    process.env = originalEnv;
});

// ============================================
// mTLS Configuration Tests (8 tests)
// ============================================

describe('mTLS Configuration', () => {
    describe('loadMTLSConfig', () => {
        it('should load per-KAS mTLS config from environment', () => {
            process.env.MTLS_CLIENT_CERT_KAS_USA = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY_KAS_USA = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
            process.env.MTLS_CA_CERT_KAS_USA = '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----';
            
            const config = loadMTLSConfig('kas-usa');
            
            expect(config).not.toBeNull();
            expect(config?.clientCert).toContain('BEGIN CERTIFICATE');
            expect(config?.clientKey).toContain('BEGIN PRIVATE KEY');
            expect(config?.caCert).toContain('BEGIN CERTIFICATE');
            expect(config?.rejectUnauthorized).toBe(true);
        });
        
        it('should fallback to shared mTLS config', () => {
            process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\nshared\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\nshared\n-----END PRIVATE KEY-----';
            
            const config = loadMTLSConfig('kas-unknown');
            
            expect(config).not.toBeNull();
            expect(config?.clientCert).toContain('BEGIN CERTIFICATE');
            expect(config?.clientKey).toContain('BEGIN PRIVATE KEY');
        });
        
        it('should return null if cert/key not configured', () => {
            const config = loadMTLSConfig('kas-nocerts');
            
            expect(config).toBeNull();
        });
        
        it('should handle passphrase for encrypted keys', () => {
            process.env.MTLS_CLIENT_CERT_KAS_FRA = '-----BEGIN CERTIFICATE-----\nfra\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY_KAS_FRA = '-----BEGIN ENCRYPTED PRIVATE KEY-----\nfra\n-----END ENCRYPTED PRIVATE KEY-----';
            process.env.MTLS_PASSPHRASE_KAS_FRA = 'secret123';
            
            const config = loadMTLSConfig('kas-fra');
            
            expect(config).not.toBeNull();
            expect(config?.passphrase).toBe('secret123');
        });
    });
    
    describe('createMTLSAgent', () => {
        it('should create HTTPS agent with valid config', () => {
            process.env.MTLS_CLIENT_CERT_KAS_GBR = '-----BEGIN CERTIFICATE-----\ngbr\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY_KAS_GBR = '-----BEGIN PRIVATE KEY-----\ngbr\n-----END PRIVATE KEY-----';
            
            const result = createMTLSAgent('kas-gbr');
            
            expect(result).not.toBeNull();
            expect(result?.agent).toBeDefined();
            expect(result?.targetKasId).toBe('kas-gbr');
        });
        
        it('should return null if config not found', () => {
            const result = createMTLSAgent('kas-nonexistent');
            
            expect(result).toBeNull();
        });
        
        it('should configure agent with connection pooling', () => {
            process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
            
            const result = createMTLSAgent('kas-test');
            
            expect(result?.agent).toBeDefined();
            expect((result?.agent as any).options.keepAlive).toBe(true);
        });
        
        it('should validate CA certificates when provided', () => {
            process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
            process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
            process.env.MTLS_CA_CERT = '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----';
            
            const result = createMTLSAgent('kas-with-ca');
            
            expect(result).not.toBeNull();
            expect((result?.agent as any).options.rejectUnauthorized).toBe(true);
        });
    });
});

// ============================================
// mTLS Agent Caching Tests (5 tests)
// ============================================

describe('mTLS Agent Caching', () => {
    it('should cache agents for reuse', () => {
        process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        const agent1 = getMTLSAgent('kas-cache-test');
        const agent2 = getMTLSAgent('kas-cache-test');
        
        expect(agent1).toBe(agent2); // Same instance
    });
    
    it('should invalidate cache for specific KAS', () => {
        process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        const agent1 = getMTLSAgent('kas-invalidate');
        invalidateMTLSAgentCache('kas-invalidate');
        const agent2 = getMTLSAgent('kas-invalidate');
        
        expect(agent1).not.toBe(agent2); // Different instances
    });
    
    it('should invalidate all caches', () => {
        process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        getMTLSAgent('kas-1');
        getMTLSAgent('kas-2');
        
        let stats = getMTLSAgentStats();
        expect(stats.cachedAgents).toBe(2);
        
        invalidateMTLSAgentCache();
        
        stats = getMTLSAgentStats();
        expect(stats.cachedAgents).toBe(0);
    });
    
    it('should track cached agents', () => {
        process.env.MTLS_CLIENT_CERT = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        getMTLSAgent('kas-track-1');
        getMTLSAgent('kas-track-2');
        getMTLSAgent('kas-track-3');
        
        const stats = getMTLSAgentStats();
        
        expect(stats.cachedAgents).toBe(3);
        expect(stats.agentIds).toContain('kas-track-1');
        expect(stats.agentIds).toContain('kas-track-2');
        expect(stats.agentIds).toContain('kas-track-3');
    });
    
    it('should check global mTLS enabled flag', () => {
        process.env.FEDERATION_MTLS_ENABLED = 'false';
        expect(isMTLSEnabled()).toBe(false);
        
        process.env.FEDERATION_MTLS_ENABLED = 'true';
        expect(isMTLSEnabled()).toBe(true);
    });
});

// ============================================
// Federation Validator Tests (10 tests)
// ============================================

describe('Federation Validator Middleware', () => {
    describe('validateForwardedByHeader', () => {
        it('should accept direct client request (no X-Forwarded-By)', () => {
            const req = {
                headers: {},
            } as unknown as Request;
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(true);
        });
        
        it('should validate single forwarder', () => {
            const req = {
                headers: {
                    'x-forwarded-by': 'kas-usa',
                },
            } as unknown as Request;
            
            // Import and mock kasRegistry
            const { kasRegistry } = require('../utils/kas-federation');
            kasRegistry.get = jest.fn().mockReturnValue({
                kasId: 'kas-usa',
                status: 'approved',
                trustLevel: 'high',
            });
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(true);
            expect(result.forwarderKasId).toBe('kas-usa');
            expect(result.depth).toBe(1);
        });
        
        it('should reject untrusted forwarder', () => {
            const req = {
                headers: {
                    'x-forwarded-by': 'kas-unknown',
                },
            } as unknown as Request;
            
            const { kasRegistry } = require('../utils/kas-federation');
            kasRegistry.get = jest.fn().mockReturnValue(null);
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('not in KAS registry');
        });
        
        it('should enforce max federation depth', () => {
            const chain = Array(MAX_FEDERATION_DEPTH + 1).fill('kas').map((k, i) => `${k}-${i}`).join(', ');
            const req = {
                headers: {
                    'x-forwarded-by': chain,
                },
            } as unknown as Request;
            
            const { kasRegistry } = require('../utils/kas-federation');
            kasRegistry.get = jest.fn().mockReturnValue({
                kasId: 'kas-0',
                status: 'approved',
            });
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('exceeds maximum');
            expect(result.depth).toBeGreaterThan(MAX_FEDERATION_DEPTH);
        });
        
        it('should detect federation loops', () => {
            const req = {
                headers: {
                    'x-forwarded-by': 'kas-usa, kas-fra, kas-usa', // USA appears twice
                },
            } as unknown as Request;
            
            const { kasRegistry } = require('../utils/kas-federation');
            kasRegistry.get = jest.fn().mockReturnValue({
                kasId: 'kas-usa',
                status: 'approved',
            });
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('loop detected');
        });
        
        it('should reject non-approved forwarder', () => {
            const req = {
                headers: {
                    'x-forwarded-by': 'kas-pending',
                },
            } as unknown as Request;
            
            const { kasRegistry } = require('../utils/kas-federation');
            kasRegistry.get = jest.fn().mockReturnValue({
                kasId: 'kas-pending',
                status: 'pending',
            });
            
            const result = validateForwardedByHeader(req);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('not approved');
        });
    });
    
    describe('validateFederationAgreement', () => {
        it('should validate classification cap', () => {
            const req = {
                body: {
                    requests: [{
                        policy: { classification: 'TOP_SECRET' },
                        keyAccessObjects: [],
                    }],
                },
            } as any;
            
            const agreement = {
                maxClassification: 'SECRET' as const,
                allowedCOIs: [],
                allowedCountries: [],
                trustLevel: 'high' as const,
            };
            
            const result = validateFederationAgreement(req, 'kas-test', agreement);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('exceeds maximum allowed SECRET');
        });
        
        it('should allow classification within cap', () => {
            const req = {
                body: {
                    requests: [{
                        policy: { classification: 'CONFIDENTIAL' },
                        keyAccessObjects: [],
                    }],
                },
            } as any;
            
            const agreement = {
                maxClassification: 'SECRET' as const,
                allowedCOIs: [],
                allowedCountries: [],
                trustLevel: 'high' as const,
            };
            
            const result = validateFederationAgreement(req, 'kas-test', agreement);
            
            expect(result.valid).toBe(true);
        });
        
        it('should validate COI restrictions', () => {
            const req = {
                body: {
                    requests: [{
                        policy: { COI: ['FVEY', 'US-ONLY'] },
                        keyAccessObjects: [],
                    }],
                },
            } as any;
            
            const agreement = {
                maxClassification: 'SECRET' as const,
                allowedCOIs: ['NATO', 'FVEY'],
                allowedCountries: [],
                trustLevel: 'high' as const,
            };
            
            const result = validateFederationAgreement(req, 'kas-test', agreement);
            
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('US-ONLY');
        });
        
        it('should allow matching COIs', () => {
            const req = {
                body: {
                    requests: [{
                        policy: { COI: ['NATO', 'FVEY'] },
                        keyAccessObjects: [],
                    }],
                },
            } as any;
            
            const agreement = {
                maxClassification: 'SECRET' as const,
                allowedCOIs: ['NATO', 'FVEY'],
                allowedCountries: [],
                trustLevel: 'high' as const,
            };
            
            const result = validateFederationAgreement(req, 'kas-test', agreement);
            
            expect(result.valid).toBe(true);
        });
    });
});

// ============================================
// Integration Tests (5 tests)
// ============================================

describe('Federation Security Integration', () => {
    it('should create mTLS-enabled HTTP client', () => {
        process.env.MTLS_CLIENT_CERT_KAS_USA = '-----BEGIN CERTIFICATE-----\nusa\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY_KAS_USA = '-----BEGIN PRIVATE KEY-----\nusa\n-----END PRIVATE KEY-----';
        process.env.FEDERATION_MTLS_ENABLED = 'true';
        
        const agent = getMTLSAgent('kas-usa');
        
        expect(agent).not.toBeNull();
        expect(agent?.agent).toBeDefined();
    });
    
    it('should validate mTLS configuration', () => {
        process.env.MTLS_CLIENT_CERT_KAS_VALID = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
        process.env.MTLS_CLIENT_KEY_KAS_VALID = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        const result = validateMTLSConfig('kas-valid');
        
        expect(result.valid).toBe(true);
        expect(result.config).toBeDefined();
    });
    
    it('should reject invalid mTLS cert format', () => {
        process.env.MTLS_CLIENT_CERT_KAS_INVALID = 'not-a-pem-cert';
        process.env.MTLS_CLIENT_KEY_KAS_INVALID = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
        
        const result = validateMTLSConfig('kas-invalid');
        
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('not in PEM format');
    });
    
    it('should handle federation request with all security checks', async () => {
        process.env.ENABLE_FEDERATION = 'true';
        process.env.KAS_ID = 'kas-local';
        
        const req = {
            headers: {
                'x-request-id': 'test-123',
                'x-forwarded-by': 'kas-usa',
            },
            body: {
                requests: [{
                    policy: { classification: 'SECRET' },
                    keyAccessObjects: [],
                }],
            },
        } as any;
        
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;
        
        const next = jest.fn();
        
        const { kasRegistry } = require('../utils/kas-federation');
        kasRegistry.get = jest.fn().mockReturnValue({
            kasId: 'kas-usa',
            status: 'approved',
            trustLevel: 'high',
            maxClassification: 'SECRET',
            supportedCOIs: ['NATO'],
            supportedCountries: ['USA'],
        });
        
        await validateFederatedRequest(req, res, next);
        
        // Should call next() if validation passes
        expect(next).toHaveBeenCalled();
    });
    
    it('should reject federation when disabled', async () => {
        process.env.ENABLE_FEDERATION = 'false';
        
        const req = {
            headers: {
                'x-request-id': 'test-456',
                'x-forwarded-by': 'kas-usa',
            },
            body: {},
        } as any;
        
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as any;
        
        const next = jest.fn();
        
        await validateFederatedRequest(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'Federation Disabled',
            })
        );
        expect(next).not.toHaveBeenCalled();
    });
});
