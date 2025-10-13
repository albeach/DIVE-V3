/**
 * IdP Approval Service
 * 
 * Manages approval workflow for new Identity Providers
 * Stores submission state in MongoDB
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { keycloakAdminService } from './keycloak-admin.service';
import { IIdPSubmission, IApprovalResponse } from '../types/admin.types';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3';
const SUBMISSIONS_COLLECTION = 'idp_submissions';

class IdPApprovalService {
    private client: MongoClient | null = null;
    private db: Db | null = null;

    /**
     * Connect to MongoDB
     */
    private async connect(): Promise<void> {
        if (this.client && this.db) {
            return;
        }

        try {
            this.client = new MongoClient(MONGODB_URL);
            await this.client.connect();
            this.db = this.client.db(DB_NAME);

            logger.debug('Connected to MongoDB for IdP approvals');
        } catch (error) {
            logger.error('Failed to connect to MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Database connection failed');
        }
    }

    /**
     * Get submissions collection
     */
    private async getCollection(): Promise<Collection> {
        await this.connect();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db.collection(SUBMISSIONS_COLLECTION);
    }

    /**
     * Submit IdP for approval
     * Called after IdP created in Keycloak (in disabled state)
     */
    async submitIdPForApproval(submission: Omit<IIdPSubmission, 'submissionId' | 'submittedAt' | 'status'>): Promise<string> {
        try {
            const collection = await this.getCollection();

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
            const collection = await this.getCollection();

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
            const collection = await this.getCollection();

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
     * Approve IdP (activate in Keycloak)
     */
    async approveIdP(alias: string, reviewedBy: string): Promise<IApprovalResponse> {
        try {
            const collection = await this.getCollection();

            // Get submission
            const submission = await collection.findOne({ alias, status: 'pending' });

            if (!submission) {
                throw new Error(`No pending submission found for alias: ${alias}`);
            }

            // Enable IdP in Keycloak
            await keycloakAdminService.updateIdentityProvider(alias, {
                enabled: true
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
                message: 'Identity provider approved and activated'
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
            const collection = await this.getCollection();

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
            const collection = await this.getCollection();

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
     * Close database connection
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
        }
    }
}

// Export singleton instance
export const idpApprovalService = new IdPApprovalService();

