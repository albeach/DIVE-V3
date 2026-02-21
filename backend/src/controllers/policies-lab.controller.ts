/**
 * Policies Lab Controller
 *
 * HTTP endpoints for policy upload, validation, evaluation, and management.
 *
 * API Routes:
 * - POST /api/policies/upload - Upload and validate policy
 * - POST /api/policies/:id/evaluate - Evaluate policy with input
 * - GET /api/policies/:id - Get policy metadata
 * - DELETE /api/policies/:id - Delete policy
 * - GET /api/policies/list - List user's policies
 *
 * Date: October 26, 2025
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
    IPolicyUpload,
    IUploadPolicyResponse,
    IEvaluatePolicyRequest,
    IEvaluatePolicyResponse,
    IGetPolicyResponse,
    PolicyType
} from '../types/policies-lab.types';
import { validateRego, validateXACML } from '../services/policy-validation.service';
import { evaluatePolicy } from '../services/policy-execution.service';
import {
    savePolicyUpload,
    getPolicyById,
    getPoliciesByOwner,
    deletePolicyById,
    countPoliciesByOwner
} from '../services/policy-lab.service';
import {
    savePolicySource,
    deletePolicyDir,
    MAX_POLICY_SIZE_BYTES
} from '../utils/policy-lab-fs.utils';
import * as fs from 'fs/promises';
import * as path from 'path';
// import * as crypto from 'crypto'; // Unused import
// Duplicate import removed - already imported above

// ============================================================================
// Configuration
// ============================================================================

// Max policies per user
const MAX_POLICIES_PER_USER = 10;

// ============================================================================
// POST /api/policies/upload
// ============================================================================

export async function uploadPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        // Check if file uploaded
        if (!req.file) {
            res.status(400).json({ error: 'BadRequest', message: 'No policy file uploaded' });
            return;
        }

        const file = req.file;
        const source = file.buffer.toString('utf8');

        // Parse metadata from request body
        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        const { name, description, standardsLens } = metadata;

        if (!name) {
            res.status(400).json({ error: 'BadRequest', message: 'Policy name is required' });
            return;
        }

        // Validate file size
        if (file.size > MAX_POLICY_SIZE_BYTES) {
            res.status(400).json({
                error: 'FileTooLarge',
                message: `File exceeds maximum size of ${MAX_POLICY_SIZE_BYTES} bytes`,
                details: { sizeBytes: file.size, maxSizeBytes: MAX_POLICY_SIZE_BYTES }
            });
            return;
        }

        // Determine policy type from file extension
        const extension = file.originalname.split('.').pop()?.toLowerCase();
        let policyType: PolicyType;

        if (extension === 'rego') {
            policyType = 'rego';
        } else if (extension === 'xml') {
            policyType = 'xacml';
        } else {
            res.status(400).json({
                error: 'InvalidFileType',
                message: 'File must be .rego or .xml',
                details: { filename: file.originalname }
            });
            return;
        }

        // Check user policy limit
        const userPolicyCount = await countPoliciesByOwner(uniqueID);
        if (userPolicyCount >= MAX_POLICIES_PER_USER) {
            res.status(403).json({
                error: 'PolicyLimitExceeded',
                message: `Maximum ${MAX_POLICIES_PER_USER} policies per user`,
                details: { currentCount: userPolicyCount, maxPolicies: MAX_POLICIES_PER_USER }
            });
            return;
        }

        // Validate policy
        let validationResult;
        if (policyType === 'rego') {
            validationResult = await validateRego(source);
        } else {
            validationResult = await validateXACML(source);
        }

        // Generate policy ID
        const policyId = `pol-${uuidv4()}`;

        // Save policy source to filesystem
        const { sizeBytes, hash } = await savePolicySource(uniqueID, policyId, policyType, source);

        // Create policy upload record
        const policyUpload: IPolicyUpload = {
            policyId,
            ownerId: uniqueID,
            type: policyType,
            filename: file.originalname,
            sizeBytes,
            hash,
            validated: validationResult.validated,
            validationErrors: validationResult.errors,
            metadata: {
                name,
                description: description || '',
                packageOrPolicyId: validationResult.metadata?.packageOrPolicyId || 'unknown',
                rulesCount: validationResult.metadata?.rulesCount || 0,
                standardsLens,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            structure: validationResult.structure || {},
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Save to database
        await savePolicyUpload(policyUpload);

        logger.info('Policy uploaded', {
            policyId,
            userId: uniqueID,
            type: policyType,
            validated: validationResult.validated,
            sizeBytes
        });

        // Return response
        const response: IUploadPolicyResponse = {
            policyId,
            type: policyType,
            filename: file.originalname,
            sizeBytes,
            validated: validationResult.validated,
            validationErrors: validationResult.errors,
            metadata: policyUpload.metadata
        };

        res.status(201).json(response);

    } catch (error) {
        logger.error('Upload policy error', { error: error instanceof Error ? error.message : 'Unknown error' });
        next(error);
    }
}

// ============================================================================
// POST /api/policies/:id/evaluate
// ============================================================================

export async function evaluatePolicyById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        const { id: policyId } = req.params;
        const evalRequest: IEvaluatePolicyRequest = req.body;

        if (!evalRequest.unified) {
            res.status(400).json({ error: 'BadRequest', message: 'Missing unified input' });
            return;
        }

        // Get policy from database (with ownership check)
        const policy = await getPolicyById(policyId, uniqueID);
        if (!policy) {
            res.status(404).json({
                error: 'NotFound',
                message: 'Policy not found or access denied',
                details: { policyId }
            });
            return;
        }

        // Check if policy is validated
        if (!policy.validated) {
            res.status(400).json({
                error: 'PolicyNotValidated',
                message: 'Cannot evaluate policy with validation errors',
                details: { policyId, validationErrors: policy.validationErrors }
            });
            return;
        }

        // Execute policy evaluation
        const executionContext = {
            policyId: policy.policyId,
            userId: uniqueID,
            policyType: policy.type,
            packageOrPolicyId: policy.metadata.packageOrPolicyId,
            policyName: policy.metadata.name
        };

        const result = await evaluatePolicy(executionContext, evalRequest.unified);

        logger.info('Policy evaluated', {
            policyId,
            userId: uniqueID,
            engine: result.engine,
            decision: result.decision,
            latency_ms: result.evaluation_details.latency_ms
        });

        // Return normalized decision
        const response: IEvaluatePolicyResponse = result;
        res.status(200).json(response);

    } catch (error) {
        logger.error('Evaluate policy error', { error: error instanceof Error ? error.message : 'Unknown error' });

        // Check for timeout
        if (error instanceof Error && error.message?.includes('timeout')) {
            res.status(408).json({
                error: 'PolicyEvaluationTimeout',
                message: error instanceof Error ? error.message : 'Unknown error',
                details: { policyId: req.params.id }
            });
            return;
        }

        next(error);
    }
}

// ============================================================================
// GET /api/policies/:id
// ============================================================================

export async function getPolicyMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        const { id: policyId } = req.params;

        // Get policy from database (with ownership check)
        const policy = await getPolicyById(policyId, uniqueID);
        if (!policy) {
            res.status(404).json({
                error: 'NotFound',
                message: 'Policy not found or access denied',
                details: { policyId }
            });
            return;
        }

        // Return policy metadata
        const response: IGetPolicyResponse = policy;
        res.status(200).json(response);

    } catch (error) {
        logger.error('Get policy metadata error', { error: error instanceof Error ? error.message : 'Unknown error' });
        next(error);
    }
}

// ============================================================================
// DELETE /api/policies/:id
// ============================================================================

export async function deletePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        const { id: policyId } = req.params;

        // Delete from database (with ownership check)
        const deleted = await deletePolicyById(policyId, uniqueID);
        if (!deleted) {
            res.status(404).json({
                error: 'NotFound',
                message: 'Policy not found or access denied',
                details: { policyId }
            });
            return;
        }

        // Delete from filesystem
        const policy = await getPolicyById(policyId);
        if (policy) {
            await deletePolicyDir(uniqueID, policyId);
        }

        logger.info('Policy deleted', { policyId, userId: uniqueID });

        res.status(204).send();

    } catch (error) {
        logger.error('Delete policy error', { error: error instanceof Error ? error.message : 'Unknown error' });
        next(error);
    }
}

// ============================================================================
// GET /api/policies/list
// ============================================================================

export async function listUserPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        // Get user's policies
        const userPolicies = await getPoliciesByOwner(uniqueID);

        // Also get example policies (system-examples) to show to all users
        const examplePolicies = await getPoliciesByOwner('system-examples');

        // Combine user's policies with examples (user's first)
        const allPolicies = [...userPolicies, ...examplePolicies];

        // Return list (without full structure, just metadata)
        const response = allPolicies.map(policy => ({
            policyId: policy.policyId,
            type: policy.type,
            filename: policy.filename,
            validated: policy.validated,
            metadata: policy.metadata,
            createdAt: policy.createdAt,
            updatedAt: policy.updatedAt,
            isExample: policy.ownerId === 'system-examples'  // Flag example policies
        }));

        res.status(200).json({
            policies: response,
            count: response.length,
            userPolicyCount: userPolicies.length,
            examplePolicyCount: examplePolicies.length
        });

    } catch (error) {
        logger.error('List policies error', { error: error instanceof Error ? error.message : 'Unknown error' });
        next(error);
    }
}

// ============================================================================
// POST /api/policies-lab/load-samples
// ============================================================================

export async function loadSamplePolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Get authenticated user
        const uniqueID = (req as any).user?.uniqueID;
        if (!uniqueID) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing user authentication' });
            return;
        }

        // Check user policy limit
        const userPolicyCount = await countPoliciesByOwner(uniqueID);
        if (userPolicyCount >= MAX_POLICIES_PER_USER) {
            res.status(403).json({
                error: 'PolicyLimitExceeded',
                message: `Maximum ${MAX_POLICIES_PER_USER} policies per user`,
                details: { currentCount: userPolicyCount, maxPolicies: MAX_POLICIES_PER_USER }
            });
            return;
        }

        // Path to sample policies
        const samplesDir = path.join(process.cwd(), 'policies', 'uploads', 'samples');

        // Sample policy definitions
        const samplePolicies = [
            {
                filename: 'clearance-policy.rego',
                name: 'Clearance-Based Access Control',
                description: 'Sample Rego policy demonstrating clearance level comparison, country releasability, and COI matching',
                type: 'rego' as PolicyType
            },
            {
                filename: 'releasability-policy.rego',
                name: 'Country Releasability Policy',
                description: 'Simple Rego policy focused on country releasability checks',
                type: 'rego' as PolicyType
            },
            {
                filename: 'clearance-policy.xml',
                name: 'XACML Clearance Policy',
                description: 'Sample XACML 3.0 policy for clearance-based access control',
                type: 'xacml' as PolicyType
            }
        ];

        const loadedPolicies: string[] = [];
        const errors: string[] = [];

        for (const sample of samplePolicies) {
            try {
                // Check if user already has this policy (by filename)
                const existingPolicies = await getPoliciesByOwner(uniqueID);
                const alreadyExists = existingPolicies.some(p => p.filename === sample.filename);

                if (alreadyExists) {
                    logger.debug('Sample policy already exists for user', { userId: uniqueID, filename: sample.filename });
                    continue;
                }

                // Check policy limit
                if (userPolicyCount + loadedPolicies.length >= MAX_POLICIES_PER_USER) {
                    errors.push(`Policy limit reached. Loaded ${loadedPolicies.length} policies.`);
                    break;
                }

                // Read sample file
                const filePath = path.join(samplesDir, sample.filename);
                const content = await fs.readFile(filePath, 'utf8');

                // Validate policy
                let validationResult;
                if (sample.type === 'rego') {
                    validationResult = await validateRego(content);
                } else {
                    validationResult = await validateXACML(content);
                }

                // Generate policy ID
                const policyId = `sample-${Date.now()}-${Math.random().toString(36).substring(7)}`;                // Save policy source to filesystem
                const { sizeBytes, hash } = await savePolicySource(uniqueID, policyId, sample.type, content);                // Create policy upload record
                const policyUpload: IPolicyUpload = {
                    policyId,
                    ownerId: uniqueID,
                    type: sample.type,
                    filename: sample.filename,
                    sizeBytes,
                    hash,
                    validated: validationResult.validated,
                    validationErrors: validationResult.errors,
                    metadata: {
                        name: sample.name,
                        description: sample.description,
                        packageOrPolicyId: validationResult.metadata?.packageOrPolicyId || 'unknown',
                        rulesCount: validationResult.metadata?.rulesCount || 0,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    },
                    structure: validationResult.structure || {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Save to database
                await savePolicyUpload(policyUpload);
                loadedPolicies.push(sample.name);

                logger.info('Sample policy loaded', {
                    policyId,
                    userId: uniqueID,
                    filename: sample.filename,
                    type: sample.type
                });

            } catch (error) {
                logger.error('Failed to load sample policy', { filename: sample.filename, error: error instanceof Error ? error.message : 'Unknown error' });
                errors.push(`Failed to load ${sample.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        res.status(200).json({
            success: true,
            count: loadedPolicies.length,
            policies: loadedPolicies,
            errors: errors.length > 0 ? errors : undefined
        });    } catch (error) {
        logger.error('Load sample policies error', { error: error instanceof Error ? error.message : 'Unknown error' });
        next(error);
    }
}
