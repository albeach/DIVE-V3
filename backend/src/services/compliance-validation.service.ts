/**
 * @file compliance-validation.service.ts
 * @description Automated compliance validation for IdP submissions
 * 
 * Phase 2: Compliance Automation
 * 
 * Validates IdP submissions against NATO/DoD compliance requirements:
 * - ACP-240: NATO policy-based access control
 * - STANAG 4774: Security labeling capability
 * - STANAG 4778: Cryptographic binding support
 * - NIST 800-63-3: Digital identity guidelines (IAL/AAL/FAL)
 * 
 * Pilot-Appropriate Implementation:
 * - Document-based validation (keyword matching, PDF parsing)
 * - Partner-provided attestations (honor system)
 * - Simple heuristics (production would use NLP/ML)
 * - Manual review for complex cases
 */

import { logger } from '../utils/logger';
import { IIdPSubmission } from '../types/admin.types';
import {
    IComplianceCheckResult,
    IACP240Check,
    ISTANAG4774Check,
    ISTANAG4778Check,
    INIST80063Check,
    ComplianceStatus,
    ComplianceLevel,
    IdentityAssuranceLevel,
} from '../types/risk-scoring.types';

/**
 * Compliance Validation Service
 * 
 * Performs automated compliance checks against NATO/DoD standards.
 */
class ComplianceValidationService {
    /**
     * Validate compliance for IdP submission
     * 
     * @param submissionData - Full IdP submission with compliance documents
     * @returns Comprehensive compliance check results
     * 
     * @example
     * ```typescript
     * const compliance = await complianceValidationService.validateCompliance(submission);
     * console.log(`Overall: ${compliance.overall}, Score: ${compliance.score}/10`);
     * ```
     */
    async validateCompliance(submissionData: IIdPSubmission): Promise<IComplianceCheckResult> {
        const startTime = Date.now();
        logger.info('Starting compliance validation', {
            submissionId: submissionData.submissionId,
            alias: submissionData.alias,
        });

        try {
            // Check each standard
            const acp240 = this.checkACP240Compliance(submissionData);
            const stanag4774 = this.checkSTANAG4774Compliance(submissionData);
            const stanag4778 = this.checkSTANAG4778Compliance(submissionData);
            const nist80063 = this.checkNIST80063Compliance(submissionData);

            // Calculate total compliance score (max 10 points)
            const score = this.calculateComplianceScore({
                acp240,
                stanag4774,
                stanag4778,
                nist80063,
            });

            // Determine overall compliance level
            const overall = this.determineOverallCompliance({
                acp240,
                stanag4774,
                stanag4778,
                nist80063,
            });

            // Collect all gaps
            const gaps = [
                ...acp240.gaps,
                ...stanag4774.gaps,
                ...stanag4778.gaps,
                ...nist80063.gaps,
            ];

            // Generate recommendations
            const recommendations = this.generateComplianceRecommendations({
                acp240,
                stanag4774,
                stanag4778,
                nist80063,
            });

            const result: IComplianceCheckResult = {
                overall,
                standards: {
                    acp240,
                    stanag4774,
                    stanag4778,
                    nist80063,
                },
                score,
                gaps,
                recommendations,
                checkedAt: new Date().toISOString(),
            };

            const duration = Date.now() - startTime;
            logger.info('Compliance validation complete', {
                submissionId: submissionData.submissionId,
                overall,
                score,
                gapCount: gaps.length,
                durationMs: duration,
            });

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Compliance validation failed', {
                submissionId: submissionData.submissionId,
                error: error.message,
                durationMs: duration,
            });

            // Return fail-safe result
            return this.createFailSafeResult(error.message);
        }
    }

    /**
     * Check ACP-240 (NATO Access Control Policy) compliance
     * 
     * Requirements:
     * - Policy-based access control capability
     * - Attribute-based access (ABAC) support
     * - Audit logging (9+ event types)
     * - Data-centric security model
     * 
     * @private
     */
    private checkACP240Compliance(submission: IIdPSubmission): IACP240Check {
        const evidence: string[] = [];
        const gaps: string[] = [];

        // Check for ACP-240 certificate upload
        const hasCertificate = !!submission.complianceDocuments?.acp240Certificate;
        if (hasCertificate) {
            evidence.push('ACP-240 certificate uploaded');
        } else {
            gaps.push('No ACP-240 certificate or attestation provided');
        }

        // Check description for ABAC support
        const description = submission.description?.toLowerCase() || '';
        const abacSupport = description.includes('abac') ||
            description.includes('attribute-based') ||
            description.includes('policy-based');

        if (abacSupport) {
            evidence.push('ABAC capability mentioned in description');
        } else {
            gaps.push('ABAC support not documented');
        }

        // Check for audit logging mention
        const auditLogging = description.includes('audit') ||
            description.includes('logging') ||
            description.includes('event log');

        if (auditLogging) {
            evidence.push('Audit logging capability documented');
        } else {
            gaps.push('Audit logging not documented');
        }

        // Check for data-centric security
        const dataCentricSecurity = description.includes('data-centric') ||
            description.includes('data protection') ||
            description.includes('classification');

        if (dataCentricSecurity) {
            evidence.push('Data-centric security mentioned');
        } else {
            gaps.push('Data-centric security not documented');
        }

        // Determine status
        let status: ComplianceStatus;
        if (hasCertificate && abacSupport && auditLogging && dataCentricSecurity) {
            status = 'pass';
        } else if (hasCertificate || (abacSupport && auditLogging)) {
            status = 'partial';
        } else {
            status = 'fail';
        }

        // Calculate score (max 5 points for ACP-240)
        let score = 0;
        if (hasCertificate) score += 2; // Certificate = 2 points
        if (abacSupport) score += 1;
        if (auditLogging) score += 1;
        if (dataCentricSecurity) score += 1;

        return {
            applicable: true, // Always applicable for NATO coalition
            status,
            evidence,
            gaps,
            score,
            abacSupport,
            auditLogging,
            dataCentricSecurity,
        };
    }

    /**
     * Check STANAG 4774 (Security Labeling) compliance
     * 
     * Requirements:
     * - Security labeling capability for classification markings
     * - Support for NATO classification levels
     * 
     * @private
     */
    private checkSTANAG4774Compliance(submission: IIdPSubmission): ISTANAG4774Check {
        const evidence: string[] = [];
        const gaps: string[] = [];

        const description = submission.description?.toLowerCase() || '';

        // Check for security labeling support
        const labelingSupport = description.includes('security label') ||
            description.includes('classification label') ||
            description.includes('nato classification') ||
            description.includes('stanag 4774');

        if (labelingSupport) {
            evidence.push('Security labeling capability documented');
        } else {
            gaps.push('Security labeling support not documented');
        }

        // Determine status
        const status: ComplianceStatus = labelingSupport ? 'pass' : 'unknown';

        // Calculate score (max 2 points for STANAG 4774)
        const score = labelingSupport ? 2 : 0;

        return {
            applicable: true,
            status,
            evidence,
            gaps,
            score,
            labelingSupport,
        };
    }

    /**
     * Check STANAG 4778 (Cryptographic Binding) compliance
     * 
     * Requirements:
     * - Cryptographic binding for secure federations
     * - Token integrity protection
     * 
     * @private
     */
    private checkSTANAG4778Compliance(submission: IIdPSubmission): ISTANAG4778Check {
        const evidence: string[] = [];
        const gaps: string[] = [];

        const description = submission.description?.toLowerCase() || '';

        // Check for cryptographic binding support
        const cryptoBinding = description.includes('cryptographic binding') ||
            description.includes('token signing') ||
            description.includes('assertion signing') ||
            description.includes('stanag 4778');

        if (cryptoBinding) {
            evidence.push('Cryptographic binding documented');
        } else {
            gaps.push('Cryptographic binding not documented');
        }

        // Also check if SAML/OIDC crypto validation passed (from Phase 1)
        if (submission.validationResults?.algorithmCheck?.pass) {
            evidence.push('Strong cryptographic algorithms validated (Phase 1)');
        }

        // Determine status
        const status: ComplianceStatus = (cryptoBinding || submission.validationResults?.algorithmCheck?.pass)
            ? 'pass'
            : 'unknown';

        // Calculate score (max 1 point for STANAG 4778)
        const score = status === 'pass' ? 1 : 0;

        return {
            applicable: true,
            status,
            evidence,
            gaps,
            score,
            cryptoBinding: cryptoBinding || !!submission.validationResults?.algorithmCheck?.pass,
        };
    }

    /**
     * Check NIST 800-63-3 (Digital Identity Guidelines) compliance
     * 
     * Requirements:
     * - IAL (Identity Assurance Level)
     * - AAL (Authenticator Assurance Level)
     * - FAL (Federation Assurance Level)
     * 
     * @private
     */
    private checkNIST80063Compliance(submission: IIdPSubmission): INIST80063Check {
        const evidence: string[] = [];
        const gaps: string[] = [];

        const description = submission.description?.toLowerCase() || '';

        // Detect IAL
        let ial: IdentityAssuranceLevel = 'unknown';
        if (description.includes('ial3') || description.includes('biometric')) {
            ial = 'IAL3';
            evidence.push('IAL3: In-person + biometric identity proofing');
        } else if (description.includes('ial2') || description.includes('government id')) {
            ial = 'IAL2';
            evidence.push('IAL2: Remote government ID proofing');
        } else if (description.includes('ial1')) {
            ial = 'IAL1';
            evidence.push('IAL1: Self-asserted identity');
        } else {
            gaps.push('Identity Assurance Level (IAL) not documented');
        }

        // Detect AAL (Authenticator Assurance Level)
        let aal: string | undefined;
        if (description.includes('aal3') || description.includes('hardware token')) {
            aal = 'AAL3';
            evidence.push('AAL3: Hardware-based multi-factor authentication');
        } else if (description.includes('aal2') || submission.validationResults?.mfaCheck?.detected) {
            aal = 'AAL2';
            evidence.push('AAL2: Multi-factor authentication detected');
        } else if (description.includes('aal1')) {
            aal = 'AAL1';
            evidence.push('AAL1: Single-factor authentication');
        } else {
            gaps.push('Authenticator Assurance Level (AAL) not documented');
        }

        // Detect FAL (Federation Assurance Level)
        let fal: string | undefined;
        if (description.includes('fal3') || description.includes('encrypted assertion')) {
            fal = 'FAL3';
            evidence.push('FAL3: Encrypted assertions');
        } else if (description.includes('fal2') || description.includes('signed assertion')) {
            fal = 'FAL2';
            evidence.push('FAL2: Signed assertions');
        } else if (description.includes('fal1')) {
            fal = 'FAL1';
            evidence.push('FAL1: Bearer assertions');
        }

        // Determine status
        let status: ComplianceStatus;
        if (ial !== 'unknown' && aal && fal) {
            status = 'pass';
        } else if (ial !== 'unknown' || aal) {
            status = 'partial';
        } else {
            status = 'unknown';
        }

        // Calculate score (max 2 points for NIST)
        let score = 0;
        if (ial === 'IAL3') score += 1;
        else if (ial === 'IAL2') score += 0.7;
        else if (ial === 'IAL1') score += 0.3;

        if (aal) score += 1;

        score = Math.round(score); // Round to integer

        return {
            applicable: true,
            status,
            evidence,
            gaps,
            score,
            ial,
            aal,
            fal,
        };
    }

    /**
     * Calculate total compliance score (max 10 points)
     * 
     * Breakdown:
     * - ACP-240: 5 points
     * - STANAG 4774: 2 points
     * - STANAG 4778: 1 point
     * - NIST 800-63: 2 points
     * 
     * @private
     */
    private calculateComplianceScore(standards: {
        acp240: IACP240Check;
        stanag4774: ISTANAG4774Check;
        stanag4778: ISTANAG4778Check;
        nist80063: INIST80063Check;
    }): number {
        return standards.acp240.score +
            standards.stanag4774.score +
            standards.stanag4778.score +
            standards.nist80063.score;
    }

    /**
     * Determine overall compliance level
     * 
     * @private
     */
    private determineOverallCompliance(standards: {
        acp240: IACP240Check;
        stanag4774: ISTANAG4774Check;
        stanag4778: ISTANAG4778Check;
        nist80063: INIST80063Check;
    }): ComplianceLevel {
        const statuses = [
            standards.acp240.status,
            standards.stanag4774.status,
            standards.stanag4778.status,
            standards.nist80063.status,
        ];

        const passCount = statuses.filter(s => s === 'pass').length;
        const failCount = statuses.filter(s => s === 'fail').length;

        if (passCount === 4) {
            return 'compliant';
        } else if (failCount >= 2) {
            return 'non-compliant';
        } else {
            return 'partial';
        }
    }

    /**
     * Generate compliance recommendations
     * 
     * @private
     */
    private generateComplianceRecommendations(standards: {
        acp240: IACP240Check;
        stanag4774: ISTANAG4774Check;
        stanag4778: ISTANAG4778Check;
        nist80063: INIST80063Check;
    }): string[] {
        const recommendations: string[] = [];

        // ACP-240 recommendations
        if (standards.acp240.status !== 'pass') {
            if (!standards.acp240.abacSupport) {
                recommendations.push('ACP-240: Document attribute-based access control (ABAC) support');
            }
            if (!standards.acp240.auditLogging) {
                recommendations.push('ACP-240: Document comprehensive audit logging (9+ event types)');
            }
            if (standards.acp240.gaps.includes('No ACP-240 certificate or attestation provided')) {
                recommendations.push('ACP-240: Upload certification or attestation document');
            }
        }

        // STANAG 4774 recommendations
        if (!standards.stanag4774.labelingSupport) {
            recommendations.push('STANAG 4774: Document security labeling capability for NATO classifications');
        }

        // STANAG 4778 recommendations
        if (!standards.stanag4778.cryptoBinding) {
            recommendations.push('STANAG 4778: Document cryptographic binding for secure token exchange');
        }

        // NIST 800-63 recommendations
        if (standards.nist80063.ial === 'unknown') {
            recommendations.push('NIST 800-63: Specify Identity Assurance Level (IAL1/IAL2/IAL3)');
        }
        if (!standards.nist80063.aal) {
            recommendations.push('NIST 800-63: Specify Authenticator Assurance Level (AAL1/AAL2/AAL3)');
        }

        // General recommendations
        if (recommendations.length > 0) {
            recommendations.push('Contact DIVE V3 team for compliance guidance and templates');
        } else {
            recommendations.push('All compliance standards met - excellent work!');
        }

        return recommendations;
    }

    /**
     * Create fail-safe compliance result on error
     * 
     * @private
     */
    private createFailSafeResult(errorMessage: string): IComplianceCheckResult {
        const errorCheck = {
            applicable: true,
            status: 'unknown' as ComplianceStatus,
            evidence: [],
            gaps: [`Compliance check failed: ${errorMessage}`],
            score: 0,
        };

        return {
            overall: 'non-compliant',
            standards: {
                acp240: {
                    ...errorCheck,
                    abacSupport: false,
                    auditLogging: false,
                    dataCentricSecurity: false,
                },
                stanag4774: {
                    ...errorCheck,
                    labelingSupport: false,
                },
                stanag4778: {
                    ...errorCheck,
                    cryptoBinding: false,
                },
                nist80063: {
                    ...errorCheck,
                    ial: 'unknown',
                },
            },
            score: 0,
            gaps: [`Compliance validation failed: ${errorMessage}`],
            recommendations: ['Contact administrator for manual compliance review'],
            checkedAt: new Date().toISOString(),
        };
    }
}

// Export singleton instance
export const complianceValidationService = new ComplianceValidationService();
