/**
 * Federation Agreement Enforcement Middleware
 * NATO Compliance: ADatP-5663 §3.10, §6.8
 * Phase 4, Task 3.3: SP Access Control Enforcement
 * 
 * Validates that Service Provider (SP) requests comply with their
 * federation agreement terms (classification limits, allowed countries, etc.)
 */

import { Request, Response, NextFunction } from 'express';
import { FederationAgreement, IFederationAgreement } from '../models/federation-agreement.model';
import { getResourceById } from '../services/resource.service';
import { logger } from '../utils/logger';

interface FederationValidationResult {
  valid: boolean;
  agreement?: IFederationAgreement;
  violations: string[];
}

export async function enforceFederationAgreement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = (req as any).user;
  let resource = (req as any).resource;
  const spId = req.headers['x-sp-id'] as string; // SP identifier from header

  if (!spId) {
    // No SP ID - internal request (no federation agreement required)
    return next();
  }

  try {
    // Load resource if not already in request (for routes where authz doesn't load it)
    if (!resource && req.params.id) {
      const loadedResource = await getResourceById(req.params.id);
      if (loadedResource) {
        // Extract classification from ZTDF or legacy fields
        const ztdf = (loadedResource as any).ztdf;
        if (ztdf) {
          resource = {
            resourceId: loadedResource.resourceId,
            classification: ztdf.policy.securityLabel.classification,
            COI: ztdf.policy.securityLabel.COI || [],
            releasabilityTo: ztdf.policy.securityLabel.releasabilityTo
          };
        } else {
          resource = {
            resourceId: loadedResource.resourceId,
            classification: (loadedResource as any).classification || 'UNCLASSIFIED',
            COI: (loadedResource as any).COI || [],
            releasabilityTo: (loadedResource as any).releasabilityTo || []
          };
        }
        (req as any).resource = resource;
      }
    }

    // For request-key endpoint, get resourceId from body
    if (!resource && req.body?.resourceId) {
      const loadedResource = await getResourceById(req.body.resourceId);
      if (loadedResource) {
        const ztdf = (loadedResource as any).ztdf;
        if (ztdf) {
          resource = {
            resourceId: loadedResource.resourceId,
            classification: ztdf.policy.securityLabel.classification,
            COI: ztdf.policy.securityLabel.COI || [],
            releasabilityTo: ztdf.policy.securityLabel.releasabilityTo
          };
        } else {
          resource = {
            resourceId: loadedResource.resourceId,
            classification: (loadedResource as any).classification || 'UNCLASSIFIED',
            COI: (loadedResource as any).COI || [],
            releasabilityTo: (loadedResource as any).releasabilityTo || []
          };
        }
        (req as any).resource = resource;
      }
    }

    if (!resource) {
      // Can't validate without resource - allow request to proceed
      // (actual resource access will be handled by controller)
      logger.debug('Federation agreement check skipped - no resource context', { spId });
      return next();
    }

    const result = await validateFederationAgreement(user, resource, spId);

    if (!result.valid) {
      logger.warn(
        `Federation agreement violation for SP ${spId}: ${result.violations.join(', ')}`,
        {
          spId,
          resourceId: resource.resourceId,
          classification: resource.classification,
          user: user?.uniqueID
        }
      );

      res.status(403).json({
        error: 'Forbidden',
        message: 'Federation agreement violation',
        violations: result.violations,
        spId
      });
      return;
    }

    // Store agreement in request for later use
    (req as any).federationAgreement = result.agreement;
    
    logger.info(`✅ Federation agreement validated for SP ${spId}`, {
      spId,
      resourceId: resource.resourceId,
      agreementId: result.agreement?.spId
    });
    next();
  } catch (error) {
    logger.error(`Federation agreement check error: ${error}`, {
      spId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Federation agreement validation failed',
    });
  }
}

/**
 * Validates request against federation agreement
 */
async function validateFederationAgreement(
  user: any,
  resource: any,
  spId: string
): Promise<FederationValidationResult> {
  const violations: string[] = [];

  // Fetch federation agreement
  const agreement = await FederationAgreement.findOne({
    spId,
    status: 'active',
  });

  if (!agreement) {
    return {
      valid: false,
      violations: [`No active federation agreement found for SP ${spId}`],
    };
  }

  // Check expiration
  if (agreement.expirationDate && new Date() > agreement.expirationDate) {
    return {
      valid: false,
      violations: ['Federation agreement expired'],
    };
  }

  // Validate IdP
  if (
    agreement.allowedIdPs.length > 0 &&
    !agreement.allowedIdPs.includes(user.iss)
  ) {
    violations.push(
      `IdP ${user.iss} not allowed (permitted: ${agreement.allowedIdPs.join(', ')})`
    );
  }

  // Validate country
  if (
    agreement.allowedCountries.length > 0 &&
    !agreement.allowedCountries.includes(user.countryOfAffiliation)
  ) {
    violations.push(
      `Country ${user.countryOfAffiliation} not allowed (permitted: ${agreement.allowedCountries.join(', ')})`
    );
  }

  // Validate classification
  const classificationLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const resourceLevel = classificationLevels.indexOf(resource.classification);
  const maxLevel = classificationLevels.indexOf(agreement.maxClassification);

  if (resourceLevel > maxLevel) {
    violations.push(
      `Classification ${resource.classification} exceeds agreement max ${agreement.maxClassification}`
    );
  }

  // Validate COI (if resource has COI requirement)
  if (resource.COI && resource.COI.length > 0) {
    const userCOIs = user.acpCOI || [];
    const hasCOI = resource.COI.some((coi: string) => userCOIs.includes(coi));

    if (!hasCOI && agreement.allowedCOIs.length > 0) {
      const agreementHasCOI = resource.COI.some((coi: string) =>
        agreement.allowedCOIs.includes(coi)
      );

      if (!agreementHasCOI) {
        violations.push(
          `Resource COI ${resource.COI.join(', ')} not covered by agreement`
        );
      }
    }
  }

  // Validate AAL
  const currentAAL = parseInt(user.acr || '0', 10);
  if (currentAAL < agreement.minAAL) {
    violations.push(
      `AAL ${currentAAL} below agreement minimum ${agreement.minAAL}`
    );
  }

  // Validate auth age
  const authTime = user.auth_time || 0;
  const authAge = Math.floor(Date.now() / 1000) - authTime;

  if (authAge > agreement.maxAuthAge) {
    violations.push(
      `Authentication age ${authAge}s exceeds agreement max ${agreement.maxAuthAge}s`
    );
  }

  return {
    valid: violations.length === 0,
    agreement,
    violations,
  };
}

/**
 * Filters attributes based on federation agreement release policy
 */
export function filterAttributesForSP(
  attributes: Record<string, any>,
  agreement: IFederationAgreement
): Record<string, any> {
  const filtered: Record<string, any> = {};

  for (const attrName of agreement.releaseAttributes) {
    if (attributes[attrName] !== undefined) {
      filtered[attrName] = attributes[attrName];
    }
  }

  logger.debug(
    `Filtered ${Object.keys(filtered).length}/${Object.keys(attributes).length} attributes for SP ${agreement.spId}`
  );

  return filtered;
}

