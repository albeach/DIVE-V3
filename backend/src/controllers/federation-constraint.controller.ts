/**
 * Federation Constraint Controller
 *
 * CRUD operations for bilateral federation constraints with RBAC enforcement.
 * Phase 2, Task 1.2
 */

import { Request, Response } from 'express';
import { FederationConstraint, IFederationConstraint } from '../models/federation-constraint.model';
import { logger } from '../utils/logger';
import { opalClient } from '../services/opal-client';

// ============================================
// Helper: Trigger OPAL Update
// ============================================

/**
 * Trigger OPAL update after constraint modification
 * CDC will auto-detect MongoDB change, but we can also manually trigger
 */
async function triggerOPALUpdate(): Promise<void> {
  try {
    const data = await FederationConstraint.getActiveConstraintsForOPAL();
    await opalClient.publishInlineData(
      'federation_constraints',
      {
        success: true,
        federation_constraints: data,
        count: Object.values(data).reduce((sum, partners) => sum + Object.keys(partners).length, 0),
        timestamp: new Date().toISOString(),
      },
      'Manual trigger after constraint modification'
    );
    logger.debug('OPAL update triggered for federation_constraints');
  } catch (error) {
    logger.error('Failed to trigger OPAL update', { error });
    // Don't throw - constraint is saved, OPAL will sync eventually via CDC
  }
}

// ============================================
// CRUD Handlers
// ============================================

/**
 * GET /api/federation-constraints
 * List all constraints (filtered by tenant for non-admins)
 */
export async function listConstraints(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;

    // Super admin sees all
    if (user.role === 'super_admin') {
      const constraints = await FederationConstraint.find({ status: 'active' });
      res.json({
        success: true,
        constraints,
        count: constraints.length,
      });
      return;
    }

    // Tenant admin sees only their own outbound constraints
    const constraints = await FederationConstraint.getOutboundConstraints(user.tenant);

    res.json({
      success: true,
      constraints,
      count: constraints.length,
      tenant: user.tenant,
    });
  } catch (error) {
    logger.error('Failed to list federation constraints', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve federation constraints',
    });
  }
}

/**
 * GET /api/federation-constraints/:ownerTenant/:partnerTenant
 * Get specific bilateral constraint
 */
export async function getConstraint(req: Request, res: Response): Promise<void> {
  try {
    const { ownerTenant, partnerTenant } = req.params;

    const constraint = await FederationConstraint.findOne({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
      status: 'active',
    });

    if (!constraint) {
      res.status(404).json({
        success: false,
        error: 'Constraint not found',
        ownerTenant: ownerTenant.toUpperCase(),
        partnerTenant: partnerTenant.toUpperCase(),
      });
      return;
    }

    res.json({
      success: true,
      constraint,
    });
  } catch (error) {
    logger.error('Failed to get federation constraint', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve federation constraint',
    });
  }
}

/**
 * GET /api/federation-constraints/bilateral/:tenantA/:tenantB
 * Get bilateral constraints (both directions)
 */
export async function getBilateralConstraints(req: Request, res: Response): Promise<void> {
  try {
    const { tenantA, tenantB } = req.params;

    const bilateral = await FederationConstraint.getBilateralConstraints(
      tenantA.toUpperCase(),
      tenantB.toUpperCase()
    );

    // Calculate effective-min (for informational purposes)
    const effectiveMax = calculateEffectiveMax(bilateral.outbound, bilateral.inbound);

    res.json({
      success: true,
      tenantA: tenantA.toUpperCase(),
      tenantB: tenantB.toUpperCase(),
      outbound: bilateral.outbound,
      inbound: bilateral.inbound,
      effectiveMax,
    });
  } catch (error) {
    logger.error('Failed to get bilateral constraints', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bilateral constraints',
    });
  }
}

/**
 * POST /api/federation-constraints
 * Create new constraint (RBAC enforced via middleware)
 */
export async function createConstraint(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const {
      ownerTenant,
      partnerTenant,
      relationshipType = 'spoke_spoke',
      maxClassification,
      allowedCOIs = [],
      deniedCOIs = [],
      coiOperator = 'ALL',
      allowedResourceTags = [],
      deniedResourceTags = [],
      allowedPurposes = [],
      effectiveDate,
      expirationDate,
      description = '',
      rationale = '',
    } = req.body;

    // Validation: Required fields
    if (!ownerTenant || !partnerTenant || !maxClassification) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: ownerTenant, partnerTenant, maxClassification',
      });
      return;
    }

    // Validation: Classification must be valid
    const validClassifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    if (!validClassifications.includes(maxClassification)) {
      res.status(400).json({
        success: false,
        error: `Invalid maxClassification: ${maxClassification}. Must be one of: ${validClassifications.join(', ')}`,
      });
      return;
    }

    // RBAC validation (already done in middleware, but double-check)
    if (relationshipType === 'hub_spoke' && user.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Only hub super administrators can create hub↔spoke constraints',
      });
      return;
    }

    if (user.role !== 'super_admin' && ownerTenant.toUpperCase() !== user.tenant) {
      res.status(403).json({
        success: false,
        error: 'Tenant admins can only create constraints for their own tenant',
      });
      return;
    }

    // Check if constraint already exists
    const existing = await FederationConstraint.findOne({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
    });

    if (existing && existing.status === 'active') {
      res.status(409).json({
        success: false,
        error: 'Constraint already exists for this tenant pair',
        existingConstraint: existing,
      });
      return;
    }

    // If existing but suspended/expired, we can reactivate or create new
    if (existing) {
      logger.info('Reactivating suspended/expired constraint', {
        ownerTenant,
        partnerTenant,
        previousStatus: existing.status,
      });
    }

    // Create constraint
    const constraint = await FederationConstraint.create({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
      relationshipType,
      maxClassification,
      allowedCOIs,
      deniedCOIs,
      coiOperator,
      allowedResourceTags,
      deniedResourceTags,
      allowedPurposes,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      description,
      rationale,
      createdBy: user.uniqueID || user.email,
      modifiedBy: user.uniqueID || user.email,
      status: 'active',
    });

    logger.info('Federation constraint created', {
      ownerTenant,
      partnerTenant,
      relationshipType,
      createdBy: user.uniqueID || user.email,
    });

    // Trigger OPAL update
    await triggerOPALUpdate();

    res.status(201).json({
      success: true,
      constraint,
      message: 'Constraint created successfully. OPAL distribution initiated.',
    });
  } catch (error) {
    logger.error('Failed to create federation constraint', { error });

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create constraint',
      });
    }
  }
}

/**
 * PUT /api/federation-constraints/:ownerTenant/:partnerTenant
 * Update existing constraint (RBAC enforced via middleware)
 */
export async function updateConstraint(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { ownerTenant, partnerTenant } = req.params;
    const updates = req.body;

    // Find constraint
    const constraint = await FederationConstraint.findOne({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
    });

    if (!constraint) {
      res.status(404).json({
        success: false,
        error: 'Constraint not found',
      });
      return;
    }

    // RBAC check (already done in middleware, but double-check)
    if (constraint.relationshipType === 'hub_spoke' && user.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Only hub super administrators can modify hub↔spoke constraints',
      });
      return;
    }

    if (user.role !== 'super_admin' && constraint.ownerTenant !== user.tenant) {
      res.status(403).json({
        success: false,
        error: 'Tenant admins can only modify their own constraints',
      });
      return;
    }

    // Validate updates
    if (updates.maxClassification) {
      const validClassifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
      if (!validClassifications.includes(updates.maxClassification)) {
        res.status(400).json({
          success: false,
          error: `Invalid maxClassification: ${updates.maxClassification}`,
        });
        return;
      }
    }

    // Apply updates
    const updateFields: Partial<IFederationConstraint> = {
      ...updates,
      modifiedBy: user.uniqueID || user.email,
    };

    // Convert date strings to Date objects
    if (updates.effectiveDate) {
      updateFields.effectiveDate = new Date(updates.effectiveDate);
    }
    if (updates.expirationDate) {
      updateFields.expirationDate = new Date(updates.expirationDate);
    }

    const success = await FederationConstraint.updateOne(
      { ownerTenant: ownerTenant.toUpperCase(), partnerTenant: partnerTenant.toUpperCase() },
      updateFields
    );

    if (!success) {
      res.status(500).json({
        success: false,
        error: 'Failed to update constraint',
      });
      return;
    }

    logger.info('Federation constraint updated', {
      ownerTenant,
      partnerTenant,
      modifiedBy: user.uniqueID || user.email,
    });

    // Get updated constraint
    const updatedConstraint = await FederationConstraint.findOne({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
    });

    // Trigger OPAL update
    await triggerOPALUpdate();

    res.json({
      success: true,
      constraint: updatedConstraint,
      message: 'Constraint updated successfully. OPAL distribution initiated.',
    });
  } catch (error) {
    logger.error('Failed to update federation constraint', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update constraint',
    });
  }
}

/**
 * DELETE /api/federation-constraints/:ownerTenant/:partnerTenant
 * Delete constraint (soft delete - set status to suspended)
 */
export async function deleteConstraint(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const { ownerTenant, partnerTenant } = req.params;

    const constraint = await FederationConstraint.findOne({
      ownerTenant: ownerTenant.toUpperCase(),
      partnerTenant: partnerTenant.toUpperCase(),
    });

    if (!constraint) {
      res.status(404).json({
        success: false,
        error: 'Constraint not found',
      });
      return;
    }

    // RBAC check (already done in middleware, but double-check)
    if (constraint.relationshipType === 'hub_spoke' && user.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Only hub super administrators can delete hub↔spoke constraints',
      });
      return;
    }

    if (user.role !== 'super_admin' && constraint.ownerTenant !== user.tenant) {
      res.status(403).json({
        success: false,
        error: 'Tenant admins can only delete their own constraints',
      });
      return;
    }

    // Soft delete
    const success = await FederationConstraint.softDelete(
      ownerTenant.toUpperCase(),
      partnerTenant.toUpperCase(),
      `Deleted by ${user.uniqueID || user.email}`,
      user.uniqueID || user.email
    );

    if (!success) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete constraint',
      });
      return;
    }

    logger.info('Federation constraint deleted (soft)', {
      ownerTenant,
      partnerTenant,
      deletedBy: user.uniqueID || user.email,
    });

    // Trigger OPAL update
    await triggerOPALUpdate();

    res.json({
      success: true,
      message: 'Constraint deleted successfully (soft delete). OPAL distribution initiated.',
      constraint: {
        ownerTenant: ownerTenant.toUpperCase(),
        partnerTenant: partnerTenant.toUpperCase(),
        status: 'suspended',
      },
    });
  } catch (error) {
    logger.error('Failed to delete federation constraint', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete constraint',
    });
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate effective maximum classification (bilateral effective-min)
 */
function calculateEffectiveMax(
  outbound: IFederationConstraint | null,
  inbound: IFederationConstraint | null
): string | null {
  if (!outbound || !inbound) {
    return null;
  }

  const classificationLevels: Record<string, number> = {
    UNCLASSIFIED: 0,
    CONFIDENTIAL: 1,
    SECRET: 2,
    TOP_SECRET: 3,
  };

  const outboundLevel = classificationLevels[outbound.maxClassification] ?? 0;
  const inboundLevel = classificationLevels[inbound.maxClassification] ?? 0;

  const minLevel = Math.min(outboundLevel, inboundLevel);

  const levelNames = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  return levelNames[minLevel] || null;
}

// Export for use in routes
export default {
  listConstraints,
  getConstraint,
  getBilateralConstraints,
  createConstraint,
  updateConstraint,
  deleteConstraint,
};
