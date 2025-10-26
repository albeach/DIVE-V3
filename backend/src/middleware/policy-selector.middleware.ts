import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Policy Selector Middleware
 * 
 * Selects which OPA policy package to use based on:
 * 1. X-Standards-Lens header (from frontend toggle)
 * 2. Query parameter ?policy=federation|object|unified
 * 3. Default: unified policy
 * 
 * Sets req.policyPackage for use by authz middleware
 * 
 * Usage:
 * ```typescript
 * app.use(policySelectorMiddleware);
 * // Then in authz middleware:
 * const policyPackage = req.policyPackage || 'dive.authorization';
 * ```
 */

export interface IPolicySelection {
    package: string;
    endpoint: string;
    description: string;
    standard: '5663' | '240' | 'unified';
}

declare global {
    namespace Express {
        interface Request {
            policyPackage?: string;
            policySelection?: IPolicySelection;
        }
    }
}

const POLICY_MAP: Record<string, IPolicySelection> = {
    '5663': {
        package: 'dive.federation',
        endpoint: '/v1/data/dive/federation/decision',
        description: 'Federation ABAC (ADatP-5663 focused)',
        standard: '5663',
    },
    '240': {
        package: 'dive.object',
        endpoint: '/v1/data/dive/object/decision',
        description: 'Object ABAC (ACP-240 focused)',
        standard: '240',
    },
    'unified': {
        package: 'dive.authorization',
        endpoint: '/v1/data/dive/authorization/decision',
        description: 'Unified ABAC (Both standards)',
        standard: 'unified',
    },
    'federation': {
        package: 'dive.federation',
        endpoint: '/v1/data/dive/federation/decision',
        description: 'Federation ABAC (ADatP-5663 focused)',
        standard: '5663',
    },
    'object': {
        package: 'dive.object',
        endpoint: '/v1/data/dive/object/decision',
        description: 'Object ABAC (ACP-240 focused)',
        standard: '240',
    },
};

/**
 * Policy Selector Middleware
 * 
 * Extracts policy preference from request and sets policy selection
 */
export function policySelectorMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    try {
        // Check header (from frontend Standards Lens toggle)
        const lensHeader = req.headers['x-standards-lens'] as string;

        // Check query parameter
        const queryParam = req.query.policy as string;

        // Determine policy
        let policyKey = 'unified'; // Default

        if (lensHeader && POLICY_MAP[lensHeader]) {
            policyKey = lensHeader;
        } else if (queryParam && POLICY_MAP[queryParam]) {
            policyKey = queryParam;
        }

        // Set policy selection
        const selection = POLICY_MAP[policyKey];
        req.policyPackage = selection.package;
        req.policySelection = selection;

        logger.debug('Policy selected', {
            policy: selection.package,
            standard: selection.standard,
            source: lensHeader ? 'header' : queryParam ? 'query' : 'default',
            requestId: req.headers['x-request-id'],
        });

        next();
    } catch (error) {
        logger.error('Policy selector middleware error', { error });
        // Don't block request - fall through to default policy
        req.policyPackage = 'dive.authorization';
        req.policySelection = POLICY_MAP['unified'];
        next();
    }
}

/**
 * Get Available Policies
 * 
 * Returns list of available OPA policies for UI selector
 */
export function getAvailablePolicies(): IPolicySelection[] {
    return [
        POLICY_MAP['5663'],
        POLICY_MAP['240'],
        POLICY_MAP['unified'],
    ];
}

