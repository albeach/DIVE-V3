/**
 * IdP Approval Service
 * 
 * Manages approval workflow for new Identity Providers
 * Stores submission state in MongoDB
 * 
 * Phase 2 Enhancements:
 * - Auto-approval for minimal risk (85+ points)
 * - Fast-track queue for low risk (70-84 points, 2hr SLA)
 * - Standard review for medium risk (50-69 points, 24hr SLA)
 * - Auto-reject for high risk (<50 points) or detailed review
 */

import { Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';
import { keycloakAdminService } from './keycloak-admin.service';
import { IIdPSubmission, IApprovalResponse } from '../types/admin.types';
import { IApprovalDecision, SLAStatus, IRiskScoringConfig } from '../types/risk-scoring.types';
import { IIdPCreateRequest } from '../types/keycloak.types';

/**
 * Default approval configuration
 */
const DEFAULT_APPROVAL_CONFIG: IRiskScoringConfig = {
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

const SUBMISSIONS_COLLECTION = 'idp_submissions';

class IdPApprovalService {
    private config: IRiskScoringConfig = DEFAULT_APPROVAL_CONFIG;

    /**
     * Get submissions collection
     */
    private getCollection(): Collection {
        const db = getDb();
        return db.collection(SUBMISSIONS_COLLECTION);
    }

    /**
     * Submit IdP for approval
     * Called after IdP created in Keycloak (in disabled state)
     */
    async submitIdPForApproval(submission: Omit<IIdPSubmission, 'submissionId' | 'submittedAt' | 'status'>): Promise<string> {
        try {
            const collection = this.getCollection();

            const submissionId = `sub-${Date.now()}-${Math.random().toString(36).substring(7)}`;

            const document: IIdPSubmission = {
                submissionId,
                ...submission,
                status: 'pending',
                submittedAt: new Date().toISOString()
            };

            await collection.insertOne(document);

            logger.info('IdP submission created', {
                submissionId,
                alias: submission.alias,
                submittedBy: submission.submittedBy
            });

            return submissionId;
        } catch (error) {
            logger.error('Failed to submit IdP for approval', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to submit IdP');
        }
    }

    /**
     * Get pending IdP submissions
     */
    async getPendingIdPs(): Promise<IIdPSubmission[]> {
        try {
            const collection = this.getCollection();

            const submissions = await collection
                .find({ status: 'pending' })
                .sort({ submittedAt: -1 })
                .toArray();

            return submissions as unknown as IIdPSubmission[];
        } catch (error) {
            logger.error('Failed to get pending IdPs', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get pending IdPs');
        }
    }

    /**
     * Get all IdP submissions
     */
    async getAllSubmissions(): Promise<IIdPSubmission[]> {
        try {
            const collection = this.getCollection();

            const submissions = await collection
                .find({})
                .sort({ submittedAt: -1 })
                .toArray();

            return submissions as unknown as IIdPSubmission[];
        } catch (error) {
            logger.error('Failed to get all submissions', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get submissions');
        }
    }

    /**
     * Get submission by alias (for retrieving Auth0 metadata)
     */
    async getSubmissionByAlias(alias: string): Promise<IIdPSubmission | null> {
        try {
            const collection = this.getCollection();

            const submission = await collection.findOne({ alias });

            if (!submission) {
                logger.debug('No submission found for alias', { alias });
                return null;
            }

            return submission as unknown as IIdPSubmission;
        } catch (error) {
            logger.error('Failed to get submission by alias', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    /**
     * Approve IdP (create in Keycloak and activate)
     */
    async approveIdP(alias: string, reviewedBy: string): Promise<IApprovalResponse> {
        try {
            const collection = this.getCollection();

            // Get submission
            const submission = await collection.findOne({ alias, status: 'pending' }) as any;

            if (!submission) {
                throw new Error(`No pending submission found for alias: ${alias}`);
            }

            // Create IdP in Keycloak based on protocol
            logger.info('Creating IdP in Keycloak from approved submission', {
                alias,
                protocol: submission.protocol
            });

            const createRequest: IIdPCreateRequest = {
                alias: submission.alias,
                displayName: submission.displayName,
                description: submission.description,
                protocol: submission.protocol,
                config: submission.config,
                attributeMappings: submission.attributeMappings,
                submittedBy: submission.submittedBy
            };

            let createdAlias: string;
            if (submission.protocol === 'oidc') {
                createdAlias = await keycloakAdminService.createOIDCIdentityProvider(createRequest);
            } else if (submission.protocol === 'saml') {
                createdAlias = await keycloakAdminService.createSAMLIdentityProvider(createRequest);
            } else {
                throw new Error(`Unsupported protocol: ${submission.protocol}`);
            }

            logger.info('IdP created in Keycloak', { alias: createdAlias });

            // Federation relationships are now managed by hub-spoke-registry.service.ts
            // Federation partners are registered via POST /api/federation/register
            // No need to update static registry - MongoDB is the SSOT
            logger.debug('Federation managed by hub-spoke-registry service', {
                alias,
                isFederationIdP: alias.includes('-federation') || alias.endsWith('-federation')
            });

            // Update submission status
            await collection.updateOne(
                { alias },
                {
                    $set: {
                        status: 'approved',
                        reviewedBy,
                        reviewedAt: new Date().toISOString()
                    }
                }
            );

            logger.info('IdP approved and activated', {
                alias,
                reviewedBy
            });

            return {
                success: true,
                alias,
                status: 'approved',
                message: 'Identity provider created in Keycloak and approved'
            };
        } catch (error) {
            logger.error('Failed to approve IdP', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Reject IdP
     */
    async rejectIdP(alias: string, reason: string, reviewedBy: string): Promise<IApprovalResponse> {
        try {
            const collection = this.getCollection();

            // Get submission
            const submission = await collection.findOne({ alias, status: 'pending' });

            if (!submission) {
                throw new Error(`No pending submission found for alias: ${alias}`);
            }

            // Update submission status
            await collection.updateOne(
                { alias },
                {
                    $set: {
                        status: 'rejected',
                        reviewedBy,
                        reviewedAt: new Date().toISOString(),
                        rejectionReason: reason
                    }
                }
            );

            // Delete IdP from Keycloak
            await keycloakAdminService.deleteIdentityProvider(alias);

            logger.info('IdP rejected and removed', {
                alias,
                reviewedBy,
                reason
            });

            return {
                success: true,
                alias,
                status: 'rejected',
                message: 'Identity provider rejected and removed'
            };
        } catch (error) {
            logger.error('Failed to reject IdP', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get approval history for an IdP
     */
    async getApprovalHistory(alias: string): Promise<IIdPSubmission[]> {
        try {
            const collection = this.getCollection();

            const history = await collection
                .find({ alias })
                .sort({ submittedAt: -1 })
                .toArray();

            return history as unknown as IIdPSubmission[];
        } catch (error) {
            logger.error('Failed to get approval history', {
                alias,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get approval history');
        }
    }

    /**
     * Process submission and determine approval decision
     * 
     * Phase 2: Auto-triage based on comprehensive risk score
     * 
     * @param submissionId - Submission ID to process
     * @returns Approval decision with action and SLA deadline
     */
    async processSubmission(submissionId: string): Promise<IApprovalDecision> {
        try {
            const collection = this.getCollection();

            // Get submission
            const submission = await collection.findOne({ submissionId }) as any;

            if (!submission) {
                throw new Error(`Submission not found: ${submissionId}`);
            }

            // Check if comprehensive risk score exists
            if (!submission.comprehensiveRiskScore) {
                throw new Error('Comprehensive risk score not calculated');
            }

            const riskScore = submission.comprehensiveRiskScore;
            const total = riskScore.total;

            let decision: IApprovalDecision;

            // Auto-approve minimal risk (Gold tier, 85+ points)
            if (total >= this.config.autoApproveThreshold) {
                const slaDeadline = new Date(); // Immediate
                decision = {
                    action: 'auto-approve',
                    reason: `Minimal risk score (${total}/100 points) - auto-approved per policy`,
                    requiresManualReview: false,
                    slaDeadline: slaDeadline.toISOString(),
                    nextSteps: [
                        'IdP will be created in Keycloak automatically',
                        'Admin notified of auto-approval',
                        'Partners can begin using this IdP immediately',
                    ],
                };

                logger.info('Auto-approval decision', {
                    submissionId,
                    alias: submission.alias,
                    score: total,
                    tier: riskScore.tier,
                });

                // Update submission with decision and auto-approve
                await collection.updateOne(
                    { submissionId },
                    {
                        $set: {
                            approvalDecision: decision,
                            slaDeadline: decision.slaDeadline,
                            slaStatus: 'within' as SLAStatus,
                            autoApproved: true,
                            fastTrack: false,
                        },
                    }
                );

                // Automatically approve the IdP
                await this.approveIdP(submission.alias, 'auto-approval-system');

                return decision;
            }

            // Fast-track low risk (Silver tier, 70-84 points)
            if (total >= this.config.fastTrackThreshold) {
                const slaDeadline = new Date(Date.now() + this.config.fastTrackSLAHours * 60 * 60 * 1000);
                decision = {
                    action: 'fast-track',
                    reason: `Low risk score (${total}/100 points) - fast-track review (${this.config.fastTrackSLAHours}hr SLA)`,
                    requiresManualReview: true,
                    slaDeadline: slaDeadline.toISOString(),
                    nextSteps: [
                        `Admin review required within ${this.config.fastTrackSLAHours} hours`,
                        'Low risk profile enables expedited approval',
                        'Address any warnings to improve score',
                    ],
                };

                logger.info('Fast-track decision', {
                    submissionId,
                    alias: submission.alias,
                    score: total,
                    tier: riskScore.tier,
                    slaHours: this.config.fastTrackSLAHours,
                });
            }
            // Standard review for medium risk (Bronze tier, 50-69 points)
            else if (total >= this.config.autoRejectThreshold) {
                const slaDeadline = new Date(Date.now() + this.config.standardReviewSLAHours * 60 * 60 * 1000);
                decision = {
                    action: 'standard-review',
                    reason: `Medium risk score (${total}/100 points) - standard review process (${this.config.standardReviewSLAHours}hr SLA)`,
                    requiresManualReview: true,
                    slaDeadline: slaDeadline.toISOString(),
                    nextSteps: [
                        `Admin review required within ${this.config.standardReviewSLAHours} hours`,
                        'Address identified concerns to improve risk score',
                        'Provide additional documentation if available',
                    ],
                };

                logger.info('Standard review decision', {
                    submissionId,
                    alias: submission.alias,
                    score: total,
                    tier: riskScore.tier,
                    slaHours: this.config.standardReviewSLAHours,
                });
            }
            // Auto-reject or detailed review for high risk (<50 points)
            else {
                const slaDeadline = new Date(Date.now() + this.config.detailedReviewSLAHours * 60 * 60 * 1000);

                // Collect critical issues
                const criticalIssues = riskScore.factors
                    .filter((f: { score: number; maxScore: number; factor: string; concerns: string[] }) => f.score === 0 && f.maxScore > 0)
                    .map((f: { score: number; maxScore: number; factor: string; concerns: string[] }) => `${f.factor}: ${f.concerns.join(', ')}`);

                decision = {
                    action: 'auto-reject',
                    reason: `High risk score (${total}/100 points) - critical security issues must be addressed`,
                    requiresManualReview: false,
                    slaDeadline: slaDeadline.toISOString(),
                    rejectionReasons: criticalIssues,
                    nextSteps: [
                        'Address all critical security issues',
                        'Upload required compliance documents',
                        'Resubmit after improvements',
                        'Contact DIVE V3 team for guidance if needed',
                    ],
                };

                logger.warn('Auto-rejection decision', {
                    submissionId,
                    alias: submission.alias,
                    score: total,
                    tier: riskScore.tier,
                    criticalIssuesCount: criticalIssues.length,
                });

                // Update submission with rejection decision
                await collection.updateOne(
                    { submissionId },
                    {
                        $set: {
                            approvalDecision: decision,
                            slaDeadline: decision.slaDeadline,
                            slaStatus: 'within' as SLAStatus,
                            autoApproved: false,
                            fastTrack: false,
                            status: 'rejected',
                            rejectionReason: decision.reason,
                        },
                    }
                );

                // Delete IdP from Keycloak
                try {
                    await keycloakAdminService.deleteIdentityProvider(submission.alias);
                } catch (error) {
                    logger.warn('Failed to delete rejected IdP from Keycloak', {
                        alias: submission.alias,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }

                return decision;
            }

            // Update submission with decision (for non-auto-reject cases)
            await collection.updateOne(
                { submissionId },
                {
                    $set: {
                        approvalDecision: decision,
                        slaDeadline: decision.slaDeadline,
                        slaStatus: 'within' as SLAStatus,
                        autoApproved: false,
                        fastTrack: decision.action === 'fast-track',
                    },
                }
            );

            return decision;
        } catch (error) {
            logger.error('Failed to process submission', {
                submissionId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Update SLA status for submissions
     * 
     * Called periodically to check if submissions are approaching or exceeding SLA.
     * 
     * @returns Number of submissions updated
     */
    async updateSLAStatus(): Promise<number> {
        try {
            const collection = this.getCollection();
            const now = new Date();

            // Get all pending submissions with SLA deadlines
            const submissions = await collection
                .find({
                    status: 'pending',
                    slaDeadline: { $exists: true },
                })
                .toArray();

            let updateCount = 0;

            for (const submission of submissions) {
                const slaDeadline = new Date(submission.slaDeadline);
                const timeRemainingMs = slaDeadline.getTime() - now.getTime();
                const timeRemainingHours = timeRemainingMs / (1000 * 60 * 60);

                let newStatus: SLAStatus;

                if (timeRemainingMs < 0) {
                    newStatus = 'exceeded';
                } else if (timeRemainingHours <= 1) {
                    // Approaching if less than 1 hour remaining
                    newStatus = 'approaching';
                } else {
                    newStatus = 'within';
                }

                // Update if status changed
                if (submission.slaStatus !== newStatus) {
                    await collection.updateOne(
                        { submissionId: submission.submissionId },
                        {
                            $set: {
                                slaStatus: newStatus,
                            },
                        }
                    );

                    updateCount++;

                    logger.info('SLA status updated', {
                        submissionId: submission.submissionId,
                        alias: submission.alias,
                        oldStatus: submission.slaStatus,
                        newStatus,
                        timeRemainingHours: Math.round(timeRemainingHours * 10) / 10,
                    });
                }
            }

            return updateCount;
        } catch (error) {
            logger.error('Failed to update SLA status', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return 0;
        }
    }

    /**
     * Get submissions by SLA status
     * 
     * @param slaStatus - SLA status to filter by
     * @returns Submissions with matching SLA status
     */
    async getSubmissionsBySLAStatus(slaStatus: SLAStatus): Promise<IIdPSubmission[]> {
        try {
            const collection = this.getCollection();

            const submissions = await collection
                .find({
                    status: 'pending',
                    slaStatus,
                })
                .sort({ slaDeadline: 1 }) // Earliest deadline first
                .toArray();

            return submissions as unknown as IIdPSubmission[];
        } catch (error) {
            logger.error('Failed to get submissions by SLA status', {
                slaStatus,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error('Failed to get submissions');
        }
    }

    /**
     * Get submissions by fast-track status
     * 
     * @returns Fast-track submissions
     */
    async getFastTrackSubmissions(): Promise<IIdPSubmission[]> {
        try {
            const collection = this.getCollection();

            const submissions = await collection
                .find({
                    status: 'pending',
                    fastTrack: true,
                })
                .sort({ slaDeadline: 1 })
                .toArray();

            return submissions as unknown as IIdPSubmission[];
        } catch (error) {
            logger.error('Failed to get fast-track submissions', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error('Failed to get fast-track submissions');
        }
    }

    /**
     * Close database connection
     * @deprecated MongoDB singleton handles connection lifecycle
     */
    async close(): Promise<void> {
        // No-op: MongoDB singleton manages connection lifecycle
    }
}

// Export singleton instance
export const idpApprovalService = new IdPApprovalService();
