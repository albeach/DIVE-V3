/**
 * Paginated Search Controller
 *
 * Phase 1: Performance Foundation
 * Server-side cursor-based pagination for 28K+ documents
 *
 * Features:
 * - Cursor-based pagination (more efficient than offset for large datasets)
 * - Facet aggregation for filter counts
 * - Sort options
 * - Federation support
 */

import { Request, Response, NextFunction } from 'express';
import { ObjectId, Document, WithId, MongoClient } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';

// ============================================
// MongoDB Connection Cache
// ============================================

let cachedClient: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    try {
      await cachedClient.db().admin().ping();
      return cachedClient;
    } catch {
      cachedClient = null;
    }
  }

  const MONGODB_URL = getMongoDBUrl();
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  cachedClient = client;
  return client;
}

// ============================================
// Types
// ============================================

interface IPaginatedSearchRequest {
  query?: string;
  filters?: {
    classifications?: string[];
    countries?: string[];
    cois?: string[];
    instances?: string[];
    encrypted?: boolean;
    dateRange?: { start: string; end: string };
  };
  sort?: {
    field: 'title' | 'classification' | 'creationDate' | 'resourceId' | 'relevance';
    order: 'asc' | 'desc';
  };
  pagination: {
    cursor?: string;
    limit: number;
  };
  includeFacets?: boolean;
  /** Phase 2: Use MongoDB $text search instead of regex */
  useTextSearch?: boolean;
  /** Phase 2: Parsed advanced query filters */
  advancedFilters?: {
    phrases?: string[];
    negatedTerms?: string[];
    fieldFilters?: Array<{
      field: string;
      operator: string;
      value: string;
    }>;
  };
}

interface IFacetItem {
  value: string;
  count: number;
}

interface IPaginatedSearchResponse {
  results: any[];
  facets?: {
    classifications: IFacetItem[];
    countries: IFacetItem[];
    cois: IFacetItem[];
    instances: IFacetItem[];
    encryptionStatus: IFacetItem[];
  };
  pagination: {
    nextCursor: string | null;
    prevCursor: string | null;
    totalCount: number;
    hasMore: boolean;
    pageSize: number;
  };
  timing: {
    searchMs: number;
    facetMs: number;
    totalMs: number;
  };
}

// ============================================
// Constants
// ============================================

const COLLECTION_NAME = 'resources';
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const CLEARANCE_ORDER: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'RESTRICTED': 1,
  'CONFIDENTIAL': 2,
  'SECRET': 3,
  'TOP_SECRET': 4,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Encode cursor from document ID and sort values
 */
function encodeCursor(doc: any, sortField: string): string {
  const cursorData = {
    id: doc._id.toString(),
    sortValue: doc[sortField] || doc.resourceId,
  };
  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
}

/**
 * Decode cursor to get document ID and sort values
 */
function decodeCursor(cursor: string): { id: string; sortValue: any } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get classification from resource (handles both ZTDF and legacy formats)
 */
function getClassification(resource: any): string {
  return resource.ztdf?.policy?.securityLabel?.classification ||
         resource.classification ||
         'UNCLASSIFIED';
}

/**
 * Get releasability from resource
 */
function getReleasability(resource: any): string[] {
  return resource.ztdf?.policy?.securityLabel?.releasabilityTo ||
         resource.releasabilityTo ||
         [];
}

/**
 * Get COI from resource
 */
function getCOI(resource: any): string[] {
  return resource.ztdf?.policy?.securityLabel?.COI ||
         resource.COI ||
         [];
}

// ============================================
// Controller Handler
// ============================================

/**
 * POST /api/resources/search
 * Server-side paginated search with facets
 */
export const paginatedSearchHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();

  try {
    const body: IPaginatedSearchRequest = req.body;
    const {
      query,
      filters = {},
      sort = { field: 'title', order: 'asc' },
      pagination,
      includeFacets = true,
      useTextSearch = false,
      advancedFilters,
    } = body;

    // Validate and constrain page size
    const limit = Math.min(pagination?.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = pagination?.cursor;

    // Get user attributes from JWT
    const token = (req as any).user;
    const userClearance = token?.clearance || 'UNCLASSIFIED';
    const userClearanceLevel = CLEARANCE_ORDER[userClearance] ?? 0;
    const userCountry = token?.countryOfAffiliation || '';

    logger.info('Paginated search request', {
      requestId,
      query,
      filters,
      sort,
      limit,
      hasCursor: !!cursor,
      userClearance,
      userCountry,
    });

    // Get MongoDB connection
    const client = await getMongoClient();
    const DB_NAME = getMongoDBName();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ========================================
    // Build Query Filter with ABAC
    // ========================================
    const mongoFilter: any = {};
    let useTextScore = false;

    // ========================================
    // ABAC Filter 1: Clearance Level
    // Only fetch documents user has clearance to access
    // ========================================
    const allowedClassifications = Object.entries(CLEARANCE_ORDER)
      .filter(([_, level]) => level <= userClearanceLevel)
      .map(([name]) => name);

    // Classification can be in top-level field OR nested in ztdf.policy.securityLabel
    mongoFilter.$and = mongoFilter.$and || [];
    mongoFilter.$and.push({
      $or: [
        { classification: { $in: allowedClassifications } },
        { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } },
        // Also allow null/missing classification (treat as UNCLASSIFIED)
        {
          $and: [
            { classification: { $exists: false } },
            { 'ztdf.policy.securityLabel.classification': { $exists: false } }
          ]
        }
      ]
    });

    // ========================================
    // ABAC Filter 2: Releasability
    // Only fetch documents releasable to user's country
    // ========================================
    if (userCountry) {
      // Document is releasable if user's country is in releasabilityTo array
      // OR if NATO/FVEY is in releasabilityTo (broad release markings)
      mongoFilter.$and.push({
        $or: [
          { releasabilityTo: userCountry },
          { releasabilityTo: 'NATO' },
          { releasabilityTo: 'FVEY' },
          { 'ztdf.policy.securityLabel.releasabilityTo': userCountry },
          { 'ztdf.policy.securityLabel.releasabilityTo': 'NATO' },
          { 'ztdf.policy.securityLabel.releasabilityTo': 'FVEY' },
        ]
      });
    }

    logger.debug('ABAC filters applied', {
      requestId,
      allowedClassifications,
      userCountry,
      filterCount: mongoFilter.$and?.length || 0,
    });

    // Text search (title or resourceId)
    if (query && query.trim()) {
      if (useTextSearch) {
        // Phase 2: Use MongoDB $text search for better relevance
        mongoFilter.$text = { $search: query.trim() };
        useTextScore = true;
        logger.debug('Using text index search', { requestId, query: query.trim() });
      } else {
        // Fallback to regex search
        const searchRegex = { $regex: query.trim(), $options: 'i' };
        mongoFilter.$or = [
          { title: searchRegex },
          { resourceId: searchRegex },
        ];
      }
    }

    // Phase 2: Advanced filters (phrases, negated terms, field filters)
    if (advancedFilters) {
      // Exact phrase matches
      if (advancedFilters.phrases && advancedFilters.phrases.length > 0) {
        mongoFilter.$and = mongoFilter.$and || [];
        advancedFilters.phrases.forEach(phrase => {
          mongoFilter.$and.push({
            $or: [
              { title: { $regex: phrase, $options: 'i' } },
              { resourceId: { $regex: phrase, $options: 'i' } },
            ],
          });
        });
      }

      // Negated terms (NOT)
      if (advancedFilters.negatedTerms && advancedFilters.negatedTerms.length > 0) {
        mongoFilter.$and = mongoFilter.$and || [];
        advancedFilters.negatedTerms.forEach(term => {
          const cleanTerm = term.replace(/^"|"$/g, '');
          mongoFilter.$and.push({
            title: { $not: { $regex: cleanTerm, $options: 'i' } },
          });
        });
      }

      // Field-specific filters
      if (advancedFilters.fieldFilters && advancedFilters.fieldFilters.length > 0) {
        mongoFilter.$and = mongoFilter.$and || [];
        advancedFilters.fieldFilters.forEach(filter => {
          const condition: any = {};

          switch (filter.operator) {
            case '=':
              // Handle array fields
              if (filter.field === 'releasabilityTo' || filter.field === 'COI') {
                condition[filter.field] = { $in: [filter.value] };
              } else if (filter.field === 'encrypted') {
                condition[filter.field] = filter.value === 'true';
              } else {
                condition[filter.field] = filter.value;
              }
              break;
            case '!=':
              if (filter.field === 'releasabilityTo' || filter.field === 'COI') {
                condition[filter.field] = { $nin: [filter.value] };
              } else {
                condition[filter.field] = { $ne: filter.value };
              }
              break;
            case '>':
              condition[filter.field] = { $gt: filter.value };
              break;
            case '<':
              condition[filter.field] = { $lt: filter.value };
              break;
            case '>=':
              condition[filter.field] = { $gte: filter.value };
              break;
            case '<=':
              condition[filter.field] = { $lte: filter.value };
              break;
            case 'contains':
              condition[filter.field] = { $regex: filter.value, $options: 'i' };
              break;
            default:
              condition[filter.field] = filter.value;
          }

          mongoFilter.$and.push(condition);
        });
      }
    }

    // Classification filter
    if (filters.classifications && filters.classifications.length > 0) {
      mongoFilter.$or = mongoFilter.$or || [];
      mongoFilter.$and = mongoFilter.$and || [];
      mongoFilter.$and.push({
        $or: [
          { 'ztdf.policy.securityLabel.classification': { $in: filters.classifications } },
          { classification: { $in: filters.classifications } },
        ]
      });
    }

    // Country/Releasability filter
    if (filters.countries && filters.countries.length > 0) {
      mongoFilter.$and = mongoFilter.$and || [];
      mongoFilter.$and.push({
        $or: [
          { 'ztdf.policy.securityLabel.releasabilityTo': { $in: filters.countries } },
          { releasabilityTo: { $in: filters.countries } },
        ]
      });
    }

    // COI filter
    if (filters.cois && filters.cois.length > 0) {
      mongoFilter.$and = mongoFilter.$and || [];
      mongoFilter.$and.push({
        $or: [
          { 'ztdf.policy.securityLabel.COI': { $in: filters.cois } },
          { COI: { $in: filters.cois } },
        ]
      });
    }

    // Instance/Origin filter
    // Check multiple possible fields: originRealm, instanceCode, or instance
    if (filters.instances && filters.instances.length > 0) {
      mongoFilter.$and = mongoFilter.$and || [];
      mongoFilter.$and.push({
        $or: [
          { originRealm: { $in: filters.instances } },
          { instanceCode: { $in: filters.instances } },
          { instance: { $in: filters.instances } }
        ]
      });
    }

    // Encryption filter
    if (filters.encrypted !== undefined) {
      mongoFilter.encrypted = filters.encrypted;
    }

    // Date range filter
    if (filters.dateRange?.start || filters.dateRange?.end) {
      mongoFilter.creationDate = {};
      if (filters.dateRange.start) {
        mongoFilter.creationDate.$gte = new Date(filters.dateRange.start);
      }
      if (filters.dateRange.end) {
        mongoFilter.creationDate.$lte = new Date(filters.dateRange.end);
      }
    }

    // ========================================
    // Build Sort Criteria
    // ========================================
    // Define sortField and sortOrder outside conditionals for use in cursor pagination
    const sortField = sort.field === 'creationDate' ? 'creationDate' :
                      sort.field === 'classification' ? 'classification' :
                      sort.field === 'resourceId' ? 'resourceId' :
                      sort.field === 'relevance' ? 'title' : 'title';
    const sortOrder = sort.order === 'desc' ? -1 : 1;

    let sortCriteria: any;

    if (useTextScore && sort.field === 'relevance') {
      // Sort by text search relevance score
      sortCriteria = { score: { $meta: 'textScore' }, _id: -1 };
    } else if (useTextScore && !sort.field) {
      // Default to relevance when using text search
      sortCriteria = { score: { $meta: 'textScore' }, _id: -1 };
    } else {
      sortCriteria = { [sortField]: sortOrder, _id: sortOrder };
    }

    // ========================================
    // Handle Cursor Pagination
    // ========================================
    if (cursor) {
      const cursorData = decodeCursor(cursor);
      if (cursorData) {
        const cursorCondition = sortOrder === 1
          ? { $gt: cursorData.sortValue }
          : { $lt: cursorData.sortValue };

        mongoFilter.$and = mongoFilter.$and || [];
        mongoFilter.$and.push({
          $or: [
            { [sortField]: cursorCondition },
            {
              [sortField]: cursorData.sortValue,
              _id: { [sortOrder === 1 ? '$gt' : '$lt']: new ObjectId(cursorData.id) }
            }
          ]
        });
      }
    }

    // ========================================
    // Execute Search Query
    // ========================================
    const searchStart = Date.now();

    // Build projection (include text score if using text search)
    const projection = useTextScore
      ? { score: { $meta: 'textScore' } }
      : undefined;

    // Fetch one extra to determine if there are more results
    const rawResults = await collection
      .find(mongoFilter, projection ? { projection } : undefined)
      .sort(sortCriteria)
      .limit(limit + 1)
      .toArray();

    const hasMore = rawResults.length > limit;
    const results = hasMore ? rawResults.slice(0, limit) : rawResults;
    const searchMs = Date.now() - searchStart;

    // ========================================
    // ABAC Safety Filter (defense in depth)
    // Primary ABAC filtering is now in MongoDB query above.
    // This is a safety net in case documents slip through.
    // ========================================
    const filteredResults = results.filter((resource: WithId<Document>) => {
      const resourceClassification = getClassification(resource);
      const resourceClearanceLevel = CLEARANCE_ORDER[resourceClassification] ?? 0;

      // Safety check 1: Clearance level
      if (userClearanceLevel < resourceClearanceLevel) {
        logger.warn('ABAC safety filter caught unauthorized document', {
          requestId,
          resourceId: resource.resourceId,
          resourceClassification,
          userClearance,
        });
        return false;
      }

      // Safety check 2: Releasability (if user country known)
      if (userCountry) {
        const releasability = getReleasability(resource);
        const isReleasable = releasability.includes(userCountry) ||
                            releasability.includes('NATO') ||
                            releasability.includes('FVEY');
        if (!isReleasable) {
          logger.warn('ABAC safety filter caught non-releasable document', {
            requestId,
            resourceId: resource.resourceId,
            releasabilityTo: releasability,
            userCountry,
          });
          return false;
        }
      }

      return true;
    });

    // ========================================
    // Execute Facet Aggregation (if requested)
    // ========================================
    let facets: IPaginatedSearchResponse['facets'] | undefined;
    let facetMs = 0;

    if (includeFacets) {
      const facetStart = Date.now();

      // Build ABAC-constrained base filter for facets
      // This ensures facet counts only include documents the user can access
      // But does NOT include user-selected filters (so they can see all options)
      const abacFilter: any = { $and: [] };

      // ABAC: Clearance filter
      abacFilter.$and.push({
        $or: [
          { classification: { $in: allowedClassifications } },
          { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } },
          {
            $and: [
              { classification: { $exists: false } },
              { 'ztdf.policy.securityLabel.classification': { $exists: false } }
            ]
          }
        ]
      });

      // ABAC: Releasability filter
      if (userCountry) {
        abacFilter.$and.push({
          $or: [
            { releasabilityTo: userCountry },
            { releasabilityTo: 'NATO' },
            { releasabilityTo: 'FVEY' },
            { 'ztdf.policy.securityLabel.releasabilityTo': userCountry },
            { 'ztdf.policy.securityLabel.releasabilityTo': 'NATO' },
            { 'ztdf.policy.securityLabel.releasabilityTo': 'FVEY' },
          ]
        });
      }

      // Add text query if present
      if (query && query.trim()) {
        abacFilter.$and.push({
          $or: [
            { title: { $regex: query.trim(), $options: 'i' } },
            { resourceId: { $regex: query.trim(), $options: 'i' } },
          ]
        });
      }

      // Build facet aggregation pipeline with ABAC filter
      const facetPipeline = [
        // Match ABAC-constrained documents (user can access)
        { $match: abacFilter.$and.length > 0 ? abacFilter : {} },
        // Add computed fields for ZTDF compatibility
        { $addFields: {
          _computedReleasabilityTo: {
            $ifNull: [
              '$ztdf.policy.securityLabel.releasabilityTo',
              '$releasabilityTo'
            ]
          },
          _computedCOI: {
            $ifNull: [
              '$ztdf.policy.securityLabel.COI',
              '$COI'
            ]
          }
        }},
        // Facet stage
        {
          $facet: {
            classifications: [
              { $group: {
                _id: { $ifNull: ['$ztdf.policy.securityLabel.classification', '$classification'] },
                count: { $sum: 1 }
              }},
              { $match: { _id: { $ne: null } } },
              { $sort: { count: -1 } }
            ],
            countries: [
              { $unwind: { path: '$_computedReleasabilityTo', preserveNullAndEmptyArrays: false } },
              { $match: { _computedReleasabilityTo: { $ne: null, $exists: true } } },
              { $group: { _id: '$_computedReleasabilityTo', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ],
            cois: [
              { $unwind: { path: '$_computedCOI', preserveNullAndEmptyArrays: false } },
              { $match: { _computedCOI: { $ne: null, $exists: true } } },
              { $group: { _id: '$_computedCOI', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            instances: [
              { $group: { _id: '$originRealm', count: { $sum: 1 } } },
              { $match: { _id: { $ne: null } } },
              { $sort: { count: -1 } }
            ],
            encryptionStatus: [
              { $group: {
                _id: { $cond: [{ $eq: ['$encrypted', true] }, 'encrypted', 'unencrypted'] },
                count: { $sum: 1 }
              }},
              { $sort: { _id: 1 } }
            ],
            totalCount: [
              { $count: 'count' }
            ]
          }
        }
      ];

      const facetResults = await collection.aggregate(facetPipeline).toArray();
      facetMs = Date.now() - facetStart;

      if (facetResults.length > 0) {
        const fr = facetResults[0];
        facets = {
          classifications: (fr.classifications || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          countries: (fr.countries || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          cois: (fr.cois || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          instances: (fr.instances || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          encryptionStatus: (fr.encryptionStatus || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
        };
      }
    }

    // ========================================
    // Get Total Count (with ABAC filters)
    // ========================================
    // Build count filter with same ABAC constraints as search query
    const countFilter: any = { $and: [] };

    // Text search filter (if provided)
    if (query && query.trim()) {
      countFilter.$and.push({
        $or: [
          { title: { $regex: query.trim(), $options: 'i' } },
          { resourceId: { $regex: query.trim(), $options: 'i' } },
        ]
      });
    }

    // ABAC: Classification filter
    countFilter.$and.push({
      $or: [
        { classification: { $in: allowedClassifications } },
        { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } },
        {
          $and: [
            { classification: { $exists: false } },
            { 'ztdf.policy.securityLabel.classification': { $exists: false } }
          ]
        }
      ]
    });

    // ABAC: Releasability filter
    if (userCountry) {
      countFilter.$and.push({
        $or: [
          { releasabilityTo: userCountry },
          { releasabilityTo: 'NATO' },
          { releasabilityTo: 'FVEY' },
          { 'ztdf.policy.securityLabel.releasabilityTo': userCountry },
          { 'ztdf.policy.securityLabel.releasabilityTo': 'NATO' },
          { 'ztdf.policy.securityLabel.releasabilityTo': 'FVEY' },
        ]
      });
    }

    // Get ABAC-filtered total count
    const totalCount = await collection.countDocuments(
      countFilter.$and.length > 0 ? countFilter : {}
    );

    // ========================================
    // Transform Results
    // ========================================
    const transformedResults = filteredResults.map((resource: WithId<Document>) => ({
      resourceId: resource.resourceId,
      title: resource.title,
      classification: getClassification(resource),
      releasabilityTo: getReleasability(resource),
      COI: getCOI(resource),
      encrypted: resource.encrypted || false,
      creationDate: resource.creationDate,
      displayMarking: resource.displayMarking,
      originRealm: resource.originRealm,
      ztdfVersion: (resource.ztdf as any)?.manifest?.version,
      kaoCount: (resource.ztdf as any)?.payload?.keyAccessObjects?.length || 0,
      // Phase 2: Include relevance score if using text search
      ...(useTextScore && (resource as any).score !== undefined && {
        relevanceScore: Math.round((resource as any).score * 100) / 100,
      }),
    }));

    // ========================================
    // Build Cursors
    // ========================================
    const nextCursor = hasMore && transformedResults.length > 0
      ? encodeCursor(results[results.length - 1], sortField)
      : null;

    const totalMs = Date.now() - startTime;

    // ========================================
    // Send Response
    // ========================================
    const response: IPaginatedSearchResponse = {
      results: transformedResults,
      facets,
      pagination: {
        nextCursor,
        prevCursor: null, // Could implement backward pagination if needed
        totalCount,
        hasMore,
        pageSize: limit,
      },
      timing: {
        searchMs,
        facetMs,
        totalMs,
      },
    };

    logger.info('Paginated search completed', {
      requestId,
      resultCount: transformedResults.length,
      totalCount,
      hasMore,
      searchMs,
      facetMs,
      totalMs,
    });

    res.json(response);

  } catch (error) {
    logger.error('Paginated search error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};

/**
 * GET /api/resources/search/facets
 * Get facet counts without results (for filter UI updates)
 */
export const getFacetsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();

  try {
    const client = await getMongoClient();
    const DB_NAME = getMongoDBName();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const facetPipeline = [
      // Add computed fields for ZTDF compatibility
      { $addFields: {
        _computedReleasabilityTo: {
          $ifNull: [
            '$ztdf.policy.securityLabel.releasabilityTo',
            '$releasabilityTo'
          ]
        },
        _computedCOI: {
          $ifNull: [
            '$ztdf.policy.securityLabel.COI',
            '$COI'
          ]
        }
      }},
      {
        $facet: {
          classifications: [
            { $group: {
              _id: { $ifNull: ['$ztdf.policy.securityLabel.classification', '$classification'] },
              count: { $sum: 1 }
            }},
            { $match: { _id: { $ne: null } } },
            { $sort: { count: -1 } }
          ],
          countries: [
            { $unwind: { path: '$_computedReleasabilityTo', preserveNullAndEmptyArrays: false } },
            { $match: { _computedReleasabilityTo: { $ne: null, $exists: true } } },
            { $group: { _id: '$_computedReleasabilityTo', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
          ],
          cois: [
            { $unwind: { path: '$_computedCOI', preserveNullAndEmptyArrays: false } },
            { $match: { _computedCOI: { $ne: null, $exists: true } } },
            { $group: { _id: '$_computedCOI', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          instances: [
            { $group: { _id: '$originRealm', count: { $sum: 1 } } },
            { $match: { _id: { $ne: null } } },
            { $sort: { count: -1 } }
          ],
          encryptionStatus: [
            { $group: {
              _id: { $cond: [{ $eq: ['$encrypted', true] }, 'encrypted', 'unencrypted'] },
              count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      }
    ];

    const facetResults = await collection.aggregate(facetPipeline).toArray();
    const totalMs = Date.now() - startTime;

    if (facetResults.length > 0) {
      const fr = facetResults[0];
      res.json({
        facets: {
          classifications: (fr.classifications || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          countries: (fr.countries || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          cois: (fr.cois || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          instances: (fr.instances || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
          encryptionStatus: (fr.encryptionStatus || []).map((f: any) => ({
            value: f._id,
            count: f.count
          })),
        },
        totalCount: fr.totalCount[0]?.count || 0,
        timing: { totalMs },
      });
    } else {
      res.json({
        facets: {
          classifications: [],
          countries: [],
          cois: [],
          instances: [],
          encryptionStatus: [],
        },
        totalCount: 0,
        timing: { totalMs },
      });
    }

  } catch (error) {
    logger.error('Get facets error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};
