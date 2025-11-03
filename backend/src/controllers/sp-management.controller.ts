/**
 * DIVE V3 SP Management Controller
 * Handles Service Provider registry operations
 * 
 * Endpoints:
 * - GET /api/sp-management/sps - List all SPs
 * - GET /api/sp-management/sps/:spId - Get SP details
 * - POST /api/sp-management/register - Register new SP
 * - PUT /api/sp-management/sps/:spId - Update SP
 * - DELETE /api/sp-management/sps/:spId - Delete SP
 * - POST /api/sp-management/sps/:spId/approve - Approve/Reject SP
 * - POST /api/sp-management/sps/:spId/suspend - Suspend/Reactivate SP
 * - POST /api/sp-management/sps/:spId/regenerate-secret - Regenerate client secret
 * - GET /api/sp-management/sps/:spId/activity - Get activity logs
 */

import { Request, Response } from 'express';
import { SPManagementService } from '../services/sp-management.service';
import { logger } from '../utils/logger';
import { ISPRegistrationRequest } from '../types/sp-federation.types';

const spService = new SPManagementService();

/**
 * Extended Request with authenticated user
 */
interface IAuthenticatedRequest extends Request {
  user?: {
    uniqueID: string;
    sub: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    roles?: string[];
  };
}

interface ISPListFilter {
  status?: string;
  country?: string;
  organizationType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * GET /api/sp-management/sps
 * List all Service Providers with optional filtering
 */
export async function listSPs(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const filter: ISPListFilter = {
      status: req.query.status as any,
      country: req.query.country as string,
      organizationType: req.query.organizationType as any,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20
    };

    logger.info('Listing SPs', {
      filter,
      requestedBy: req.user?.uniqueID
    });

    const result = await spService.listSPs(filter);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Failed to list SPs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to list SPs'
    });
  }
}

/**
 * GET /api/sp-management/sps/:spId
 * Get specific Service Provider details
 */
export async function getSPById(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;

    logger.info('Getting SP details', {
      spId,
      requestedBy: req.user?.uniqueID
    });

    const sp = await spService.getById(spId);

    if (!sp) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json(sp);
  } catch (error) {
    logger.error('Failed to get SP', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get SP'
    });
  }
}

/**
 * POST /api/sp-management/register
 * Register new Service Provider
 */
export async function registerSP(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const registrationRequest: ISPRegistrationRequest = req.body;

    logger.info('Registering new SP', {
      name: registrationRequest.name,
      country: registrationRequest.country,
      requestedBy: req.user?.uniqueID
    });

    const sp = await spService.registerSP(registrationRequest);

    res.status(201).json(sp);
  } catch (error) {
    logger.error('Failed to register SP', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to register SP'
    });
  }
}

/**
 * PUT /api/sp-management/sps/:spId
 * Update Service Provider configuration
 */
export async function updateSP(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;
    const updates = req.body;

    logger.info('Updating SP', {
      spId,
      updates: Object.keys(updates),
      requestedBy: req.user?.uniqueID
    });

    const sp = await spService.updateSP(spId, updates);

    if (!sp) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json(sp);
  } catch (error) {
    logger.error('Failed to update SP', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to update SP'
    });
  }
}

/**
 * DELETE /api/sp-management/sps/:spId
 * Delete Service Provider
 */
export async function deleteSP(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;

    logger.info('Deleting SP', {
      spId,
      requestedBy: req.user?.uniqueID
    });

    const success = await spService.deleteSP(spId);

    if (!success) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json({
      message: `Service Provider ${spId} deleted successfully`
    });
  } catch (error) {
    logger.error('Failed to delete SP', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to delete SP'
    });
  }
}

/**
 * POST /api/sp-management/sps/:spId/approve
 * Approve or reject pending Service Provider
 */
export async function approveSP(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;
    const { action, reason, approvedBy } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Action must be "approve" or "reject"'
      });
      return;
    }

    logger.info(`${action === 'approve' ? 'Approving' : 'Rejecting'} SP`, {
      spId,
      action,
      reason,
      approvedBy: approvedBy || req.user?.uniqueID
    });

    const sp = await spService.approveSP(spId, action === 'approve', reason, approvedBy || req.user?.uniqueID);

    if (!sp) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json(sp);
  } catch (error) {
    logger.error('Failed to approve/reject SP', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to approve/reject SP'
    });
  }
}

/**
 * POST /api/sp-management/sps/:spId/suspend
 * Suspend or reactivate Service Provider
 */
export async function suspendSP(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;
    const { reason, suspendedBy } = req.body;

    if (!reason || reason.length < 10) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Suspension reason is required (minimum 10 characters)'
      });
      return;
    }

    logger.info('Suspending SP', {
      spId,
      reason,
      suspendedBy: suspendedBy || req.user?.uniqueID
    });

    const sp = await spService.suspendSP(spId, reason, suspendedBy || req.user?.uniqueID);

    if (!sp) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json(sp);
  } catch (error) {
    logger.error('Failed to suspend SP', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to suspend SP'
    });
  }
}

/**
 * POST /api/sp-management/sps/:spId/regenerate-secret
 * Regenerate client secret for confidential clients
 */
export async function regenerateSecret(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;
    const { regeneratedBy } = req.body;

    logger.info('Regenerating client secret', {
      spId,
      regeneratedBy: regeneratedBy || req.user?.uniqueID
    });

    const result = await spService.regenerateClientSecret(spId);

    if (!result) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json({
      message: 'Client secret regenerated successfully',
      clientSecret: result.clientSecret,
      warning: 'Save this secret securely. It will not be shown again.'
    });
  } catch (error) {
    logger.error('Failed to regenerate secret', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to regenerate secret'
    });
  }
}

/**
 * GET /api/sp-management/sps/:spId/activity
 * Get activity logs for Service Provider
 */
export async function getSPActivity(req: IAuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { spId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    logger.info('Getting SP activity logs', {
      spId,
      limit,
      offset,
      requestedBy: req.user?.uniqueID
    });

    const activity = await spService.getActivityLogs(spId, limit, offset);

    if (!activity) {
      res.status(404).json({
        error: 'Not found',
        message: `Service Provider ${spId} not found`
      });
      return;
    }

    res.status(200).json(activity);
  } catch (error) {
    logger.error('Failed to get SP activity', {
      spId: req.params.spId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.uniqueID
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Failed to get SP activity'
    });
  }
}

