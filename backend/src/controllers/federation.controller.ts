/**
 * DIVE V3 Federation Controller
 * Handles federation metadata and resource exchange
 */

import { Request, Response, Router } from 'express';
import { logger } from '../utils/logger';
import { IRequestWithSP, IFederationMetadata } from '../types/sp-federation.types';
import { requireSPAuth, requireSPScope } from '../middleware/sp-auth.middleware';
import { getResourcesByQuery } from '../services/resource.service';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

/**
 * GET /federation/metadata
 * Federation metadata endpoint
 */
router.get('/metadata', async (_req: Request, res: Response) => {
  const metadata: IFederationMetadata = {
    entity: {
      id: process.env.ENTITY_ID || 'https://dive-v3.usa.mil',
      type: 'service_provider',
      name: 'DIVE V3 - USA',
      country: 'USA'
    },
    endpoints: {
      resources: `${process.env.API_URL}/api/resources`,
      search: `${process.env.API_URL}/federation/search`,
      policies: `${process.env.API_URL}/api/policies-lab`
    },
    capabilities: {
      protocols: ['OIDC', 'OAuth2', 'SAML2'],
      classifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
      countries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'NLD'],
      coi: ['NATO-COSMIC', 'FVEY', 'US-ONLY', 'NATO', 'EU-RESTRICTED']
    },
    security: {
      tokenEndpoint: `${process.env.API_URL}/oauth/token`,
      jwksUri: `${process.env.API_URL}/oauth/jwks`,
      supportedAlgorithms: ['RS256', 'ES256']
    }
  };

  res.json(metadata);
});

/**
 * GET /federation/resources/search
 * User-initiated federated resource search (accepts JWT from federated realms)
 * This endpoint is called by OTHER instances when performing cross-federation search
 */
router.get('/resources/search', authenticateJWT, async (req: Request, res: Response) => {
  const { query, classification, releasableTo, coi, limit = '100' } = req.query;
  const requestId = req.headers['x-request-id'] as string || `fed-${Date.now()}`;
  const originRealm = req.headers['x-origin-realm'] as string;
  const user = (req as any).user;

  try {
    logger.info('Federation user search request', {
      requestId,
      originRealm,
      user: user?.uniqueID,
      country: user?.countryOfAffiliation,
      clearance: user?.clearance,
      searchParams: { query, classification, releasableTo, coi }
    });

    // Build search query
    const searchQuery: any = {};
    
    if (classification) {
      searchQuery['ztdf.policy.securityLabel.classification'] = classification;
    }
    
    if (releasableTo) {
      searchQuery['ztdf.policy.securityLabel.releasabilityTo'] = { $in: [releasableTo] };
    }
    
    if (coi) {
      const coiArray = Array.isArray(coi) ? coi : [coi];
      searchQuery['ztdf.policy.securityLabel.COI'] = { $in: coiArray };
    }

    if (query) {
      searchQuery.$or = [
        { title: { $regex: query, $options: 'i' } },
        { resourceId: { $regex: query, $options: 'i' } }
      ];
    }

    // Execute search
    const resources = await getResourcesByQuery(searchQuery, {
      limit: parseInt(limit as string),
      fields: {
        resourceId: 1,
        title: 1,
        'ztdf.policy.securityLabel': 1,
        creationDate: 1
      }
    });

    // Map to federated search result format
    const results = resources.map((r: any) => ({
      resourceId: r.resourceId,
      title: r.title,
      classification: r.ztdf?.policy?.securityLabel?.classification || r.classification || 'UNCLASSIFIED',
      releasabilityTo: r.ztdf?.policy?.securityLabel?.releasabilityTo || r.releasabilityTo || [],
      COI: r.ztdf?.policy?.securityLabel?.COI || r.COI || [],
      encrypted: Boolean(r.ztdf?.payload?.encryptedContent),
      creationDate: r.ztdf?.policy?.securityLabel?.creationDate || r.creationDate,
      displayMarking: r.ztdf?.policy?.securityLabel?.displayMarking,
      originRealm: process.env.INSTANCE_REALM || 'USA'
    }));

    logger.info('Federation user search completed', {
      requestId,
      originRealm,
      resultsCount: results.length
    });

    res.json({
      resources: results,
      totalResults: results.length,
      originRealm: process.env.INSTANCE_REALM || 'USA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Federation user search error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Search failed',
      requestId
    });
  }
});

/**
 * GET /federation/search
 * SP-to-SP federated resource search (requires SP authentication)
 */
router.get('/search', requireSPAuth, requireSPScope('resource:search'), async (req: Request, res: Response) => {
  const { classification, country, keywords, coi, limit = '100', offset = '0' } = req.query;
  const requestId = req.headers['x-request-id'] as string;
  const spContext = (req as IRequestWithSP).sp!;

  try {
    logger.info('Federated search request', {
      requestId,
      spId: spContext.sp.spId,
      country: spContext.sp.country,
      searchParams: { classification, country, keywords, coi }
    });

    // Validate SP has at least one active federation agreement
    const activeAgreements = spContext.sp.federationAgreements.filter(
      agreement => agreement.validUntil > new Date()
    );

    if (activeAgreements.length === 0) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'No active federation agreement found',
        details: 'All federation agreements have expired or none exist'
      });
      return;
    }

    // Validate at least one agreement covers SP's country
    const countryCovered = activeAgreements.some(agreement => 
      agreement.countries.includes(spContext.sp.country)
    );

    if (!countryCovered) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Country ${spContext.sp.country} not covered by federation agreement`,
        details: 'Your country is not included in any active federation agreement'
      });
      return;
    }

    // Build search query based on SP's allowed access
    const query: any = {
      // Always filter by releasability to include SP's country
      releasabilityTo: { $in: [spContext.sp.country] }
    };

    // Filter by classification if requested and allowed
    if (classification) {
      const allowedClassifications = activeAgreements
        .flatMap(agreement => agreement.classifications);
      
      if (!allowedClassifications.includes(classification as string)) {
        res.status(403).json({
          error: 'Forbidden',
          message: `Classification ${classification} not allowed for your organization`,
          allowedClassifications
        });
        return;
      }
      
      query.classification = classification;
    }

    // Filter by COI if requested
    if (coi) {
      const coiArray = Array.isArray(coi) ? coi : [coi];
      query.COI = { $in: coiArray };
    }

    // Text search if keywords provided
    if (keywords) {
      query.$text = { $search: keywords as string };
    }

    // Execute search
    const resources = await getResourcesByQuery(query, {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      fields: {
        resourceId: 1,
        title: 1,
        classification: 1,
        releasabilityTo: 1,
        COI: 1,
        creationDate: 1
      }
    });

    // Log search activity
    logger.info('Federated search completed', {
      requestId,
      spId: spContext.sp.spId,
      resultsCount: resources.length,
      query
    });

    res.json({
      totalResults: resources.length,
      resources: resources,
      searchContext: {
        requestingEntity: spContext.sp.name,
        country: spContext.sp.country,
        timestamp: new Date().toISOString(),
        searchId: requestId
      }
    });

  } catch (error) {
    logger.error('Federated search error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      spId: spContext.sp.spId
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Search failed',
      requestId
    });
  }
});

/**
 * POST /federation/resources/request
 * Request access to specific resource
 */
router.post('/resources/request', requireSPAuth, requireSPScope('resource:read'), async (req: Request, res: Response) => {
  const { resourceId, justification } = req.body;
  const requestId = req.headers['x-request-id'] as string;
  const spContext = (req as IRequestWithSP).sp!;

  try {
    // Validate resource exists and check basic access
    const resource = await getResourcesByQuery({ resourceId }, { limit: 1 });
    
    if (!resource || resource.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Resource not found'
      });
      return;
    }

    const resourceData = resource[0];

    // Check releasability
    if (!resourceData.releasabilityTo.includes(spContext.sp.country)) {
      logger.warn('Federation access denied - releasability', {
        requestId,
        spId: spContext.sp.spId,
        country: spContext.sp.country,
        releasabilityTo: resourceData.releasabilityTo
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Resource not releasable to your country',
        details: {
          yourCountry: spContext.sp.country,
          releasableTo: resourceData.releasabilityTo
        }
      });
      return;
    }

    // Check classification agreements
    const allowedClassifications = spContext.sp.federationAgreements
      .filter(agreement => agreement.validUntil > new Date())
      .flatMap(agreement => agreement.classifications);

    if (!allowedClassifications.includes(resourceData.classification)) {
      logger.warn('Federation access denied - classification', {
        requestId,
        spId: spContext.sp.spId,
        classification: resourceData.classification,
        allowedClassifications
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Classification level not covered by federation agreement',
        details: {
          resourceClassification: resourceData.classification,
          allowedClassifications
        }
      });
      return;
    }

    // Generate access token for this specific resource
    // In production, this would create a scoped token or access grant
    const accessGrant = {
      grantId: `grant-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      resourceId: resourceData.resourceId,
      grantedTo: spContext.sp.spId,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      justification: justification || 'Federation access request',
      restrictions: {
        classification: resourceData.classification,
        releasabilityTo: [spContext.sp.country],
        readOnly: true
      }
    };

    logger.info('Federation access granted', {
      requestId,
      grantId: accessGrant.grantId,
      spId: spContext.sp.spId,
      resourceId: resourceData.resourceId,
      classification: resourceData.classification
    });

    res.json({
      accessGrant,
      resource: {
        resourceId: resourceData.resourceId,
        title: resourceData.title,
        classification: resourceData.classification,
        accessUrl: `${process.env.API_URL}/api/resources/${resourceData.resourceId}?grant=${accessGrant.grantId}`
      }
    });

  } catch (error) {
    logger.error('Federation access request error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      spId: spContext.sp.spId,
      resourceId
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Access request failed',
      requestId
    });
  }
});

/**
 * POST /federation/resources/publish
 * Publish local resources for federation
 */
router.post('/resources/publish', authenticateJWT, async (req: Request, res: Response) => {
  const { resourceIds, federationScope } = req.body;
  const requestId = req.headers['x-request-id'] as string;
  const user = (req as any).user;

  // Check admin privileges
  if (!user || user.preferred_username !== 'admin') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
    return;
  }

  try {
    // Validate resources exist
    const resources = await getResourcesByQuery(
      { resourceId: { $in: resourceIds } },
      { limit: resourceIds.length }
    );

    if (resources.length !== resourceIds.length) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Some resources not found',
        found: resources.map(r => r.resourceId),
        requested: resourceIds
      });
      return;
    }

    // Mark resources as federated (in production, this would update metadata)
    const publishedResources = resources.map(resource => ({
      resourceId: resource.resourceId,
      title: resource.title,
      classification: resource.classification,
      releasabilityTo: resource.releasabilityTo,
      publishedAt: new Date().toISOString(),
      federationScope: federationScope || {
        countries: resource.releasabilityTo,
        classifications: [resource.classification]
      }
    }));

    logger.info('Resources published for federation', {
      requestId,
      publishedBy: user.uniqueID,
      count: publishedResources.length,
      resourceIds
    });

    res.json({
      published: publishedResources.length,
      resources: publishedResources
    });

  } catch (error) {
    logger.error('Resource publishing error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      resourceIds
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Publishing failed',
      requestId
    });
  }
});

/**
 * GET /federation/peers
 * List federation peers
 */
router.get('/peers', authenticateJWT, async (_req: Request, res: Response) => {
  // Mock implementation - in production would query peer registry
  const peers = [
    {
      peerId: 'gbr-mod-dive',
      name: 'UK Ministry of Defence DIVE',
      country: 'GBR',
      endpoint: 'https://dive.mod.uk/federation',
      status: 'active',
      agreements: ['NATO-SECRET', 'FVEY']
    },
    {
      peerId: 'fra-defense-dive',
      name: 'France Defense DIVE',
      country: 'FRA',
      endpoint: 'https://dive.defense.gouv.fr/federation',
      status: 'active',
      agreements: ['NATO-SECRET', 'EU-RESTRICTED']
    },
    {
      peerId: 'can-dnd-dive',
      name: 'Canada DND DIVE',
      country: 'CAN',
      endpoint: 'https://dive.forces.gc.ca/federation',
      status: 'active',
      agreements: ['NATO-SECRET', 'FVEY', 'CAN-US']
    }
  ];

  res.json(peers);
});

export default router;
