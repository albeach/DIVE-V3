/**
 * @file risk-scoring.service.ts
 * @description Comprehensive risk scoring engine for IdP submissions
 * 
 * Phase 2: Risk Scoring & Compliance Automation
 * 
 * Implements 100-point comprehensive risk assessment:
 * - Technical Security (40pts): TLS, cryptography (from Phase 1)
 * - Authentication Strength (30pts): MFA, identity assurance (NEW)
 * - Operational Maturity (20pts): SLA, incident response, patching (NEW)
 * - Compliance & Governance (10pts): NATO certs, audit logging (NEW)
 * 
 * Risk Levels:
 * - Minimal (85-100): Auto-approved, gold tier
 * - Low (70-84): Fast-track review, silver tier
 * - Medium (50-69): Standard review, bronze tier
 * - High (<50): Auto-reject or detailed review, fail tier
 */

import { logger } from '../utils/logger';
import { IValidationResults } from '../types/validation.types';
import { IIdPSubmission } from '../types/admin.types';
import {
    IComprehensiveRiskScore,
    IRiskFactor,
    RiskLevel,
    RiskTier,
    IdentityAssuranceLevel,
    IRiskScoringConfig,
} from '../types/risk-scoring.types';

/**
 * Default risk scoring configuration
 */
const DEFAULT_CONFIG: IRiskScoringConfig = {
    autoApproveThreshold: parseInt(process.env.AUTO_APPROVE_THRESHOLD || '85', 10),
    fastTrackThreshold: parseInt(process.env.FAST_TRACK_THRESHOLD || '70', 10),
    autoRejectThreshold: parseInt(process.env.AUTO_REJECT_THRESHOLD || '50', 10),
    fastTrackSLAHours: parseInt(process.env.FAST_TRACK_SLA_HOURS || '2', 10),
    standardReviewSLAHours: parseInt(process.env.STANDARD_REVIEW_SLA_HOURS || '24', 10),
    detailedReviewSLAHours: parseInt(process.env.DETAILED_REVIEW_SLA_HOURS || '72', 10),
    strictComplianceMode: process.env.COMPLIANCE_STRICT_MODE === 'true',
    requireACP240Cert: process.env.REQUIRE_ACP240_CERT === 'true',
    requireMFAPolicyDoc: process.env.REQUIRE_MFA_POLICY_DOC === 'true',
    minimumUptimeSLA: parseFloat(process.env.MINIMUM_UPTIME_SLA || '99.0'),
    require247Support: process.env.REQUIRE_247_SUPPORT === 'true',
    maxPatchingDays: parseInt(process.env.MAX_PATCHING_DAYS || '90', 10),
};

/**
 * Risk Scoring Service
 * 
 * Calculates comprehensive risk scores (100 points) for IdP submissions
 * based on technical security, authentication strength, operational maturity,
 * and compliance/governance factors.
 */
class RiskScoringService {
    private config: IRiskScoringConfig;

    constructor(config: IRiskScoringConfig = DEFAULT_CONFIG) {
        this.config = config;
    }

    /**
     * Calculate comprehensive risk score for IdP submission
     * 
     * @param validationResults - Phase 1 validation results (TLS, crypto, MFA, endpoints)
     * @param submissionData - Full IdP submission with operational data and compliance docs
     * @returns Comprehensive risk score with 100-point breakdown
     * 
     * @example
     * ```typescript
     * const score = await riskScoringService.calculateRiskScore(
     *   validationResults,
     *   submission
     * );
     * console.log(`Total: ${score.total}/100, Tier: ${score.tier}`);
     * ```
     */
    async calculateRiskScore(
        validationResults: IValidationResults,
        submissionData: IIdPSubmission
    ): Promise<IComprehensiveRiskScore> {
        const startTime = Date.now();
        logger.info('Starting comprehensive risk scoring', {
            submissionId: submissionData.submissionId,
            alias: submissionData.alias,
        });

        try {
            const factors: IRiskFactor[] = [];

            // Category A: Technical Security (40 points) - FROM PHASE 1
            const technicalFactors = this.scoreTechnicalSecurity(validationResults);
            factors.push(...technicalFactors);
            const technicalScore = this.sumFactorScores(technicalFactors);

            // Category B: Authentication Strength (30 points) - NEW
            const authFactors = this.scoreAuthenticationStrength(validationResults, submissionData);
            factors.push(...authFactors);
            const authScore = this.sumFactorScores(authFactors);

            // Category C: Operational Maturity (20 points) - NEW
            const operationalFactors = this.scoreOperationalMaturity(submissionData);
            factors.push(...operationalFactors);
            const operationalScore = this.sumFactorScores(operationalFactors);

            // Category D: Compliance & Governance (10 points) - NEW
            const complianceFactors = this.scoreComplianceGovernance(submissionData);
            factors.push(...complianceFactors);
            const complianceScore = this.sumFactorScores(complianceFactors);

            // Calculate total score
            const total = technicalScore + authScore + operationalScore + complianceScore;

            // Determine risk level and tier
            const riskLevel = this.determineRiskLevel(total);
            const tier = this.determineTier(total);

            // Generate recommendations
            const recommendations = this.generateRecommendations(factors, total);

            // Build comprehensive score
            const comprehensiveScore: IComprehensiveRiskScore = {
                total,
                riskLevel,
                tier,
                breakdown: {
                    technicalSecurity: technicalScore,
                    authenticationStrength: authScore,
                    operationalMaturity: operationalScore,
                    complianceGovernance: complianceScore,
                },
                factors,
                recommendations,
                computedAt: new Date().toISOString(),
                computedBy: 'risk-scoring-service',
            };

            const duration = Date.now() - startTime;
            logger.info('Comprehensive risk scoring complete', {
                submissionId: submissionData.submissionId,
                total,
                riskLevel,
                tier,
                durationMs: duration,
            });

            return comprehensiveScore;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error('Risk scoring failed', {
                submissionId: submissionData.submissionId,
                error: error.message,
                durationMs: duration,
            });

            // Return fail-safe minimal score
            return this.createFailSafeScore(error.message);
        }
    }

    /**
     * Score Technical Security factors (40 points max)
     * 
     * Based on Phase 1 validation results:
     * - TLS Version: 15 points (TLS 1.3=15, TLS 1.2=12, <1.2=0)
     * - Cryptography: 25 points (SHA-256+=25, SHA-1=10, MD5=0)
     * 
     * @private
     */
    private scoreTechnicalSecurity(validationResults: IValidationResults): IRiskFactor[] {
        const factors: IRiskFactor[] = [];

        // Factor 1: TLS Version (15 points)
        const tlsCheck = validationResults.tlsCheck;
        factors.push({
            category: 'technical',
            factor: 'TLS Version',
            score: tlsCheck.score,
            maxScore: 15,
            weight: 0.15,
            evidence: tlsCheck.pass
                ? [`TLS ${tlsCheck.version} detected`, `Cipher: ${tlsCheck.cipher}`]
                : [],
            concerns: tlsCheck.errors,
            recommendation: tlsCheck.score < 15
                ? 'Upgrade to TLS 1.3 for maximum security'
                : undefined,
        });

        // Factor 2: Cryptographic Algorithms (25 points)
        const algoCheck = validationResults.algorithmCheck;
        factors.push({
            category: 'technical',
            factor: 'Cryptographic Algorithms',
            score: algoCheck.score,
            maxScore: 25,
            weight: 0.25,
            evidence: algoCheck.pass
                ? [`Algorithms: ${algoCheck.algorithms.join(', ')}`]
                : [],
            concerns: algoCheck.violations,
            recommendation: algoCheck.recommendations[0],
        });

        return factors;
    }

    /**
     * Score Authentication Strength factors (30 points max)
     * 
     * NEW for Phase 2:
     * - MFA Enforcement: 20 points (policy doc=20, ACR hints=15, none=0)
     * - Identity Assurance Level: 10 points (IAL3=10, IAL2=7, IAL1=3)
     * 
     * @private
     */
    private scoreAuthenticationStrength(
        validationResults: IValidationResults,
        submissionData: IIdPSubmission
    ): IRiskFactor[] {
        const factors: IRiskFactor[] = [];

        // Factor 3: MFA Enforcement (20 points)
        const mfaCheck = validationResults.mfaCheck;
        const hasMFAPolicy = submissionData.complianceDocuments?.mfaPolicy !== undefined;

        let mfaScore = mfaCheck.score; // Base score from Phase 1 (0-20)

        // Boost score if policy document uploaded
        if (hasMFAPolicy && mfaScore < 20) {
            mfaScore = 20; // Full points for documented policy
        }

        // Strict mode enforcement
        if (this.config.requireMFAPolicyDoc && !hasMFAPolicy) {
            mfaScore = 0;
        }

        const mfaEvidence: string[] = [...mfaCheck.evidence];
        if (hasMFAPolicy) {
            mfaEvidence.push('MFA policy document uploaded');
        }

        const mfaConcerns: string[] = [];
        if (!mfaCheck.detected) {
            mfaConcerns.push('No MFA capability detected');
        }
        if (!hasMFAPolicy) {
            mfaConcerns.push('No MFA policy document uploaded');
        }

        factors.push({
            category: 'authentication',
            factor: 'MFA Enforcement',
            score: mfaScore,
            maxScore: 20,
            weight: 0.20,
            evidence: mfaEvidence,
            concerns: mfaConcerns,
            recommendation: mfaScore < 20
                ? 'Upload MFA enforcement policy document for full credit'
                : undefined,
        });

        // Factor 4: Identity Assurance Level (10 points)
        const ial = this.detectIdentityAssuranceLevel(submissionData);
        const ialScore = this.scoreIAL(ial);

        factors.push({
            category: 'authentication',
            factor: 'Identity Assurance Level (IAL)',
            score: ialScore,
            maxScore: 10,
            weight: 0.10,
            evidence: ial !== 'unknown' ? [`Identity Assurance Level: ${ial}`] : [],
            concerns: ial === 'unknown' ? ['IAL not documented'] : [],
            recommendation: ialScore < 10
                ? 'Document identity proofing process for higher IAL'
                : undefined,
        });

        return factors;
    }

    /**
     * Score Operational Maturity factors (20 points max)
     * 
     * NEW for Phase 2:
     * - Uptime SLA: 5 points (99.9%=5, 99%=3, <99%=0)
     * - Incident Response: 5 points (24/7=5, business-hours=3, none=0)
     * - Security Patching: 5 points (<30 days=5, <90 days=3, >90 days=0)
     * - Support Contacts: 5 points (multiple channels=5, email only=2, none=0)
     * 
     * @private
     */
    private scoreOperationalMaturity(submissionData: IIdPSubmission): IRiskFactor[] {
        const factors: IRiskFactor[] = [];
        const opData = submissionData.operationalData;

        // Factor 5: Uptime SLA (5 points)
        const uptimeScore = this.scoreUptimeSLA(opData?.uptimeSLA);
        factors.push({
            category: 'operational',
            factor: 'Uptime SLA',
            score: uptimeScore,
            maxScore: 5,
            weight: 0.05,
            evidence: opData?.uptimeSLA ? [`SLA: ${opData.uptimeSLA}`] : [],
            concerns: !opData?.uptimeSLA ? ['Uptime SLA not documented'] : [],
            recommendation: uptimeScore < 5
                ? 'Document uptime SLA commitment (target: 99.9%)'
                : undefined,
        });

        // Factor 6: Incident Response (5 points)
        const incidentScore = this.scoreIncidentResponse(opData?.incidentResponse);
        factors.push({
            category: 'operational',
            factor: 'Incident Response',
            score: incidentScore,
            maxScore: 5,
            weight: 0.05,
            evidence: opData?.incidentResponse
                ? [`Incident response: ${opData.incidentResponse}`]
                : [],
            concerns: !opData?.incidentResponse
                ? ['Incident response plan not documented']
                : [],
            recommendation: incidentScore < 5
                ? 'Establish 24/7 incident response capability'
                : undefined,
        });

        // Factor 7: Security Patching (5 points)
        const patchingScore = this.scoreSecurityPatching(opData?.securityPatching);
        factors.push({
            category: 'operational',
            factor: 'Security Patching',
            score: patchingScore,
            maxScore: 5,
            weight: 0.05,
            evidence: opData?.securityPatching
                ? [`Patching cadence: ${opData.securityPatching}`]
                : [],
            concerns: !opData?.securityPatching
                ? ['Security patching cadence not documented']
                : [],
            recommendation: patchingScore < 5
                ? 'Document security patching process (<30 days optimal)'
                : undefined,
        });

        // Factor 8: Support Contacts (5 points)
        const supportScore = this.scoreSupportContacts(opData?.supportContacts);
        factors.push({
            category: 'operational',
            factor: 'Support Contacts',
            score: supportScore,
            maxScore: 5,
            weight: 0.05,
            evidence: opData?.supportContacts
                ? [`Support channels: ${opData.supportContacts.length}`]
                : [],
            concerns: !opData?.supportContacts || opData.supportContacts.length === 0
                ? ['Support contacts not provided']
                : [],
            recommendation: supportScore < 5
                ? 'Provide multiple support channels (email, phone, NOC)'
                : undefined,
        });

        return factors;
    }

    /**
     * Score Compliance & Governance factors (10 points max)
     * 
     * NEW for Phase 2:
     * - NATO Certification: 5 points (ACP-240 certified=5, in progress=3, none=0)
     * - Audit Logging: 3 points (comprehensive=3, basic=2, none=0)
     * - Data Residency: 2 points (documented=2, none=0)
     * 
     * @private
     */
    private scoreComplianceGovernance(submissionData: IIdPSubmission): IRiskFactor[] {
        const factors: IRiskFactor[] = [];
        const docs = submissionData.complianceDocuments;

        // Factor 9: NATO Certification (5 points)
        const natoScore = this.scoreNATOCertification(docs?.acp240Certificate);
        factors.push({
            category: 'compliance',
            factor: 'NATO Certification (ACP-240)',
            score: natoScore,
            maxScore: 5,
            weight: 0.05,
            evidence: docs?.acp240Certificate ? ['ACP-240 certificate uploaded'] : [],
            concerns: !docs?.acp240Certificate ? ['ACP-240 certification not provided'] : [],
            recommendation: natoScore < 5
                ? 'Upload ACP-240 compliance certificate or attestation'
                : undefined,
        });

        // Factor 10: Audit Logging (3 points)
        const auditScore = this.scoreAuditLogging(submissionData);
        factors.push({
            category: 'compliance',
            factor: 'Audit Logging',
            score: auditScore,
            maxScore: 3,
            weight: 0.03,
            evidence: auditScore > 0 ? ['Audit logging documented'] : [],
            concerns: auditScore === 0 ? ['Audit logging capability not documented'] : [],
            recommendation: auditScore < 3
                ? 'Document comprehensive audit logging (9+ event types)'
                : undefined,
        });

        // Factor 11: Data Residency (2 points)
        const residencyScore = this.scoreDataResidency(docs?.dataResidencyDoc);
        factors.push({
            category: 'compliance',
            factor: 'Data Residency',
            score: residencyScore,
            maxScore: 2,
            weight: 0.02,
            evidence: docs?.dataResidencyDoc ? ['Data residency documented'] : [],
            concerns: !docs?.dataResidencyDoc ? ['Data location not documented'] : [],
            recommendation: residencyScore < 2
                ? 'Document data storage locations and sovereignty compliance'
                : undefined,
        });

        return factors;
    }

    // ============================================
    // Scoring Helper Methods
    // ============================================

    /**
     * Detect Identity Assurance Level from submission
     * 
     * @private
     */
    private detectIdentityAssuranceLevel(submission: IIdPSubmission): IdentityAssuranceLevel {
        // Check description or documentation for IAL mentions
        const description = submission.description?.toLowerCase() || '';

        if (description.includes('ial3') || description.includes('biometric')) {
            return 'IAL3';
        }
        if (description.includes('ial2') || description.includes('government id')) {
            return 'IAL2';
        }
        if (description.includes('ial1')) {
            return 'IAL1';
        }

        // Default: unknown (pilot-appropriate, assign lowest)
        return 'unknown';
    }

    /**
     * Score Identity Assurance Level
     * 
     * @private
     */
    private scoreIAL(ial: IdentityAssuranceLevel): number {
        switch (ial) {
            case 'IAL3':
                return 10; // Government-issued ID + biometric
            case 'IAL2':
                return 7; // Government-issued ID, remote
            case 'IAL1':
                return 3; // Self-asserted
            case 'unknown':
            default:
                return 3; // Default to IAL1 for pilot
        }
    }

    /**
     * Score Uptime SLA
     * 
     * @private
     */
    private scoreUptimeSLA(sla?: string): number {
        if (!sla) return 0;

        const slaNum = parseFloat(sla.replace('%', ''));

        if (slaNum >= 99.9) return 5;
        if (slaNum >= 99.0) return 3;
        return 0;
    }

    /**
     * Score Incident Response
     * 
     * @private
     */
    private scoreIncidentResponse(incidentResponse?: '24/7' | 'business-hours' | 'none'): number {
        if (!incidentResponse || incidentResponse === 'none') return 0;
        if (incidentResponse === '24/7') return 5;
        if (incidentResponse === 'business-hours') return 3;
        return 0;
    }

    /**
     * Score Security Patching
     * 
     * @private
     */
    private scoreSecurityPatching(patching?: string): number {
        if (!patching) return 0;

        const lowerPatching = patching.toLowerCase();

        if (lowerPatching.includes('<30') || lowerPatching.includes('30 days')) {
            return 5;
        }
        if (lowerPatching.includes('<90') || lowerPatching.includes('90 days')) {
            return 3;
        }

        return 0;
    }

    /**
     * Score Support Contacts
     * 
     * @private
     */
    private scoreSupportContacts(contacts?: string[]): number {
        if (!contacts || contacts.length === 0) return 0;
        if (contacts.length >= 3) return 5; // Multiple channels
        if (contacts.length === 1) return 2; // Email only
        return 3; // 2 channels
    }

    /**
     * Score NATO Certification
     * 
     * @private
     */
    private scoreNATOCertification(certificate?: string): number {
        if (!certificate) return 0;

        // Check if certificate indicates "in progress"
        if (certificate.toLowerCase().includes('progress')) return 3;

        // Full certification
        return 5;
    }

    /**
     * Score Audit Logging
     * 
     * Pilot-appropriate: Check if audit logging is mentioned in description
     * Production: Parse actual audit capability documentation
     * 
     * @private
     */
    private scoreAuditLogging(submission: IIdPSubmission): number {
        const description = submission.description?.toLowerCase() || '';

        // Comprehensive logging mentioned
        if (description.includes('comprehensive audit') || description.includes('full audit')) {
            return 3;
        }

        // Basic logging mentioned
        if (description.includes('audit') || description.includes('logging')) {
            return 2;
        }

        // No mention
        return 0;
    }

    /**
     * Score Data Residency
     * 
     * @private
     */
    private scoreDataResidency(doc?: string): number {
        return doc ? 2 : 0;
    }

    /**
     * Sum scores from risk factors
     * 
     * @private
     */
    private sumFactorScores(factors: IRiskFactor[]): number {
        return factors.reduce((sum, factor) => sum + factor.score, 0);
    }

    /**
     * Determine risk level from total score
     * 
     * @private
     */
    private determineRiskLevel(total: number): RiskLevel {
        if (total >= this.config.autoApproveThreshold) return 'minimal';
        if (total >= this.config.fastTrackThreshold) return 'low';
        if (total >= this.config.autoRejectThreshold) return 'medium';
        return 'high';
    }

    /**
     * Determine display tier from total score
     * 
     * @private
     */
    private determineTier(total: number): RiskTier {
        if (total >= this.config.autoApproveThreshold) return 'gold';
        if (total >= this.config.fastTrackThreshold) return 'silver';
        if (total >= this.config.autoRejectThreshold) return 'bronze';
        return 'fail';
    }

    /**
     * Generate prioritized recommendations
     * 
     * @private
     */
    private generateRecommendations(factors: IRiskFactor[], total: number): string[] {
        const recommendations: string[] = [];

        // Get factors sorted by potential improvement (maxScore - score)
        const sortedFactors = factors
            .filter(f => f.score < f.maxScore && f.recommendation)
            .sort((a, b) => (b.maxScore - b.score) - (a.maxScore - a.score));

        // Add top recommendations
        sortedFactors.slice(0, 5).forEach(factor => {
            if (factor.recommendation) {
                recommendations.push(`${factor.factor}: ${factor.recommendation}`);
            }
        });

        // Add score-specific recommendations
        if (total < this.config.autoRejectThreshold) {
            recommendations.unshift('CRITICAL: Score below minimum threshold. Address all concerns before resubmission.');
        } else if (total < this.config.fastTrackThreshold) {
            recommendations.unshift('Improve score to 70+ for fast-track approval.');
        } else if (total < this.config.autoApproveThreshold) {
            recommendations.unshift('Improve score to 85+ for automatic approval.');
        }

        return recommendations;
    }

    /**
     * Create fail-safe score on error
     * 
     * @private
     */
    private createFailSafeScore(errorMessage: string): IComprehensiveRiskScore {
        return {
            total: 0,
            riskLevel: 'high',
            tier: 'fail',
            breakdown: {
                technicalSecurity: 0,
                authenticationStrength: 0,
                operationalMaturity: 0,
                complianceGovernance: 0,
            },
            factors: [
                {
                    category: 'technical',
                    factor: 'Scoring Error',
                    score: 0,
                    maxScore: 100,
                    weight: 1.0,
                    evidence: [],
                    concerns: [`Risk scoring failed: ${errorMessage}`],
                    recommendation: 'Contact administrator for manual review',
                },
            ],
            recommendations: ['Risk scoring encountered an error. Manual review required.'],
            computedAt: new Date().toISOString(),
            computedBy: 'risk-scoring-service-error',
        };
    }
}

// Export singleton instance
export const riskScoringService = new RiskScoringService();
