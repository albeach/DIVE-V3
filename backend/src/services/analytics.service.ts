import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';

// ============================================
// Analytics Service (Phase 3)
// ============================================
// Purpose: Aggregate and analyze system metrics for dashboards and reporting
// Endpoints:
// - Risk distribution by tier
// - Compliance trends over time
// - SLA performance metrics
// - Authorization decision metrics
// - Security posture overview

// MongoDB configuration
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || (process.env.NODE_ENV === 'test' ? 'dive-v3-test' : 'dive-v3');

/**
 * Cache for analytics data (5-minute TTL)
 */
const analyticsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Risk distribution by tier
 */
export interface IRiskDistribution {
    gold: number;    // Auto-approved (85-100 points)
    silver: number;  // Fast-track (70-84 points)
    bronze: number;  // Standard review (50-69 points)
    fail: number;    // Rejected (<50 points)
}

/**
 * Compliance trends over time
 */
export interface IComplianceTrends {
    dates: string[];
    acp240: number[];
    stanag4774: number[];
    nist80063: number[];
}

/**
 * SLA performance metrics
 */
export interface ISLAMetrics {
    fastTrackCompliance: number;  // % within 2hr SLA
    standardCompliance: number;   // % within 24hr SLA
    averageReviewTime: number;    // hours
    exceededCount: number;         // Count of SLA violations
}

/**
 * Authorization decision metrics
 */
export interface IAuthzMetrics {
    totalDecisions: number;
    allowRate: number;      // %
    denyRate: number;       // %
    averageLatency: number; // ms
    cacheHitRate: number;   // %
}

/**
 * Security posture overview
 */
export interface ISecurityPosture {
    averageRiskScore: number;
    complianceRate: number;    // % of IdPs compliant
    mfaAdoptionRate: number;   // % of IdPs with MFA
    tls13AdoptionRate: number; // % of IdPs with TLS 1.3
}

/**
 * Date range filter
 */
export interface IDateRange {
    startDate?: Date;
    endDate?: Date;
}

/**
 * Analytics Service Class
 */
class AnalyticsService {
    private mongoClient: MongoClient | null = null;
    private db: Db | null = null;

    constructor() {
        logger.info('Analytics service initialized');
    }

    /**
     * Connect to MongoDB
     */
    private async connect(): Promise<void> {
        if (this.mongoClient && this.db) {
            // Try to ping to check if still connected
            try {
                await this.mongoClient.db().admin().ping();
                return;
            } catch {
                // Connection lost, will reconnect below
                this.mongoClient = null;
                this.db = null;
            }
        }

        try {
            this.mongoClient = new MongoClient(MONGODB_URL);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(DB_NAME);

            logger.debug('Analytics service connected to MongoDB');
        } catch (error) {
            logger.error('Analytics service failed to connect to MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Database connection failed');
        }
    }

    /**
     * Set MongoDB client (for testing)
     */
    setMongoClient(client: MongoClient): void {
        this.mongoClient = client;
        this.db = client.db();
    }

    /**
     * Get MongoDB database instance
     */
    private async getDb(): Promise<Db> {
        await this.connect();
        if (!this.db) {
            throw new Error('MongoDB client not initialized');
        }
        return this.db;
    }

    /**
     * Get risk distribution
     * Shows how IdP submissions are distributed across risk tiers
     */
    async getRiskDistribution(): Promise<IRiskDistribution> {
        const cacheKey = 'risk-distribution';
        const cached = analyticsCache.get<IRiskDistribution>(cacheKey);
        
        if (cached) {
            logger.debug('Returning cached risk distribution');
            return cached;
        }

        try {
            const db = await this.getDb();
            const collection = db.collection('idp_submissions');

            // Count submissions by tier
            const [gold, silver, bronze, fail] = await Promise.all([
                collection.countDocuments({ 'comprehensiveRiskScore.tier': 'gold' }),
                collection.countDocuments({ 'comprehensiveRiskScore.tier': 'silver' }),
                collection.countDocuments({ 'comprehensiveRiskScore.tier': 'bronze' }),
                collection.countDocuments({ 'comprehensiveRiskScore.tier': 'fail' }),
            ]);

            const distribution: IRiskDistribution = {
                gold,
                silver,
                bronze,
                fail,
            };

            analyticsCache.set(cacheKey, distribution);

            logger.info('Risk distribution calculated', distribution);
            return distribution;
        } catch (error) {
            logger.error('Error calculating risk distribution', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Get compliance trends over time
     * Shows compliance scores trending over the past 30 days
     */
    async getComplianceTrends(dateRange?: IDateRange): Promise<IComplianceTrends> {
        const cacheKey = `compliance-trends-${dateRange?.startDate || 'default'}-${dateRange?.endDate || 'default'}`;
        const cached = analyticsCache.get<IComplianceTrends>(cacheKey);
        
        if (cached) {
            logger.debug('Returning cached compliance trends');
            return cached;
        }

        try {
            const db = await this.getDb();
            const collection = db.collection('idp_submissions');

            // Default to last 30 days
            const endDate = dateRange?.endDate || new Date();
            const startDate = dateRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // Aggregate compliance scores by date
            const submissions = await collection
                .find({
                    submittedAt: { $gte: startDate, $lte: endDate },
                    'complianceValidation': { $exists: true },
                })
                .sort({ submittedAt: 1 })
                .toArray();

            // Group by date and calculate averages
            const dateMap = new Map<string, {
                acp240: number[];
                stanag4774: number[];
                nist80063: number[];
            }>();

            for (const submission of submissions) {
                const date = new Date(submission.submittedAt).toISOString().split('T')[0];
                
                if (!dateMap.has(date)) {
                    dateMap.set(date, {
                        acp240: [],
                        stanag4774: [],
                        nist80063: [],
                    });
                }

                const scores = dateMap.get(date)!;
                
                if (submission.complianceValidation?.acp240?.score !== undefined) {
                    scores.acp240.push(submission.complianceValidation.acp240.score);
                }
                if (submission.complianceValidation?.stanag4774?.score !== undefined) {
                    scores.stanag4774.push(submission.complianceValidation.stanag4774.score);
                }
                if (submission.complianceValidation?.nist80063?.score !== undefined) {
                    scores.nist80063.push(submission.complianceValidation.nist80063.score);
                }
            }

            // Calculate averages
            const dates: string[] = [];
            const acp240: number[] = [];
            const stanag4774: number[] = [];
            const nist80063: number[] = [];

            for (const [date, scores] of Array.from(dateMap.entries()).sort()) {
                dates.push(date);
                acp240.push(scores.acp240.length > 0 ? Math.round(scores.acp240.reduce((a, b) => a + b, 0) / scores.acp240.length) : 0);
                stanag4774.push(scores.stanag4774.length > 0 ? Math.round(scores.stanag4774.reduce((a, b) => a + b, 0) / scores.stanag4774.length) : 0);
                nist80063.push(scores.nist80063.length > 0 ? Math.round(scores.nist80063.reduce((a, b) => a + b, 0) / scores.nist80063.length) : 0);
            }

            const trends: IComplianceTrends = {
                dates,
                acp240,
                stanag4774,
                nist80063,
            };

            analyticsCache.set(cacheKey, trends);

            logger.info('Compliance trends calculated', { dateCount: dates.length });
            return trends;
        } catch (error) {
            logger.error('Error calculating compliance trends', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Get SLA performance metrics
     * Shows how well the system is meeting SLA targets
     */
    async getSLAMetrics(): Promise<ISLAMetrics> {
        const cacheKey = 'sla-metrics';
        const cached = analyticsCache.get<ISLAMetrics>(cacheKey);
        
        if (cached) {
            logger.debug('Returning cached SLA metrics');
            return cached;
        }

        try {
            const db = await this.getDb();
            const collection = db.collection('idp_submissions');

            // Get completed submissions (approved or rejected)
            const submissions = await collection
                .find({
                    status: { $in: ['approved', 'rejected'] },
                    slaDeadline: { $exists: true },
                    'approvalDecision.decidedAt': { $exists: true },
                })
                .toArray();

            let fastTrackTotal = 0;
            let fastTrackOnTime = 0;
            let standardTotal = 0;
            let standardOnTime = 0;
            let totalReviewTime = 0;
            let exceededCount = 0;

            for (const submission of submissions) {
                const submittedAt = new Date(submission.submittedAt);
                const decidedAt = new Date(submission.approvalDecision.decidedAt);
                const reviewTime = (decidedAt.getTime() - submittedAt.getTime()) / (1000 * 60 * 60); // hours
                
                totalReviewTime += reviewTime;

                const slaDeadline = new Date(submission.slaDeadline);
                const onTime = decidedAt <= slaDeadline;

                if (!onTime) {
                    exceededCount++;
                }

                if (submission.fastTrack) {
                    fastTrackTotal++;
                    if (onTime) fastTrackOnTime++;
                } else {
                    standardTotal++;
                    if (onTime) standardOnTime++;
                }
            }

            const fastTrackCompliance = fastTrackTotal > 0 
                ? parseFloat(((fastTrackOnTime / fastTrackTotal) * 100).toFixed(2))
                : 0;

            const standardCompliance = standardTotal > 0
                ? parseFloat(((standardOnTime / standardTotal) * 100).toFixed(2))
                : 0;

            const averageReviewTime = submissions.length > 0
                ? parseFloat((totalReviewTime / submissions.length).toFixed(2))
                : 0;

            const metrics: ISLAMetrics = {
                fastTrackCompliance,
                standardCompliance,
                averageReviewTime,
                exceededCount,
            };

            analyticsCache.set(cacheKey, metrics);

            logger.info('SLA metrics calculated', metrics);
            return metrics;
        } catch (error) {
            logger.error('Error calculating SLA metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Get authorization decision metrics
     * Shows authorization performance and decision patterns
     */
    async getAuthzMetrics(dateRange?: IDateRange): Promise<IAuthzMetrics> {
        const cacheKey = `authz-metrics-${dateRange?.startDate || 'default'}-${dateRange?.endDate || 'default'}`;
        const cached = analyticsCache.get<IAuthzMetrics>(cacheKey);
        
        if (cached) {
            logger.debug('Returning cached authz metrics');
            return cached;
        }

        try {
            const db = await this.getDb();
            const collection = db.collection('audit_logs');

            // Default to last 7 days
            const endDate = dateRange?.endDate || new Date();
            const startDate = dateRange?.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get authorization decisions
            const decisions = await collection
                .find({
                    timestamp: { $gte: startDate, $lte: endDate },
                    acp240EventType: 'ACCESS_DECISION',
                })
                .toArray();

            const totalDecisions = decisions.length;
            const allowCount = decisions.filter(d => d.outcome === 'success').length;
            const denyCount = decisions.filter(d => d.outcome === 'failure').length;

            const allowRate = totalDecisions > 0
                ? parseFloat(((allowCount / totalDecisions) * 100).toFixed(2))
                : 0;

            const denyRate = totalDecisions > 0
                ? parseFloat(((denyCount / totalDecisions) * 100).toFixed(2))
                : 0;

            // Calculate average latency
            const latencies = decisions
                .filter(d => d.latencyMs !== undefined)
                .map(d => d.latencyMs);

            const averageLatency = latencies.length > 0
                ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
                : 0;

            // Get cache hit rate from authz cache service
            const { authzCacheService } = await import('./authz-cache.service');
            const cacheStats = authzCacheService.getStats();
            const cacheHitRate = cacheStats.hitRate;

            const metrics: IAuthzMetrics = {
                totalDecisions,
                allowRate,
                denyRate,
                averageLatency,
                cacheHitRate,
            };

            analyticsCache.set(cacheKey, metrics);

            logger.info('Authz metrics calculated', metrics);
            return metrics;
        } catch (error) {
            logger.error('Error calculating authz metrics', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Get security posture overview
     * Shows overall system security health
     */
    async getSecurityPosture(): Promise<ISecurityPosture> {
        const cacheKey = 'security-posture';
        const cached = analyticsCache.get<ISecurityPosture>(cacheKey);
        
        if (cached) {
            logger.debug('Returning cached security posture');
            return cached;
        }

        try {
            const db = await this.getDb();
            const collection = db.collection('idp_submissions');

            // Get approved submissions
            const submissions = await collection
                .find({
                    status: 'approved',
                    'comprehensiveRiskScore': { $exists: true },
                })
                .toArray();

            // Calculate average risk score
            const riskScores = submissions
                .map(s => s.comprehensiveRiskScore?.total || 0)
                .filter(s => s > 0);

            const averageRiskScore = riskScores.length > 0
                ? parseFloat((riskScores.reduce((a, b) => a + b, 0) / riskScores.length).toFixed(2))
                : 0;

            // Calculate compliance rate (submissions with score >= 70)
            const compliantCount = submissions.filter(s => 
                s.comprehensiveRiskScore?.total >= 70
            ).length;

            const complianceRate = submissions.length > 0
                ? parseFloat(((compliantCount / submissions.length) * 100).toFixed(2))
                : 0;

            // Calculate MFA adoption rate
            const mfaCount = submissions.filter(s => 
                s.validationResults?.mfaCheck?.pass === true ||
                s.validationResults?.mfaCheck?.score > 0
            ).length;

            const mfaAdoptionRate = submissions.length > 0
                ? parseFloat(((mfaCount / submissions.length) * 100).toFixed(2))
                : 0;

            // Calculate TLS 1.3 adoption rate
            const tls13Count = submissions.filter(s => 
                s.validationResults?.tlsCheck?.details?.minVersion === 'TLS1.3'
            ).length;

            const tls13AdoptionRate = submissions.length > 0
                ? parseFloat(((tls13Count / submissions.length) * 100).toFixed(2))
                : 0;

            const posture: ISecurityPosture = {
                averageRiskScore,
                complianceRate,
                mfaAdoptionRate,
                tls13AdoptionRate,
            };

            analyticsCache.set(cacheKey, posture);

            logger.info('Security posture calculated', posture);
            return posture;
        } catch (error) {
            logger.error('Error calculating security posture', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /**
     * Clear analytics cache
     * Useful after bulk operations or data updates
     */
    clearCache(): void {
        analyticsCache.flushAll();
        logger.info('Analytics cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        keys: number;
        hits: number;
        misses: number;
    } {
        return {
            keys: analyticsCache.keys().length,
            hits: analyticsCache.getStats().hits,
            misses: analyticsCache.getStats().misses,
        };
    }
}

// Export class for testing
export { AnalyticsService };

// Export singleton instance
export const analyticsService = new AnalyticsService();

