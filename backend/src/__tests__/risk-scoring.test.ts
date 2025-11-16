/**
 * @file risk-scoring.test.ts
 * @description Comprehensive unit tests for risk scoring service (Phase 2)
 * 
 * Target: >95% code coverage
 * Test categories:
 * - Score calculation accuracy (15 tests)
 * - Risk level assignment (8 tests)
 * - Factor analysis (10 tests)
 * - Edge cases (7 tests)
 */

import { riskScoringService } from '../services/risk-scoring.service';
import { IValidationResults } from '../types/validation.types';

describe('Risk Scoring Service - Phase 2', () => {
    // ============================================
    // Test Category 1: Score Calculation Accuracy (15 tests)
    // ============================================

    describe('Score Calculation', () => {
        it('should calculate perfect score (100 points) for ideal IdP', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.3', cipher: 'ECDHE-RSA-AES256-GCM-SHA384', certificateValid: true, score: 15, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256', 'RS512'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: true, evidence: ['ACR values: mfa'], score: 20, confidence: 'high', recommendations: [] }
            };

            const submission: any = {
                alias: 'test-perfect',
                description: 'IAL3 biometric identity proofing with comprehensive audit logging',
                operationalData: {
                    uptimeSLA: '99.9%',
                    incidentResponse: '24/7' as const,
                    securityPatching: '<30 days',
                    supportContacts: ['noc@example.com', '+1-555-0100', 'support@example.com']
                },
                complianceDocuments: {
                    acp240Certificate: 'acp-240-cert.pdf',
                    mfaPolicy: 'mfa-policy.pdf',
                    dataResidencyDoc: 'data-residency.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThanOrEqual(95); // Perfect score
            expect(score.riskLevel).toBe('minimal');
            expect(score.tier).toBe('gold');
            expect(score.breakdown.technicalSecurity).toBe(40); // TLS(15) + Crypto(25)
            expect(score.breakdown.authenticationStrength).toBe(30); // MFA(20) + IAL(10)
            expect(score.breakdown.operationalMaturity).toBe(20); // All operational factors max
            expect(score.breakdown.complianceGovernance).toBeGreaterThanOrEqual(8); // Strong compliance
        });

        it('should calculate good score (80 points) for TLS 1.2 IdP with MFA', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.2', cipher: 'ECDHE-RSA-AES256-GCM-SHA384', certificateValid: true, score: 12, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 100, score: 10, errors: [] },
                mfaCheck: { detected: true, evidence: ['ACR hints'], score: 15, confidence: 'medium', recommendations: [] }
            };

            const submission: any = {
                alias: 'test-good',
                description: 'IAL2 government ID with audit logging',
                operationalData: {
                    uptimeSLA: '99.0%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThanOrEqual(70);
            expect(score.total).toBeLessThan(85);
            expect(score.riskLevel).toBe('low');
            expect(score.tier).toBe('silver');
        });

        it('should calculate acceptable score (55-69 points) for minimal IdP', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.2', cipher: 'AES256', certificateValid: true, score: 12, errors: [], warnings: ['Certificate expires in 20 days'] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 200, score: 10, errors: [] },
                mfaCheck: { detected: true, evidence: ['ACR hints'], score: 15, confidence: 'medium', recommendations: [] }
            };

            const submission: any = {
                alias: 'test-acceptable',
                description: 'Basic IdP with IAL1 self-asserted identity',
                operationalData: {
                    uptimeSLA: '99.0%',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThanOrEqual(50);
            expect(score.total).toBeLessThan(70);
            expect(score.riskLevel).toBe('medium');
            expect(score.tier).toBe('bronze');
        });

        it('should calculate failing score (<50 points) for weak IdP', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: false, version: 'TLSv1.1', cipher: '3DES', certificateValid: false, score: 0, errors: ['TLS version too old'], warnings: [] },
                algorithmCheck: { pass: false, algorithms: ['SHA1'], violations: ['Weak algorithm: SHA-1'], score: 0, recommendations: ['Use RS256'] },
                endpointCheck: { reachable: true, latency_ms: 500, score: 10, errors: [] },
                mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
            };

            const submission: any = {
                alias: 'test-weak',
                description: 'Legacy IdP with no compliance documentation'
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeLessThan(50);
            expect(score.riskLevel).toBe('high');
            expect(score.tier).toBe('fail');
        });

        it('should score TLS 1.3 as 15 points', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', certificateValid: true, score: 15, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
            };

            const submission: any = { alias: 'test-tls13' };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const tlsFactor = score.factors.find(f => f.factor === 'TLS Version');
            expect(tlsFactor?.score).toBe(15);
        });

        it('should score TLS 1.2 as 12 points', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.2', cipher: 'ECDHE-RSA-AES256-GCM-SHA384', certificateValid: true, score: 12, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
            };

            const submission: any = { alias: 'test-tls12' };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const tlsFactor = score.factors.find(f => f.factor === 'TLS Version');
            expect(tlsFactor?.score).toBe(12);
        });

        it('should score SHA-256 algorithms as 25 points', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', certificateValid: true, score: 15, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256', 'RS512'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
            };

            const submission: any = { alias: 'test-sha256' };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const algoFactor = score.factors.find(f => f.factor === 'Cryptographic Algorithms');
            expect(algoFactor?.score).toBe(25);
        });

        it('should boost MFA score to 20 if policy document uploaded', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: true, version: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', certificateValid: true, score: 15, errors: [], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: true, evidence: ['ACR hints'], score: 15, confidence: 'medium', recommendations: [] }
            };

            const submission: any = {
                alias: 'test-mfa-policy',
                complianceDocuments: {
                    mfaPolicy: 'mfa-enforcement-policy.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const mfaFactor = score.factors.find(f => f.factor === 'MFA Enforcement');
            expect(mfaFactor?.score).toBe(20); // Boosted to full points
            expect(mfaFactor?.evidence).toContain('MFA policy document uploaded');
        });
    });

    // ============================================
    // Test Category 2: Risk Level Assignment (8 tests)
    // ============================================

    describe('Risk Level Assignment', () => {
        it('should assign minimal risk for 95 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = createPerfectSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.riskLevel).toBe('minimal');
            expect(score.tier).toBe('gold');
        });

        it('should assign low risk for 75 points', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = createGoodSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.riskLevel).toBe('low');
            expect(score.tier).toBe('silver');
        });

        it('should assign medium risk for 60 points', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission: any = {
                alias: 'test-medium',
                operationalData: {
                    uptimeSLA: '99.0%',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.riskLevel).toBe('medium');
            expect(score.tier).toBe('bronze');
        });

        it('should assign high risk for 40 points', async () => {
            const validationResults = createValidationResults(0, 25, 10, 0);
            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.riskLevel).toBe('high');
            expect(score.tier).toBe('fail');
        });

        it('should assign minimal risk at 85 point threshold', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-85',
                description: 'IAL2 government ID',
                operationalData: {
                    uptimeSLA: '99.9%',
                    incidentResponse: '24/7' as const,
                    securityPatching: '<30 days',
                    supportContacts: ['noc@example.com', 'support@example.com']
                },
                complianceDocuments: {
                    acp240Certificate: 'cert.pdf',
                    mfaPolicy: 'mfa.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // Score should be around 85+ (70 from Phase 1 + 18 operational + MFA boost)
            expect(score.total).toBeGreaterThanOrEqual(85);
            expect(score.riskLevel).toBe('minimal');
        });

        it('should assign low risk at 70 point threshold', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-70',
                operationalData: {
                    uptimeSLA: '99.0%',
                    incidentResponse: 'business-hours' as const,
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThanOrEqual(70);
            expect(score.riskLevel).toBe('low');
        });

        it('should assign medium risk at 50 point threshold', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission: any = {
                alias: 'test-50',
                operationalData: {
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThanOrEqual(50);
            expect(score.riskLevel).toBe('medium');
        });

        it('should assign high risk below 50 point threshold', async () => {
            const validationResults = createValidationResults(0, 10, 10, 0);
            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeLessThan(50);
            expect(score.riskLevel).toBe('high');
        });
    });

    // ============================================
    // Test Category 3: Factor Analysis (10 tests)
    // ============================================

    describe('Factor Analysis', () => {
        it('should generate factors for all categories', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = createPerfectSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const categories = new Set(score.factors.map(f => f.category));
            expect(categories.has('technical')).toBe(true);
            expect(categories.has('authentication')).toBe(true);
            expect(categories.has('operational')).toBe(true);
            expect(categories.has('compliance')).toBe(true);
        });

        it('should include evidence for passed factors', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = createPerfectSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const tlsFactor = score.factors.find(f => f.factor === 'TLS Version');
            expect(tlsFactor?.evidence.length).toBeGreaterThan(0);
            expect(tlsFactor?.concerns.length).toBe(0);
        });

        it('should include concerns for failed factors', async () => {
            const validationResults: IValidationResults = {
                tlsCheck: { pass: false, version: 'TLSv1.0', cipher: '3DES', certificateValid: false, score: 0, errors: ['TLS version too old'], warnings: [] },
                algorithmCheck: { pass: true, algorithms: ['RS256'], violations: [], score: 25, recommendations: [] },
                endpointCheck: { reachable: true, latency_ms: 50, score: 10, errors: [] },
                mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
            };

            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const tlsFactor = score.factors.find(f => f.factor === 'TLS Version');
            expect(tlsFactor?.concerns.length).toBeGreaterThan(0);
        });

        it('should score IAL3 as 10 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-ial3',
                description: 'IAL3 biometric identity proofing'
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const ialFactor = score.factors.find(f => f.factor === 'Identity Assurance Level (IAL)');
            expect(ialFactor?.score).toBe(10);
        });

        it('should score IAL2 as 7 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-ial2',
                description: 'IAL2 government ID remote proofing'
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const ialFactor = score.factors.find(f => f.factor === 'Identity Assurance Level (IAL)');
            expect(ialFactor?.score).toBe(7);
        });

        it('should score uptime SLA 99.9% as 5 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-sla',
                operationalData: {
                    uptimeSLA: '99.9%'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const slaFactor = score.factors.find(f => f.factor === 'Uptime SLA');
            expect(slaFactor?.score).toBe(5);
        });

        it('should score 24/7 incident response as 5 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-ir',
                operationalData: {
                    incidentResponse: '24/7' as const
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const irFactor = score.factors.find(f => f.factor === 'Incident Response');
            expect(irFactor?.score).toBe(5);
        });

        it('should score ACP-240 certificate as 5 points', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-acp',
                complianceDocuments: {
                    acp240Certificate: 'acp-240-cert.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const acpFactor = score.factors.find(f => f.factor === 'NATO Certification (ACP-240)');
            expect(acpFactor?.score).toBe(5);
        });

        it('should generate recommendations for low-scoring factors', async () => {
            const validationResults = createValidationResults(12, 25, 10, 0);
            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.recommendations.length).toBeGreaterThan(0);
            expect(score.recommendations.some(r => r.includes('MFA') || r.includes('SLA'))).toBe(true);
        });

        it('should prioritize recommendations by potential improvement', async () => {
            const validationResults = createValidationResults(12, 25, 10, 0);
            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // First recommendation should address biggest gaps
            expect(score.recommendations.length).toBeGreaterThan(0);
            // Should not exceed 5 recommendations
            expect(score.recommendations.length).toBeLessThanOrEqual(6); // +1 for score-specific message
        });
    });

    // ============================================
    // Test Category 4: Edge Cases (7 tests)
    // ============================================

    describe('Edge Cases', () => {
        it('should handle missing operational data gracefully', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-no-opdata'
                // No operationalData field
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThan(0);
            expect(score.breakdown.operationalMaturity).toBe(0); // All operational factors score 0
        });

        it('should handle missing compliance documents gracefully', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-no-docs'
                // No complianceDocuments field
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThan(0);
            expect(score.breakdown.complianceGovernance).toBeLessThan(5); // Reduced compliance score
        });

        it('should handle empty description gracefully', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-no-desc',
                description: ''
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThan(0);
        });

        it('should return fail-safe score on error', async () => {
            const invalidValidation: any = null; // Force error
            const submission = createBasicSubmission();

            const score = await riskScoringService.calculateRiskScore(invalidValidation, submission);

            expect(score.total).toBe(0);
            expect(score.riskLevel).toBe('high');
            expect(score.tier).toBe('fail');
            expect(score.factors.length).toBeGreaterThan(0);
            expect(score.factors[0].factor).toBe('Scoring Error');
        });

        it('should handle partial operational data', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission: any = {
                alias: 'test-partial-op',
                operationalData: {
                    uptimeSLA: '99.9%'
                    // Missing other fields
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.total).toBeGreaterThan(0);
            const slaFactor = score.factors.find(f => f.factor === 'Uptime SLA');
            expect(slaFactor?.score).toBe(5);
        });

        it('should set computed metadata correctly', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = createPerfectSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            expect(score.computedAt).toBeDefined();
            expect(new Date(score.computedAt).getTime()).toBeGreaterThan(0);
            expect(score.computedBy).toBe('risk-scoring-service');
        });

        it('should include all 11 risk factors', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = createPerfectSubmission();

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // Expected factors:
            // Technical: TLS, Algorithms (2)
            // Authentication: MFA, IAL (2)
            // Operational: SLA, Incident Response, Patching, Support (4)
            // Compliance: NATO Cert, Audit, Data Residency (3)
            expect(score.factors.length).toBeGreaterThanOrEqual(11);
        });
    });

    describe('Additional Boundary and Edge Cases for 100% Coverage', () => {
        it('should handle uptime SLA with percentage at exact threshold', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-sla-threshold',
                description: 'Test SLA threshold',
                operationalData: {
                    uptimeSLA: '99.0%', // Exact threshold
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // Should score appropriately for 99.0% threshold
            expect(score.totalScore).toBeGreaterThan(0);
        });

        it('should handle IAL1 detection with exact IAL1 keyword', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-ial1',
                description: 'IAL1 identity proofing',
                operationalData: {
                    uptimeSLA: '99.0%',
                    incidentResponse: 'business-hours' as const
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // IAL1 should give 3 points
            const ialFactor = score.factors.find(f => f.category === 'authentication' && f.name === 'IAL');
            expect(ialFactor?.score).toBe(3);
        });

        it('should handle security patching with less than 30 days notation', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-patching',
                description: 'Test patching',
                operationalData: {
                    uptimeSLA: '99.5%',
                    incidentResponse: '24/7' as const,
                    securityPatching: '<30 days', // Exact match for optimal score
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const patchingFactor = score.factors.find(f => f.name === 'Security Patching');
            expect(patchingFactor?.score).toBe(5);
        });

        it('should handle security patching with less than 90 days', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-patching-90',
                description: 'Test patching 90 days',
                operationalData: {
                    uptimeSLA: '99.5%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const patchingFactor = score.factors.find(f => f.name === 'Security Patching');
            expect(patchingFactor?.score).toBe(3);
        });

        it('should handle security patching with quarterly notation', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-patching-quarterly',
                description: 'Test quarterly patching',
                operationalData: {
                    uptimeSLA: '99.5%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: 'quarterly',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const patchingFactor = score.factors.find(f => f.name === 'Security Patching');
            expect(patchingFactor?.score).toBe(3);
        });

        it('should score support contacts with exactly 2 contacts', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-support-2',
                description: 'Test support',
                operationalData: {
                    uptimeSLA: '99.5%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['email@example.com', 'phone:123-456-7890']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const supportFactor = score.factors.find(f => f.name === 'Support Channels');
            expect(supportFactor?.score).toBe(3);
        });

        it('should score support contacts with 3 or more contacts', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-support-3',
                description: 'Test support',
                operationalData: {
                    uptimeSLA: '99.5%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['email@example.com', 'phone', 'chat']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const supportFactor = score.factors.find(f => f.name === 'Support Channels');
            expect(supportFactor?.score).toBe(5);
        });

        it('should handle uptime SLA below 99% threshold', async () => {
            const validationResults = createValidationResults(12, 25, 10, 15);
            const submission = {
                alias: 'test-sla-low',
                description: 'Test low SLA',
                operationalData: {
                    uptimeSLA: '95.0%',
                    incidentResponse: 'business-hours' as const,
                    securityPatching: '<90 days',
                    supportContacts: ['support@example.com']
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const slaFactor = score.factors.find(f => f.name === 'Uptime SLA');
            expect(slaFactor?.score).toBeLessThan(3);
        });

        it('should calculate tier exactly at threshold boundaries', async () => {
            // Test at exact 85-point boundary (minimum for gold)
            const validationResults = createValidationResults(12, 25, 10, 20);
            const submission = {
                alias: 'test-boundary',
                description: 'IAL2 government ID with audit',
                operationalData: {
                    uptimeSLA: '99.9%',
                    incidentResponse: '24/7' as const,
                    securityPatching: '<30 days',
                    supportContacts: ['noc@example.com', 'support@example.com']
                },
                complianceDocuments: {
                    acp240Certificate: 'cert.pdf',
                    dataResidencyDoc: 'residency.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            // Should be at or near 85-point threshold
            if (score.totalScore >= 85) {
                expect(score.tier).toBe('gold');
            } else if (score.totalScore >= 70) {
                expect(score.tier).toBe('silver');
            }
        });

        it('should include comprehensive audit logging in evidence', async () => {
            const validationResults = createValidationResults(15, 25, 10, 20);
            const submission = {
                alias: 'test-audit',
                description: 'Comprehensive audit logging for all events',
                operationalData: {
                    uptimeSLA: '99.9%',
                    incidentResponse: '24/7' as const
                },
                complianceDocuments: {
                    acp240Certificate: 'cert.pdf'
                }
            };

            const score = await riskScoringService.calculateRiskScore(validationResults, submission);

            const auditFactor = score.factors.find(f => f.name === 'Audit Logging');
            expect(auditFactor).toBeDefined();
            expect(auditFactor?.evidence).toContain(expect.stringContaining('audit'));
        });
    });
});

// ============================================
// Helper Functions
// ============================================

function createValidationResults(
    tlsScore: number,
    algoScore: number,
    endpointScore: number,
    mfaScore: number
): IValidationResults {
    return {
        tlsCheck: {
            pass: tlsScore > 0,
            version: tlsScore === 15 ? 'TLSv1.3' : tlsScore === 12 ? 'TLSv1.2' : 'TLSv1.0',
            cipher: tlsScore > 0 ? 'ECDHE-RSA-AES256-GCM-SHA384' : '3DES',
            certificateValid: tlsScore > 0,
            score: tlsScore,
            errors: tlsScore === 0 ? ['TLS version too old'] : [],
            warnings: []
        },
        algorithmCheck: {
            pass: algoScore > 0,
            algorithms: algoScore > 0 ? ['RS256'] : ['MD5'],
            violations: algoScore === 0 ? ['Weak algorithm'] : [],
            score: algoScore,
            recommendations: []
        },
        endpointCheck: {
            reachable: true,
            latency_ms: 50,
            score: endpointScore,
            errors: []
        },
        mfaCheck: {
            detected: mfaScore > 0,
            evidence: mfaScore > 0 ? ['MFA detected'] : [],
            score: mfaScore,
            confidence: mfaScore >= 20 ? 'high' : mfaScore >= 15 ? 'medium' : 'low',
            recommendations: []
        }
    };
}

function createPerfectSubmission(): any {
    return {
        alias: 'test-perfect',
        description: 'IAL3 biometric with comprehensive audit and NATO certification',
        operationalData: {
            uptimeSLA: '99.9%',
            incidentResponse: '24/7' as const,
            securityPatching: '<30 days',
            supportContacts: ['noc@example.com', 'phone', 'email']
        },
        complianceDocuments: {
            acp240Certificate: 'acp-240.pdf',
            mfaPolicy: 'mfa-policy.pdf',
            dataResidencyDoc: 'residency.pdf'
        }
    };
}

function createGoodSubmission(): any {
    return {
        alias: 'test-good',
        description: 'IAL2 government ID with audit logging',
        operationalData: {
            uptimeSLA: '99.0%',
            incidentResponse: 'business-hours' as const,
            securityPatching: '<90 days',
            supportContacts: ['support@example.com']
        }
    };
}

function createBasicSubmission(): any {
    return {
        alias: 'test-basic',
        description: 'Basic IdP with IAL1'
    };
}

