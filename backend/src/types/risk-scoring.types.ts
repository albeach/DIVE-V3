/**
 * @file risk-scoring.types.ts
 * @description TypeScript type definitions for Phase 2 risk scoring and compliance validation
 * 
 * Phase 2: Comprehensive Risk Scoring & Compliance Automation
 * 
 * Extends Phase 1's preliminary scoring (0-70 points) with comprehensive
 * risk assessment (100 points) covering:
 * - Technical Security (40pts): TLS, cryptography (from Phase 1)
 * - Authentication Strength (30pts): MFA, identity assurance (NEW)
 * - Operational Maturity (20pts): SLA, incident response, patching (NEW)
 * - Compliance & Governance (10pts): NATO certs, audit logging (NEW)
 */

/**
 * Risk factor category types
 */
export type RiskCategory = 'technical' | 'authentication' | 'operational' | 'compliance';

/**
 * Risk level classification
 * 
 * Based on total score:
 * - Minimal: 85-100 points (Gold tier, auto-approved)
 * - Low: 70-84 points (Silver tier, fast-track 2hr SLA)
 * - Medium: 50-69 points (Bronze tier, standard 24hr SLA)
 * - High: <50 points (Fail tier, auto-reject or detailed review)
 */
export type RiskLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Risk tier badges for display
 */
export type RiskTier = 'gold' | 'silver' | 'bronze' | 'fail';

/**
 * Identity Assurance Level (NIST 800-63-3)
 * 
 * IAL1: Self-asserted identity (3 points)
 * IAL2: Remote identity proofing with government ID (7 points)
 * IAL3: In-person identity proofing with biometric (10 points)
 */
export type IdentityAssuranceLevel = 'IAL1' | 'IAL2' | 'IAL3' | 'unknown';

/**
 * Individual risk factor analysis
 * 
 * Represents a single scored factor within a category
 * with evidence, concerns, and recommendations.
 */
export interface IRiskFactor {
    /** Factor category (technical, authentication, operational, compliance) */
    category: RiskCategory;

    /** Factor name (e.g., 'TLS Version', 'MFA Enforcement', 'Uptime SLA') */
    factor: string;

    /** Points awarded for this factor */
    score: number;

    /** Maximum possible points for this factor */
    maxScore: number;

    /** Weight/importance of this factor (for display) */
    weight: number;

    /** Evidence supporting the score (e.g., 'TLS 1.3 detected') */
    evidence: string[];

    /** Concerns or issues identified (e.g., 'No MFA policy uploaded') */
    concerns: string[];

    /** Recommendation for improvement (optional) */
    recommendation?: string;
}

/**
 * Score breakdown by category
 * 
 * Shows points awarded in each of the 4 risk categories.
 */
export interface IScoreBreakdown {
    /** Technical security score (max 40 points) */
    technicalSecurity: number;

    /** Authentication strength score (max 30 points) */
    authenticationStrength: number;

    /** Operational maturity score (max 20 points) */
    operationalMaturity: number;

    /** Compliance & governance score (max 10 points) */
    complianceGovernance: number;
}

/**
 * Comprehensive risk score for Phase 2
 * 
 * Replaces preliminary scoring (0-70) with full 100-point assessment
 * covering technical, authentication, operational, and compliance factors.
 */
export interface IComprehensiveRiskScore {
    /** Total risk score (0-100 points) */
    total: number;

    /** Risk level classification */
    riskLevel: RiskLevel;

    /** Display tier (gold/silver/bronze/fail) */
    tier: RiskTier;

    /** Score breakdown by category */
    breakdown: IScoreBreakdown;

    /** Detailed risk factor analysis (all 30+ factors) */
    factors: IRiskFactor[];

    /** Prioritized recommendations for improvement */
    recommendations: string[];

    /** ISO 8601 timestamp when score was computed */
    computedAt: string;

    /** Service that computed the score */
    computedBy: string;
}

/**
 * Approval decision based on risk level
 * 
 * Determines workflow path and SLA deadlines based on
 * comprehensive risk score.
 */
export interface IApprovalDecision {
    /** Action to take */
    action: 'auto-approve' | 'fast-track' | 'standard-review' | 'detailed-review' | 'auto-reject';

    /** Human-readable reason for decision */
    reason: string;

    /** Whether manual admin review is required */
    requiresManualReview: boolean;

    /** SLA deadline for review (ISO 8601) */
    slaDeadline?: string;

    /** Rejection reasons (for auto-reject) */
    rejectionReasons?: string[];

    /** Recommended next steps for partner */
    nextSteps?: string[];
}

/**
 * SLA status indicator
 */
export type SLAStatus = 'within' | 'approaching' | 'exceeded';

// ============================================
// Compliance Validation Types
// ============================================

/**
 * Compliance status for a standard or requirement
 */
export type ComplianceStatus = 'pass' | 'partial' | 'fail' | 'unknown';

/**
 * Overall compliance level
 */
export type ComplianceLevel = 'compliant' | 'partial' | 'non-compliant';

/**
 * Standard or requirement check result
 * 
 * Represents validation of a single compliance standard
 * (e.g., ACP-240, STANAG 4774, NIST 800-63).
 */
export interface IStandardCheck {
    /** Whether this standard is applicable to the IdP */
    applicable: boolean;

    /** Compliance status */
    status: ComplianceStatus;

    /** Evidence of compliance (e.g., 'Certificate uploaded', 'ACR values present') */
    evidence: string[];

    /** Identified gaps or missing requirements */
    gaps: string[];

    /** Points awarded for this standard (contributes to compliance score) */
    score: number;
}

/**
 * NATO ACP-240 compliance check
 * 
 * Validates policy-based access control capabilities:
 * - Attribute-based access (ABAC)
 * - Audit logging (9 event types minimum)
 * - Data-centric security
 */
export interface IACP240Check extends IStandardCheck {
    /** Whether ABAC support is documented */
    abacSupport: boolean;

    /** Whether audit logging is documented */
    auditLogging: boolean;

    /** Whether data-centric security is documented */
    dataCentricSecurity: boolean;
}

/**
 * STANAG 4774 compliance check
 * 
 * Validates security labeling capability for NATO classification markings.
 */
export interface ISTANAG4774Check extends IStandardCheck {
    /** Whether security labeling is supported */
    labelingSupport: boolean;
}

/**
 * STANAG 4778 compliance check
 * 
 * Validates cryptographic binding support for secure federations.
 */
export interface ISTANAG4778Check extends IStandardCheck {
    /** Whether cryptographic binding is supported */
    cryptoBinding: boolean;
}

/**
 * NIST 800-63-3 compliance check
 * 
 * Validates digital identity guidelines alignment:
 * - IAL: Identity Assurance Level
 * - AAL: Authenticator Assurance Level
 * - FAL: Federation Assurance Level
 */
export interface INIST80063Check extends IStandardCheck {
    /** Identity Assurance Level (IAL1/IAL2/IAL3) */
    ial: IdentityAssuranceLevel;

    /** Authenticator Assurance Level (AAL1/AAL2/AAL3) */
    aal?: string;

    /** Federation Assurance Level (FAL1/FAL2/FAL3) */
    fal?: string;
}

/**
 * Comprehensive compliance validation result
 * 
 * Checks IdP submission against NATO/DoD compliance requirements:
 * - ACP-240 (policy-based access control)
 * - STANAG 4774 (security labeling)
 * - STANAG 4778 (cryptographic binding)
 * - NIST 800-63 (digital identity)
 */
export interface IComplianceCheckResult {
    /** Overall compliance level */
    overall: ComplianceLevel;

    /** Individual standard checks */
    standards: {
        /** ACP-240 compliance */
        acp240: IACP240Check;

        /** STANAG 4774 compliance */
        stanag4774: ISTANAG4774Check;

        /** STANAG 4778 compliance */
        stanag4778: ISTANAG4778Check;

        /** NIST 800-63-3 alignment */
        nist80063: INIST80063Check;
    };

    /** Total compliance score (0-10 points for governance category) */
    score: number;

    /** List of identified compliance gaps */
    gaps: string[];

    /** Recommendations for achieving compliance */
    recommendations: string[];

    /** ISO 8601 timestamp when compliance was checked */
    checkedAt: string;
}

// ============================================
// Operational Data Types
// ============================================

/**
 * Operational data provided by partner
 * 
 * Used to score operational maturity (20 points).
 * In pilot mode, this is honor system - partners upload documents
 * or provide attestations.
 */
export interface IOperationalData {
    /** Uptime SLA commitment (e.g., '99.9%', '99.5%', '99.0%') */
    uptimeSLA?: string;

    /** Incident response availability */
    incidentResponse?: '24/7' | 'business-hours' | 'none';

    /** Security patching cadence (e.g., '<30 days', '<90 days') */
    securityPatching?: string;

    /** Support contact methods (email, phone, NOC) */
    supportContacts?: string[];

    /** Whether 24/7 NOC is available */
    has247NOC?: boolean;

    /** Average response time for incidents (hours) */
    incidentResponseTimeHours?: number;
}

/**
 * Compliance document uploads
 * 
 * Partners can upload policy documents, certificates, and plans
 * to demonstrate compliance with standards.
 */
export interface IComplianceDocuments {
    /** ACP-240 certification or attestation */
    acp240Certificate?: string;

    /** MFA enforcement policy document */
    mfaPolicy?: string;

    /** Privacy policy document */
    privacyPolicy?: string;

    /** Incident response plan */
    incidentResponsePlan?: string;

    /** Security audit report */
    securityAuditReport?: string;

    /** Data residency documentation */
    dataResidencyDoc?: string;
}

// ============================================
// Risk Scoring Configuration
// ============================================

/**
 * Risk scoring configuration
 * 
 * Controls thresholds, weights, and behavior of risk scoring engine.
 */
export interface IRiskScoringConfig {
    /** Auto-approve threshold (default: 85 points) */
    autoApproveThreshold: number;

    /** Fast-track threshold (default: 70 points) */
    fastTrackThreshold: number;

    /** Auto-reject threshold (default: 50 points) */
    autoRejectThreshold: number;

    /** Fast-track SLA in hours (default: 2) */
    fastTrackSLAHours: number;

    /** Standard review SLA in hours (default: 24) */
    standardReviewSLAHours: number;

    /** Detailed review SLA in hours (default: 72) */
    detailedReviewSLAHours: number;

    /** Strict compliance mode (require all certs) */
    strictComplianceMode: boolean;

    /** Require ACP-240 certification */
    requireACP240Cert: boolean;

    /** Require MFA policy document */
    requireMFAPolicyDoc: boolean;

    /** Minimum uptime SLA percentage (default: 99.0) */
    minimumUptimeSLA: number;

    /** Require 24/7 support (default: false for pilot) */
    require247Support: boolean;

    /** Maximum patching window in days (default: 90) */
    maxPatchingDays: number;
}
