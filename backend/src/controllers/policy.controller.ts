/**
 * Policy Controller
 * Week 3.2: OPA Policy Viewer
 * 
 * REST API controllers for policy management (read-only)
 * Endpoints: GET /policies, GET /policies/:id, POST /policies/:id/test
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import {
    listPolicies,
    getPolicyById,
    testPolicyDecision,
    getPolicyStats
} from '../services/policy.service';
import { IOPAInput } from '../types/policy.types';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * List all policies
 * GET /api/policies
 */
export const listPoliciesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        logger.info('Listing policies', { requestId });

        const policies = await listPolicies();
        const stats = await getPolicyStats();

        res.json({
            policies,
            stats,
            count: policies.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get policy content by ID
 * GET /api/policies/:id
 */
export const getPolicyHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('Fetching policy', { requestId, policyId: id });

        const policy = await getPolicyById(id);

        if (!policy) {
            throw new NotFoundError(`Policy ${id} not found`);
        }

        res.json(policy);

    } catch (error) {
        next(error);
    }
};

/**
 * Test policy decision
 * POST /api/policies/:id/test
 * 
 * Body: IOPAInput
 * Returns: Decision with evaluation details
 */
export const testDecisionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('Testing policy decision', { requestId, policyId: id });

        // Validate request body
        if (!req.body || !req.body.input) {
            throw new ValidationError('Request body must contain "input" field');
        }

        const opaInput: IOPAInput = req.body;

        // Validate required fields
        validateOPAInput(opaInput);

        // Test decision
        const result = await testPolicyDecision(opaInput);

        res.json(result);

    } catch (error) {
        next(error);
    }
};

/**
 * Validate OPA input structure
 */
function validateOPAInput(input: IOPAInput): void {
    const { subject, action, resource, context } = input.input;

    // Validate subject
    if (!subject) {
        throw new ValidationError('Missing required field: input.subject');
    }
    if (typeof subject.authenticated !== 'boolean') {
        throw new ValidationError('input.subject.authenticated must be boolean');
    }
    if (!subject.uniqueID) {
        throw new ValidationError('Missing required field: input.subject.uniqueID');
    }
    if (!subject.clearance) {
        throw new ValidationError('Missing required field: input.subject.clearance');
    }
    if (!subject.countryOfAffiliation) {
        throw new ValidationError('Missing required field: input.subject.countryOfAffiliation');
    }

    // Validate action
    if (!action || !action.operation) {
        throw new ValidationError('Missing required field: input.action.operation');
    }

    // Validate resource
    if (!resource) {
        throw new ValidationError('Missing required field: input.resource');
    }
    if (!resource.resourceId) {
        throw new ValidationError('Missing required field: input.resource.resourceId');
    }
    if (!resource.classification) {
        throw new ValidationError('Missing required field: input.resource.classification');
    }
    if (!Array.isArray(resource.releasabilityTo)) {
        throw new ValidationError('input.resource.releasabilityTo must be array');
    }
    if (typeof resource.encrypted !== 'boolean') {
        throw new ValidationError('input.resource.encrypted must be boolean');
    }

    // Validate context
    if (!context) {
        throw new ValidationError('Missing required field: input.context');
    }
    if (!context.currentTime) {
        throw new ValidationError('Missing required field: input.context.currentTime');
    }
    if (!context.requestId) {
        throw new ValidationError('Missing required field: input.context.requestId');
    }
}
