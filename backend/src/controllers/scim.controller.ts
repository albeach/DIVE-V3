/**
 * DIVE V3 SCIM 2.0 Controller
 * Implements SCIM endpoints for user provisioning
 */

import { Request, Response, Router, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { SCIMService } from '../services/scim.service';
import { ISCIMUser, ISCIMListResponse, ISCIMError } from '../types/sp-federation.types';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

// Dependency injection for testing (BEST PRACTICE)
let scimService: SCIMService;

export function initializeSCIMServices(scimServiceInstance?: SCIMService) {
  scimService = scimServiceInstance || new SCIMService();
}

// Initialize with default instance
initializeSCIMServices();

/**
 * SCIM middleware to validate SP has SCIM access
 */
const scimAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Check for SP token
  const spContext = (req as any).sp;
  if (spContext) {
    // Validate SP has SCIM scope
    if (!spContext.scopes.includes('scim:read') && !spContext.scopes.includes('scim:write')) {
      return res.status(403).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "403",
        detail: "Insufficient scope for SCIM operations"
      } as ISCIMError);
    return;
    }
    return next();
  }

  // Fall back to user JWT auth for admin operations
  return authenticateJWT(req, res, next);
};

/**
 * GET /scim/v2/Users
 * Search/List users
 */
router.get('/Users', scimAuthMiddleware, async (req: Request, res: Response) => {
  const {
    filter,
    startIndex = '1',
    count = '20',
    attributes,
    excludedAttributes,
    sortBy,
    sortOrder
  } = req.query;

  const requestId = req.headers['x-request-id'] as string;

  try {
    logger.debug('SCIM user search request', {
      requestId,
      filter,
      startIndex,
      count,
      hasSpContext: !!(req as any).sp
    });

    const result = await scimService.searchUsers({
      filter: filter as string,
      startIndex: parseInt(startIndex as string),
      count: parseInt(count as string),
      attributes: attributes as string,
      excludedAttributes: excludedAttributes as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'ascending' | 'descending'
    });

    const response: ISCIMListResponse<ISCIMUser> = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: result.total,
      itemsPerPage: result.items.length,
      startIndex: parseInt(startIndex as string),
      Resources: result.items
    };

    res.json(response);

  } catch (error) {
    logger.error('SCIM search error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      filter
    });

    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: error instanceof Error ? error.message : 'Invalid filter or search parameters'
    } as ISCIMError);
    return;
  }
});

/**
 * GET /scim/v2/Users/:id
 * Get user by ID
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.get('/Users/:id', scimAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string;

  try {
    const user = await scimService.getUserById(id);
    
    if (!user) {
      return res.status(404).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "404",
        detail: `User ${id} not found`
      } as ISCIMError);
    return;
    }

    res.json(user);

  } catch (error) {
    logger.error('SCIM get user error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: id
    });

    res.status(500).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "500",
      detail: 'Internal server error'
    } as ISCIMError);
    return;
  }
});

/**
 * POST /scim/v2/Users
 * Create new user
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.post('/Users', scimAuthMiddleware, async (req: Request, res: Response) => {
  const scimUser = req.body as ISCIMUser;
  const requestId = req.headers['x-request-id'] as string;
  
  // Check write permission
  const spContext = (req as any).sp;
  if (spContext && !spContext.scopes.includes('scim:write')) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "403",
      detail: "Write access required for user creation"
    } as ISCIMError);
    return;
  }

  try {
    // Validate required DIVE V3 attributes
    const diveExtension = scimUser["urn:dive:params:scim:schemas:extension:2.0:User"];
    if (!diveExtension?.clearance || !diveExtension?.countryOfAffiliation) {
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        scimType: "invalidValue",
        detail: "Missing required DIVE V3 attributes: clearance and countryOfAffiliation"
      } as ISCIMError);
    return;
    }

    // Validate clearance level
    const validClearances = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    if (!validClearances.includes(diveExtension.clearance)) {
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        scimType: "invalidValue",
        detail: `Invalid clearance level. Must be one of: ${validClearances.join(', ')}`
      } as ISCIMError);
    return;
    }

    // Validate ISO 3166-1 alpha-3 country code
    const validCountryCodes = [
      'USA', 'GBR', 'CAN', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'POL', 'BEL',
      'DNK', 'NOR', 'PRT', 'TUR', 'GRC', 'CZE', 'HUN', 'ROU', 'BGR', 'HRV',
      'SVK', 'SVN', 'EST', 'LVA', 'LTU', 'LUX', 'ALB', 'MNE', 'MKD', 'FIN', 'SWE'
    ];
    if (!validCountryCodes.includes(diveExtension.countryOfAffiliation)) {
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        scimType: "invalidValue",
        detail: `Invalid country code: ${diveExtension.countryOfAffiliation}. Must be ISO 3166-1 alpha-3 (e.g., USA, GBR, FRA)`
      } as ISCIMError);
    return;
    }

    // Create user
    const createdUser = await scimService.createUser(scimUser);

    logger.info('SCIM user created', {
      requestId,
      userId: createdUser.id,
      userName: createdUser.userName,
      clearance: diveExtension.clearance,
      country: diveExtension.countryOfAffiliation,
      createdBy: spContext ? spContext.clientId : 'admin'
    });

    res.status(201)
      .header('Location', `/scim/v2/Users/${createdUser.id}`)
      .json(createdUser);

  } catch (error) {
    logger.error('SCIM user creation error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userName: scimUser.userName
    });

    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "409",
        scimType: "uniqueness",
        detail: "User with this username already exists"
      } as ISCIMError);
    return;
    } else {
      res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "500",
        detail: 'Internal server error'
      } as ISCIMError);
    return;
    }
  }
});

/**
 * PUT /scim/v2/Users/:id
 * Update user (full replacement)
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.put('/Users/:id', scimAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const scimUser = req.body as ISCIMUser;
  const requestId = req.headers['x-request-id'] as string;
  
  // Check write permission
  const spContext = (req as any).sp;
  if (spContext && !spContext.scopes.includes('scim:write')) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "403",
      detail: "Write access required for user updates"
    } as ISCIMError);
    return;
  }

  try {
    const updatedUser = await scimService.updateUser(id, scimUser);
    
    if (!updatedUser) {
      return res.status(404).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "404",
        detail: `User ${id} not found`
      } as ISCIMError);
    return;
    }

    logger.info('SCIM user updated', {
      requestId,
      userId: id,
      updatedBy: spContext ? spContext.clientId : 'admin'
    });

    res.json(updatedUser);

  } catch (error) {
    logger.error('SCIM user update error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: id
    });

    res.status(500).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "500",
      detail: 'Internal server error'
    } as ISCIMError);
    return;
  }
});

/**
 * PATCH /scim/v2/Users/:id
 * Partial update user
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.patch('/Users/:id', scimAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const patchOp = req.body;
  const requestId = req.headers['x-request-id'] as string;
  
  // Check write permission
  const spContext = (req as any).sp;
  if (spContext && !spContext.scopes.includes('scim:write')) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "403",
      detail: "Write access required for user updates"
    } as ISCIMError);
    return;
  }

  try {
    const patchedUser = await scimService.patchUser(id, patchOp);
    
    if (!patchedUser) {
      return res.status(404).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "404",
        detail: `User ${id} not found`
      } as ISCIMError);
    return;
    }

    logger.info('SCIM user patched', {
      requestId,
      userId: id,
      operations: patchOp.Operations?.length || 0,
      patchedBy: spContext ? spContext.clientId : 'admin'
    });

    res.json(patchedUser);

  } catch (error) {
    logger.error('SCIM user patch error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: id
    });

    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: error instanceof Error ? error.message : 'Invalid patch operation'
    } as ISCIMError);
    return;
  }
});

/**
 * DELETE /scim/v2/Users/:id
 * Delete user
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.delete('/Users/:id', scimAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const requestId = req.headers['x-request-id'] as string;
  
  // Check write permission
  const spContext = (req as any).sp;
  if (spContext && !spContext.scopes.includes('scim:write')) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "403",
      detail: "Write access required for user deletion"
    } as ISCIMError);
    return;
  }

  try {
    const deleted = await scimService.deleteUser(id);
    
    if (!deleted) {
      return res.status(404).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "404",
        detail: `User ${id} not found`
      } as ISCIMError);
    return;
    }

    logger.info('SCIM user deleted', {
      requestId,
      userId: id,
      deletedBy: spContext ? spContext.clientId : 'admin'
    });

    res.status(204).send();

  } catch (error) {
    logger.error('SCIM user deletion error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: id
    });

    res.status(500).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "500",
      detail: 'Internal server error'
    } as ISCIMError);
    return;
  }
});

/**
 * GET /scim/v2/Groups
 * List groups (future implementation)
 */
router.get('/Groups', scimAuthMiddleware, async (_req: Request, res: Response) => {
  // Placeholder for group management
  res.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 0,
    itemsPerPage: 0,
    startIndex: 1,
    Resources: []
  });
});

/**
 * GET /scim/v2/ServiceProviderConfig
 * SCIM service provider configuration
 */
router.get('/ServiceProviderConfig', async (_req: Request, res: Response) => {
  res.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://dive-v3.mil/docs/scim",
    patch: {
      supported: true
    },
    bulk: {
      supported: true,
      maxOperations: 100,
      maxPayloadSize: 1048576
    },
    filter: {
      supported: true,
      maxResults: 1000
    },
    changePassword: {
      supported: false
    },
    sort: {
      supported: true
    },
    etag: {
      supported: false
    },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "Authentication using OAuth 2.0 Bearer Token",
        specUri: "https://tools.ietf.org/html/rfc6750",
        documentationUri: "https://dive-v3.mil/docs/oauth"
      }
    ],
    meta: {
      location: "/scim/v2/ServiceProviderConfig",
      resourceType: "ServiceProviderConfig"
    }
  });
});

/**
 * GET /scim/v2/Schemas
 * List supported SCIM schemas
 */
router.get('/Schemas', async (_req: Request, res: Response) => {
  res.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    Resources: [
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        description: "Core User Schema",
        attributes: [
          {
            name: "userName",
            type: "string",
            multiValued: false,
            required: true,
            caseExact: false,
            mutability: "readWrite",
            returned: "default",
            uniqueness: "server"
          }
          // ... other core attributes
        ]
      },
      {
        id: "urn:dive:params:scim:schemas:extension:2.0:User",
        name: "DIVE User Extension",
        description: "DIVE V3 specific user attributes",
        attributes: [
          {
            name: "clearance",
            type: "string",
            multiValued: false,
            required: true,
            caseExact: true,
            mutability: "readWrite",
            returned: "default",
            canonicalValues: ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
          },
          {
            name: "countryOfAffiliation",
            type: "string",
            multiValued: false,
            required: true,
            caseExact: true,
            mutability: "readWrite",
            returned: "default",
            description: "ISO 3166-1 alpha-3 country code"
          },
          {
            name: "acpCOI",
            type: "string",
            multiValued: true,
            required: false,
            caseExact: true,
            mutability: "readWrite",
            returned: "default"
          },
          {
            name: "dutyOrg",
            type: "string",
            multiValued: false,
            required: false,
            caseExact: false,
            mutability: "readWrite",
            returned: "default"
          }
        ]
      }
    ]
  });
});

export default router;
