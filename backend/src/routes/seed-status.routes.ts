/**
 * Seed Status Routes
 * 
 * API endpoints to check the status of seeded resources
 * Used for validation and monitoring of the seeding process.
 * 
 * Endpoints:
 *   GET /api/resources/seed-status       - Overall seed status
 *   GET /api/resources/distribution      - Classification/COI/KAS breakdown
 *   GET /api/resources/seed-manifests    - List all seed manifests
 *
 * Date: November 29, 2025
 */

import { Router, Request, Response } from 'express';
import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';

const router = Router();

// MongoDB connection
const MONGODB_URL =
  process.env.MONGODB_URL ||
  process.env.MONGODB_URI ||
  (process.env.MONGO_PASSWORD
    ? `mongodb://admin:${process.env.MONGO_PASSWORD}@localhost:27017?authSource=admin`
    : '');
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'dive-v3';

let dbClient: MongoClient | null = null;
let db: Db | null = null;

async function getDb(): Promise<Db> {
    if (!db) {
        dbClient = new MongoClient(MONGODB_URL, {
            authSource: 'admin',
            connectTimeoutMS: 10000
        });
        await dbClient.connect();
        db = dbClient.db(MONGODB_DATABASE);
    }
    return db;
}

// Expected distribution targets
const EXPECTED_DISTRIBUTIONS = {
    classification: {
        UNCLASSIFIED: 0.20,
        RESTRICTED: 0.15,
        CONFIDENTIAL: 0.25,
        SECRET: 0.25,
        TOP_SECRET: 0.15
    },
    kasCount: {
        '1': 0.50,
        '2': 0.30,
        '3': 0.20
    },
    industryAccess: {
        true: 0.65,
        false: 0.35
    }
};

/**
 * GET /api/resources/seed-status
 * Returns overall seed status including expected vs actual counts
 */
router.get('/seed-status', async (_req: Request, res: Response) => {
    try {
        const database = await getDb();
        const collection = database.collection('resources');
        
        // Get total count
        const totalCount = await collection.countDocuments({});
        const seededCount = await collection.countDocuments({
            $or: [
                { seedBatchId: { $exists: true } },
                { resourceId: { $regex: /^doc-/ } }
            ]
        });
        
        // Get most recent seed batch
        const latestSeed = await collection.findOne(
            { seedBatchId: { $exists: true } },
            { sort: { createdAt: -1 }, projection: { seedBatchId: 1, instanceCode: 1, createdAt: 1 } }
        );
        
        // Get unique seed batches
        const seedBatches = await collection.aggregate([
            { $match: { seedBatchId: { $exists: true } } },
            { $group: {
                _id: '$seedBatchId',
                count: { $sum: 1 },
                instanceCode: { $first: '$instanceCode' },
                timestamp: { $max: '$createdAt' }
            }},
            { $sort: { timestamp: -1 } },
            { $limit: 10 }
        ]).toArray();
        
        // Get instance distribution
        const instanceDistribution = await collection.aggregate([
            { $match: { instanceCode: { $exists: true } } },
            { $group: { _id: '$instanceCode', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).toArray();
        
        const status = {
            database: MONGODB_DATABASE,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            counts: {
                total: totalCount,
                seeded: seededCount,
                manual: totalCount - seededCount
            },
            latestSeed: latestSeed ? {
                batchId: latestSeed.seedBatchId,
                instanceCode: latestSeed.instanceCode,
                timestamp: latestSeed.createdAt
            } : null,
            seedBatches: seedBatches.map(b => ({
                batchId: b._id,
                instanceCode: b.instanceCode,
                count: b.count,
                timestamp: b.timestamp
            })),
            byInstance: instanceDistribution.reduce((acc: Record<string, number>, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {})
        };
        
        logger.info('Seed status requested', { totalCount: status.counts.total });
        res.json(status);
        
    } catch (error) {
        logger.error('Failed to get seed status', { error });
        res.status(500).json({
            error: 'Failed to get seed status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/resources/distribution
 * Returns detailed distribution breakdown by classification, COI, KAS count
 */
router.get('/distribution', async (_req: Request, res: Response) => {
    try {
        const database = await getDb();
        const collection = database.collection('resources');
        
        const totalCount = await collection.countDocuments({});
        
        // Classification distribution
        const classificationDist = await collection.aggregate([
            { $group: {
                _id: '$ztdf.policy.securityLabel.classification',
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]).toArray();
        
        // COI distribution (top 15)
        const coiDist = await collection.aggregate([
            { $unwind: { path: '$ztdf.policy.securityLabel.COI', preserveNullAndEmptyArrays: true } },
            { $group: {
                _id: { $ifNull: ['$ztdf.policy.securityLabel.COI', 'NO_COI'] },
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 15 }
        ]).toArray();
        
        // KAS count distribution
        const kasDist = await collection.aggregate([
            { $project: {
                kaoCount: { $size: { $ifNull: ['$ztdf.payload.keyAccessObjects', []] } }
            }},
            { $group: {
                _id: '$kaoCount',
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]).toArray();
        
        // Industry access distribution
        const industryDist = await collection.aggregate([
            { $group: {
                _id: { $ifNull: ['$ztdf.policy.securityLabel.releasableToIndustry', false] },
                count: { $sum: 1 }
            }}
        ]).toArray();
        
        // Releasability distribution (top 10 patterns)
        const releasabilityDist = await collection.aggregate([
            { $group: {
                _id: '$ztdf.policy.securityLabel.releasabilityTo',
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]).toArray();
        
        // Calculate variance from expected
        const classificationVariance: Record<string, { actual: number; expected: number; variance: number }> = {};
        for (const item of classificationDist) {
            const actual = item.count / totalCount;
            const expected = EXPECTED_DISTRIBUTIONS.classification[item._id as keyof typeof EXPECTED_DISTRIBUTIONS.classification] || 0;
            classificationVariance[item._id] = {
                actual: parseFloat((actual * 100).toFixed(2)),
                expected: parseFloat((expected * 100).toFixed(2)),
                variance: parseFloat(((actual - expected) * 100).toFixed(2))
            };
        }
        
        const distribution = {
            timestamp: new Date().toISOString(),
            totalCount,
            byClassification: {
                counts: classificationDist.reduce((acc: Record<string, number>, curr: any) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                percentages: classificationDist.reduce((acc: Record<string, string>, curr: any) => {
                    acc[curr._id] = ((curr.count / totalCount) * 100).toFixed(2) + '%';
                    return acc;
                }, {}),
                variance: classificationVariance
            },
            byCOI: {
                counts: coiDist.reduce((acc: Record<string, number>, curr: any) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                percentages: coiDist.reduce((acc: Record<string, string>, curr: any) => {
                    acc[curr._id] = ((curr.count / totalCount) * 100).toFixed(2) + '%';
                    return acc;
                }, {})
            },
            byKASCount: {
                counts: kasDist.reduce((acc: Record<string, number>, curr: any) => {
                    const label = curr._id === 1 ? 'Single KAS' : `${curr._id} KAS (Multi)`;
                    acc[label] = curr.count;
                    return acc;
                }, {}),
                percentages: kasDist.reduce((acc: Record<string, string>, curr: any) => {
                    const label = curr._id === 1 ? 'Single KAS' : `${curr._id} KAS (Multi)`;
                    acc[label] = ((curr.count / totalCount) * 100).toFixed(2) + '%';
                    return acc;
                }, {})
            },
            byIndustryAccess: {
                counts: industryDist.reduce((acc: Record<string, number>, curr: any) => {
                    acc[curr._id ? 'Allowed' : 'Gov-Only'] = curr.count;
                    return acc;
                }, {}),
                percentages: industryDist.reduce((acc: Record<string, string>, curr: any) => {
                    acc[curr._id ? 'Allowed' : 'Gov-Only'] = ((curr.count / totalCount) * 100).toFixed(2) + '%';
                    return acc;
                }, {})
            },
            topReleasabilityPatterns: releasabilityDist.map((item: any) => ({
                countries: item._id?.join(', ') || 'None',
                count: item.count,
                percentage: ((item.count / totalCount) * 100).toFixed(2) + '%'
            }))
        };
        
        logger.info('Distribution requested', { totalCount });
        res.json(distribution);
        
    } catch (error) {
        logger.error('Failed to get distribution', { error });
        res.status(500).json({
            error: 'Failed to get distribution',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/resources/seed-manifests
 * Returns list of all seed manifests with their statistics
 */
router.get('/seed-manifests', async (_req: Request, res: Response) => {
    try {
        const database = await getDb();
        const collection = database.collection('resources');
        
        // Get all unique seed batches with statistics
        const manifests = await collection.aggregate([
            { $match: { seedBatchId: { $exists: true, $ne: null } } },
            { $group: {
                _id: '$seedBatchId',
                instanceCode: { $first: '$instanceCode' },
                count: { $sum: 1 },
                firstCreated: { $min: '$createdAt' },
                lastCreated: { $max: '$createdAt' },
                classifications: { $addToSet: '$ztdf.policy.securityLabel.classification' }
            }},
            { $sort: { lastCreated: -1 } },
            { $limit: 50 }
        ]).toArray();
        
        const result = {
            timestamp: new Date().toISOString(),
            count: manifests.length,
            manifests: manifests.map((m: any) => ({
                batchId: m._id,
                instanceCode: m.instanceCode,
                documentCount: m.count,
                classifications: m.classifications,
                firstCreated: m.firstCreated,
                lastCreated: m.lastCreated
            }))
        };
        
        logger.info('Seed manifests requested', { count: result.count });
        res.json(result);
        
    } catch (error) {
        logger.error('Failed to get seed manifests', { error });
        res.status(500).json({
            error: 'Failed to get seed manifests',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
