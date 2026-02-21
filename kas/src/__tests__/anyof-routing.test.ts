/**
 * Unit Tests: Any-Of KAS Routing
 * 
 * Phase 4.1.3: Any-Of KAS Routing with Failover
 * 
 * Test Coverage:
 * - Primary KAS success (first attempt)
 * - Fallback to secondary KAS
 * - Fallback to tertiary KAS
 * - All KAS down scenario
 * - Circuit breaker integration
 * - Routing decision logging
 * - Performance validation (< 500ms failover)
 * - KAS ID extraction from KAO
 */

import { KASFederationService } from '../services/kas-federation.service';
import { IKeyAccessObject, IPolicy } from '../types/rewrap.types';
import { IFederationResult } from '../types/federation.types';

// Mock dependencies
jest.mock('axios');
jest.mock('../utils/kas-logger');
jest.mock('../utils/kas-federation');
jest.mock('../utils/circuit-breaker');
jest.mock('../utils/mtls-config');

describe('KASFederationService - Any-Of Routing', () => {
    let service: KASFederationService;
    
    beforeEach(() => {
        jest.clearAllMocks();
        service = new KASFederationService();
    });
    
    const createTestPolicy = (): IPolicy => ({
        policyId: 'policy-anyof-001',
        dissem: {
            classification: 'SECRET',
            releasabilityTo: ['USA', 'FRA'],
        },
    });
    
    const createTestKAO = (id: string, kasId: string, url: string): IKeyAccessObject => ({
        keyAccessObjectId: id,
        wrappedKey: `wrapped-${id}`,
        url,
        kid: `${kasId}-001`,
        policyBinding: `binding-${id}`,
        signature: { alg: 'RS256', sig: '' },
    });
    
    // ============================================
    // Test 1: Primary KAS Success
    // ============================================
    describe('Primary KAS Success', () => {
        test('should return success on first KAS attempt', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
            ];
            
            // Mock forwardRewrapRequest to succeed on first attempt
            jest.spyOn(service as any, 'forwardRewrapRequest').mockResolvedValueOnce({
                success: true,
                kasId: 'kas-usa',
                response: {
                    responses: [{
                        policyId: 'policy-anyof-001',
                        results: [{
                            keyAccessObjectId: 'kao-1',
                            status: 'success',
                            kasWrappedKey: 'rewrapped-key',
                            signature: { alg: 'RS256', sig: '' },
                        }],
                    }],
                },
                latencyMs: 50,
            });
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(true);
            expect(result.kasId).toBe('kas-usa');
            expect(result.response).toBeDefined();
            
            // Should only attempt first KAS
            expect(service['forwardRewrapRequest']).toHaveBeenCalledTimes(1);
        });
    });
    
    // ============================================
    // Test 2: Fallback to Secondary KAS
    // ============================================
    describe('Fallback to Secondary KAS', () => {
        test('should fallback to second KAS when first fails', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
            ];
            
            // Mock first attempt to fail, second to succeed
            jest.spyOn(service as any, 'forwardRewrapRequest')
                .mockResolvedValueOnce({
                    success: false,
                    kasId: 'kas-usa',
                    error: {
                        kasId: 'kas-usa',
                        errorType: 'network_error',
                        message: 'Connection refused',
                        affectedKAOIds: ['kao-1'],
                        timestamp: new Date().toISOString(),
                    },
                    latencyMs: 100,
                })
                .mockResolvedValueOnce({
                    success: true,
                    kasId: 'kas-fra',
                    response: {
                        responses: [{
                            policyId: 'policy-anyof-001',
                            results: [{
                                keyAccessObjectId: 'kao-2',
                                status: 'success',
                                kasWrappedKey: 'rewrapped-key',
                                signature: { alg: 'RS256', sig: '' },
                            }],
                        }],
                    },
                    latencyMs: 75,
                });
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(true);
            expect(result.kasId).toBe('kas-fra');
            expect(result.response).toBeDefined();
            
            // Should attempt both KAS instances
            expect(service['forwardRewrapRequest']).toHaveBeenCalledTimes(2);
        });
    });
    
    // ============================================
    // Test 3: Fallback to Tertiary KAS
    // ============================================
    describe('Fallback to Tertiary KAS', () => {
        test('should fallback to third KAS when first two fail', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
                createTestKAO('kao-3', 'kas-gbr', 'https://kas-gbr.example.com'),
            ];
            
            // Mock first two attempts to fail, third to succeed
            jest.spyOn(service as any, 'forwardRewrapRequest')
                .mockResolvedValueOnce({
                    success: false,
                    kasId: 'kas-usa',
                    error: {
                        kasId: 'kas-usa',
                        errorType: 'timeout',
                        message: 'Request timeout',
                        affectedKAOIds: ['kao-1'],
                        timestamp: new Date().toISOString(),
                    },
                    latencyMs: 10000,
                })
                .mockResolvedValueOnce({
                    success: false,
                    kasId: 'kas-fra',
                    error: {
                        kasId: 'kas-fra',
                        errorType: 'auth_failure',
                        message: 'Unauthorized',
                        affectedKAOIds: ['kao-2'],
                        timestamp: new Date().toISOString(),
                    },
                    latencyMs: 50,
                })
                .mockResolvedValueOnce({
                    success: true,
                    kasId: 'kas-gbr',
                    response: {
                        responses: [{
                            policyId: 'policy-anyof-001',
                            results: [{
                                keyAccessObjectId: 'kao-3',
                                status: 'success',
                                kasWrappedKey: 'rewrapped-key',
                                signature: { alg: 'RS256', sig: '' },
                            }],
                        }],
                    },
                    latencyMs: 60,
                });
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(true);
            expect(result.kasId).toBe('kas-gbr');
            
            // Should attempt all three KAS instances
            expect(service['forwardRewrapRequest']).toHaveBeenCalledTimes(3);
        });
    });
    
    // ============================================
    // Test 4: All KAS Down
    // ============================================
    describe('All KAS Down Scenario', () => {
        test('should fail when all KAS instances are unavailable', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
            ];
            
            // Mock all attempts to fail
            jest.spyOn(service as any, 'forwardRewrapRequest')
                .mockResolvedValue({
                    success: false,
                    kasId: 'kas-test',
                    error: {
                        kasId: 'kas-test',
                        errorType: 'network_error',
                        message: 'Connection refused',
                        affectedKAOIds: [],
                        timestamp: new Date().toISOString(),
                    },
                    latencyMs: 100,
                });
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.errorType).toBe('all_kas_unavailable');
            expect(result.error?.message).toContain('All 2 KAS instances unavailable');
            
            // Should attempt all KAS instances
            expect(service['forwardRewrapRequest']).toHaveBeenCalledTimes(2);
        });
        
        test('should fail when no KAOs provided', async () => {
            const policy = createTestPolicy();
            const kaos: IKeyAccessObject[] = [];
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(false);
            expect(result.error?.errorType).toBe('invalid_request');
            expect(result.error?.message).toContain('No KAOs provided');
        });
    });
    
    // ============================================
    // Test 5: Circuit Breaker Integration
    // ============================================
    describe('Circuit Breaker Integration', () => {
        test('should skip KAS with open circuit breaker', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
            ];
            
            // Mock circuit breaker to be open for first KAS
            const mockCircuitBreaker = {
                isOpen: jest.fn()
                    .mockReturnValueOnce(true)  // First KAS: circuit open
                    .mockReturnValueOnce(false), // Second KAS: circuit closed
                recordSuccess: jest.fn(),
                recordFailure: jest.fn(),
                getStats: jest.fn().mockReturnValue({ state: 'CLOSED' }),
            };
            
            // Mock getCircuitBreaker to return our mock
            jest.mock('../utils/circuit-breaker', () => ({
                CircuitBreaker: jest.fn(() => mockCircuitBreaker),
            }));
            
            // Mock second KAS to succeed
            jest.spyOn(service as any, 'forwardRewrapRequest').mockResolvedValueOnce({
                success: true,
                kasId: 'kas-fra',
                response: {
                    responses: [{
                        policyId: 'policy-anyof-001',
                        results: [{
                            keyAccessObjectId: 'kao-2',
                            status: 'success',
                            kasWrappedKey: 'rewrapped-key',
                            signature: { alg: 'RS256', sig: '' },
                        }],
                    }],
                },
                latencyMs: 50,
            });
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(true);
            expect(result.kasId).toBe('kas-fra');
            
            // Should only attempt second KAS (first skipped due to circuit breaker)
            expect(service['forwardRewrapRequest']).toHaveBeenCalledTimes(1);
        });
    });
    
    // ============================================
    // Test 6: KAS ID Extraction
    // ============================================
    describe('KAS ID Extraction', () => {
        test('should extract KAS ID from kid', () => {
            const kao = createTestKAO('kao-1', 'kas-fra', 'https://example.com');
            const kasId = (service as any).extractKasIdFromKAO(kao);
            expect(kasId).toBe('kas-fra');
        });
        
        test('should extract KAS ID from URL', () => {
            const kao: IKeyAccessObject = {
                keyAccessObjectId: 'kao-1',
                wrappedKey: 'test',
                url: 'https://kas-gbr.example.com/rewrap',
                kid: 'unknown-key',
                policyBinding: 'binding',
                signature: { alg: 'RS256', sig: '' },
            };
            const kasId = (service as any).extractKasIdFromKAO(kao);
            expect(kasId).toBe('kas-gbr');
        });
        
        test('should fallback to kid if extraction fails', () => {
            const kao: IKeyAccessObject = {
                keyAccessObjectId: 'kao-1',
                wrappedKey: 'test',
                url: 'https://example.com',
                kid: 'custom-key-id',
                policyBinding: 'binding',
                signature: { alg: 'RS256', sig: '' },
            };
            const kasId = (service as any).extractKasIdFromKAO(kao);
            expect(kasId).toBe('custom-key-id');
        });
    });
    
    // ============================================
    // Test 7: Performance
    // ============================================
    describe('Performance', () => {
        test('should failover within 500ms', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
                createTestKAO('kao-2', 'kas-fra', 'https://kas-fra.example.com'),
            ];
            
            // Mock first to fail quickly, second to succeed
            jest.spyOn(service as any, 'forwardRewrapRequest')
                .mockResolvedValueOnce({
                    success: false,
                    kasId: 'kas-usa',
                    error: {
                        kasId: 'kas-usa',
                        errorType: 'network_error',
                        message: 'Connection refused',
                        affectedKAOIds: ['kao-1'],
                        timestamp: new Date().toISOString(),
                    },
                    latencyMs: 50,
                })
                .mockResolvedValueOnce({
                    success: true,
                    kasId: 'kas-fra',
                    response: {
                        responses: [{
                            policyId: 'policy-anyof-001',
                            results: [{
                                keyAccessObjectId: 'kao-2',
                                status: 'success',
                                kasWrappedKey: 'rewrapped-key',
                                signature: { alg: 'RS256', sig: '' },
                            }],
                        }],
                    },
                    latencyMs: 50,
                });
            
            const startTime = Date.now();
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            const duration = Date.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(500);
        });
    });
    
    // ============================================
    // Test 8: Error Handling
    // ============================================
    describe('Error Handling', () => {
        test('should handle exception during routing', async () => {
            const policy = createTestPolicy();
            const kaos = [
                createTestKAO('kao-1', 'kas-usa', 'https://kas-usa.example.com'),
            ];
            
            // Mock to throw exception
            jest.spyOn(service as any, 'forwardRewrapRequest')
                .mockRejectedValueOnce(new Error('Network failure'));
            
            const result = await service.routeAnyOf(
                kaos,
                policy,
                'client-public-key',
                'Bearer test-token',
                undefined,
                'req-123'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
});
