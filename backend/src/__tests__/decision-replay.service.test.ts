/**
 * Decision Replay Service Test Suite
 * Target: 95%+ coverage for decision-replay.service.ts
 * 
 * Tests:
 * - Decision replay with step-by-step evaluation
 * - Clearance comparison logic
 * - Releasability checks
 * - COI intersection logic
 * - Embargo checks
 * - Provenance building
 * - Error handling
 */

import { DecisionReplayService } from '../services/decision-replay.service';
import * as resourceService from '../services/resource.service';
import axios from 'axios';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock resource service
jest.mock('../services/resource.service');

// Mock axios
jest.mock('axios');

describe('Decision Replay Service', () => {
    const mockUserToken = {
        uniqueID: 'user-123',
        sub: 'user-123',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        iss: 'https://idp.example.com',
        auth_time: 1234567890,
        acr: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
    };

    const mockResource = {
        resourceId: 'doc-123',
        title: 'Test Document',
        ztdf: {
            policy: {
                securityLabel: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            },
            payload: {
                encrypted: true,
            },
        },
        legacy: {
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR'],
            COI: ['FVEY'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: true,
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.OPA_URL = 'http://localhost:8181';
    });

    describe('replayDecision', () => {
        it('should replay authorization decision successfully', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: true,
                            reason: 'All conditions satisfied',
                            evaluation_details: { latency_ms: 12 }
                        },
                        decision_id: 'test-decision-id'
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
            };

            const result = await DecisionReplayService.replayDecision(request, mockUserToken);

            expect(result.decision).toBe('ALLOW');
            expect(result.reason).toBe('All conditions satisfied');
            expect(result.steps).toHaveLength(6);
            expect(result.evaluation_details.latency_ms).toBeGreaterThan(0);
            expect(result.provenance).toBeDefined();
        });

        it('should handle DENY decision', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: { allow: false, reason: 'Insufficient clearance' },
                        decision_id: 'test-decision-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
            };

            const result = await DecisionReplayService.replayDecision(request, mockUserToken);

            expect(result.decision).toBe('DENY');
            expect(result.reason).toBe('Insufficient clearance');
        });

        it('should throw error when resource not found', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(null);

            const request = {
                resourceId: 'non-existent',
            };

            await expect(
                DecisionReplayService.replayDecision(request, mockUserToken)
            ).rejects.toThrow('Resource non-existent not found');
        });

        it('should use override userId when provided', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: { allow: true, reason: 'OK' },
                        decision_id: 'test-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
                userId: 'override-user-456',
            };

            await DecisionReplayService.replayDecision(request, mockUserToken);

            const opaCall = (axios.post as jest.Mock).mock.calls[0];
            expect(opaCall[1].input.subject.uniqueID).toBe('override-user-456');
        });

        it('should use override context when provided', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: { allow: true, reason: 'OK' },
                        decision_id: 'test-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
                context: {
                    currentTime: '2025-01-01T00:00:00Z',
                    sourceIP: '192.168.1.1',
                    deviceCompliant: false,
                },
            };

            await DecisionReplayService.replayDecision(request, mockUserToken);

            const opaCall = (axios.post as jest.Mock).mock.calls[0];
            expect(opaCall[1].input.context.currentTime).toBe('2025-01-01T00:00:00Z');
            expect(opaCall[1].input.context.sourceIP).toBe('192.168.1.1');
            expect(opaCall[1].input.context.deviceCompliant).toBe(false);
        });

        it('should handle OPA response without decision wrapper', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        allow: true,
                        reason: 'Direct result',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
            };

            const result = await DecisionReplayService.replayDecision(request, mockUserToken);

            expect(result.decision).toBe('ALLOW');
            expect(result.reason).toBe('Direct result');
        });

        it('should extract obligations from OPA response', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: true,
                            reason: 'OK',
                            obligations: [
                                { type: 'KAS', action: 'REQUEST_KEY', resourceId: 'doc-123' },
                            ],
                        },
                        decision_id: 'test-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
            };

            const result = await DecisionReplayService.replayDecision(request, mockUserToken);

            expect(result.obligations).toHaveLength(1);
            expect(result.obligations?.[0].type).toBe('KAS');
            expect(result.obligations?.[0].status).toBe('pending');
        });

        it('should use legacy fields when ZTDF not present', async () => {
            const resourceWithoutZTDF = {
                resourceId: 'doc-456',
                legacy: {
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA'],
                    COI: [],
                    creationDate: '2024-01-01T00:00:00Z',
                    encrypted: false,
                },
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(resourceWithoutZTDF);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: { allow: true, reason: 'OK' },
                        decision_id: 'test-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-456',
            };

            await DecisionReplayService.replayDecision(request, mockUserToken);

            const opaCall = (axios.post as jest.Mock).mock.calls[0];
            expect(opaCall[1].input.resource.classification).toBe('CONFIDENTIAL');
            expect(opaCall[1].input.resource.releasabilityTo).toEqual(['USA']);
        });
    });

    describe('buildReplaySteps - Authentication', () => {
        it('should pass authentication when user is authenticated', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const authStep = steps.find((s: any) => s.rule === 'is_not_authenticated');
            expect(authStep.result).toBe('PASS');
            expect(authStep.reason).toContain('authenticated');
        });

        it('should fail authentication when user not authenticated', () => {
            const input = {
                subject: { authenticated: false, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'DENY');

            const authStep = steps.find((s: any) => s.rule === 'is_not_authenticated');
            expect(authStep.result).toBe('FAIL');
        });
    });

    describe('compareClearance', () => {
        it('should allow equal clearances', () => {
            const result = (DecisionReplayService as any).compareClearance('SECRET', 'SECRET');
            expect(result).toBe(true);
        });

        it('should allow higher clearance accessing lower classification', () => {
            const result = (DecisionReplayService as any).compareClearance('TOP_SECRET', 'SECRET');
            expect(result).toBe(true);
        });

        it('should deny lower clearance accessing higher classification', () => {
            const result = (DecisionReplayService as any).compareClearance('CONFIDENTIAL', 'SECRET');
            expect(result).toBe(false);
        });

        it('should handle RESTRICTED level correctly', () => {
            // UNCLASSIFIED cannot access RESTRICTED
            expect((DecisionReplayService as any).compareClearance('UNCLASSIFIED', 'RESTRICTED')).toBe(false);
            
            // RESTRICTED can access UNCLASSIFIED
            expect((DecisionReplayService as any).compareClearance('RESTRICTED', 'UNCLASSIFIED')).toBe(true);
            
            // CONFIDENTIAL can access RESTRICTED
            expect((DecisionReplayService as any).compareClearance('CONFIDENTIAL', 'RESTRICTED')).toBe(true);
        });

        it('should handle unknown clearance levels', () => {
            const result = (DecisionReplayService as any).compareClearance('UNKNOWN', 'SECRET');
            expect(result).toBe(false);
        });

        it('should handle all clearance levels in order', () => {
            const levels = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
            
            // Each level should access itself
            levels.forEach(level => {
                expect((DecisionReplayService as any).compareClearance(level, level)).toBe(true);
            });

            // Higher levels should access lower
            expect((DecisionReplayService as any).compareClearance('TOP_SECRET', 'UNCLASSIFIED')).toBe(true);
            expect((DecisionReplayService as any).compareClearance('SECRET', 'CONFIDENTIAL')).toBe(true);
        });
    });

    describe('buildReplaySteps - Releasability', () => {
        it('should pass when user country in releasabilityTo', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA', 'GBR'], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const releaseStep = steps.find((s: any) => s.rule === 'is_not_releasable_to_country');
            expect(releaseStep.result).toBe('PASS');
        });

        it('should fail when user country not in releasabilityTo', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'FRA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA', 'GBR'], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'DENY');

            const releaseStep = steps.find((s: any) => s.rule === 'is_not_releasable_to_country');
            expect(releaseStep.result).toBe('FAIL');
        });
    });

    describe('buildReplaySteps - COI', () => {
        it('should pass when user COI intersects resource COI', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: ['FVEY', 'NATO'] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: ['FVEY'] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const coiStep = steps.find((s: any) => s.rule === 'is_coi_violation');
            expect(coiStep.result).toBe('PASS');
            expect(coiStep.reason).toContain('FVEY');
        });

        it('should pass when resource has no COI restrictions', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const coiStep = steps.find((s: any) => s.rule === 'is_coi_violation');
            expect(coiStep.result).toBe('PASS');
            expect(coiStep.reason).toContain('no COI restrictions');
        });

        it('should fail when no COI overlap', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: ['NATO'] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: ['FVEY'] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'DENY');

            const coiStep = steps.find((s: any) => s.rule === 'is_coi_violation');
            expect(coiStep.result).toBe('FAIL');
            expect(coiStep.reason).toContain('No COI overlap');
        });
    });

    describe('buildReplaySteps - Embargo', () => {
        it('should pass when embargo is lifted', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [], creationDate: '2020-01-01T00:00:00Z' },
                context: { currentTime: '2025-01-01T00:00:00Z', sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const embargoStep = steps.find((s: any) => s.rule === 'is_under_embargo');
            expect(embargoStep.result).toBe('PASS');
        });

        it('should fail when resource is under embargo', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [], creationDate: '2030-01-01T00:00:00Z' },
                context: { currentTime: '2025-01-01T00:00:00Z', sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'DENY');

            const embargoStep = steps.find((s: any) => s.rule === 'is_under_embargo');
            expect(embargoStep.result).toBe('FAIL');
        });

        it('should pass when no creation date', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: ['USA'], COI: [] },
                context: { currentTime: '2025-01-01T00:00:00Z', sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'ALLOW');

            const embargoStep = steps.find((s: any) => s.rule === 'is_under_embargo');
            expect(embargoStep.result).toBe('PASS');
        });
    });

    describe('buildProvenance', () => {
        it('should build complete provenance', () => {
            const provenance = (DecisionReplayService as any).buildProvenance(mockUserToken);

            expect(provenance.subject.issuer.value).toBe(mockUserToken.iss);
            expect(provenance.subject.uniqueID.value).toBe(mockUserToken.sub);
            expect(provenance.subject.clearance.value).toBe(mockUserToken.clearance);
            expect(provenance.subject.countryOfAffiliation.value).toBe(mockUserToken.countryOfAffiliation);
        });

        it('should handle custom countryOfAffiliation source', () => {
            const tokenWithSource = {
                ...mockUserToken,
                countryOfAffiliation_source: 'SAML Attribute',
            };

            const provenance = (DecisionReplayService as any).buildProvenance(tokenWithSource);

            expect(provenance.subject.countryOfAffiliation.source).toBe('SAML Attribute');
        });

        it('should default to derived source when no explicit source', () => {
            const provenance = (DecisionReplayService as any).buildProvenance(mockUserToken);

            expect(provenance.subject.countryOfAffiliation.source).toBe('Derived (email domain)');
        });
    });

    describe('Edge Cases', () => {
        it('should handle axios errors gracefully', async () => {
            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

            const request = {
                resourceId: 'doc-123',
            };

            await expect(
                DecisionReplayService.replayDecision(request, mockUserToken)
            ).rejects.toThrow('Network error');
        });

        it('should handle missing acpCOI in token', async () => {
            const tokenWithoutCOI = {
                ...mockUserToken,
                acpCOI: undefined,
            };

            (resourceService.getResourceById as jest.Mock).mockResolvedValue(mockResource);
            (axios.post as jest.Mock).mockResolvedValue({
                data: {
                    result: {
                        decision: { allow: true, reason: 'OK' },
                        decision_id: 'test-id',
                    },
                },
            });

            const request = {
                resourceId: 'doc-123',
            };

            const result = await DecisionReplayService.replayDecision(request, tokenWithoutCOI);

            expect(result.decision).toBe('ALLOW');
        });

        it('should handle empty releasabilityTo array', () => {
            const input = {
                subject: { authenticated: true, clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: [] },
                action: { operation: 'read' },
                resource: { resourceId: 'doc-1', classification: 'SECRET', releasabilityTo: [], COI: [] },
                context: { currentTime: new Date().toISOString(), sourceIP: '127.0.0.1', deviceCompliant: true, requestId: 'test' },
            };

            const steps = (DecisionReplayService as any).buildReplaySteps(input, 'DENY');

            const releaseStep = steps.find((s: any) => s.rule === 'is_not_releasable_to_country');
            expect(releaseStep.result).toBe('FAIL');
        });
    });
});

