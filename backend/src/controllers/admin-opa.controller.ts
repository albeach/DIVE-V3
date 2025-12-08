/**
 * Admin OPA Policy Controller
 * 
 * Handles real-time OPA policy updates for demo purposes
 * Allows toggling policy rules on/off dynamically
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';
import { logAdminAction } from '../middleware/admin-auth.middleware';
import { IAdminAPIResponse } from '../types/admin.types';
import fs from 'fs';
import path from 'path';

interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
        roles?: string[];
    };
}

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

// Determine policy directory - check multiple possible locations
const getPolicyDir = (): string => {
    // 1. Check environment variable first (most reliable)
    if (process.env.POLICY_DIR) {
        const envDir = process.env.POLICY_DIR;
        if (fs.existsSync(envDir)) {
            logger.info('Using POLICY_DIR from environment', { path: envDir });
            return envDir;
        } else {
            logger.warn('POLICY_DIR env var set but directory does not exist', { path: envDir });
        }
    }
    
    // 2. Check common Docker container paths
    const dockerPaths = [
        '/app/policies',           // Docker container path (from docker-compose.yml)
        '/policies',               // Alternative Docker path
        path.join(process.cwd(), 'policies'),  // Local development
        path.join(__dirname, '../../policies'), // Relative to compiled code
        path.join(__dirname, '../../../policies'), // Alternative relative path
    ];
    
    for (const dir of dockerPaths) {
        if (fs.existsSync(dir)) {
            logger.info('Found policies directory', { path: dir, cwd: process.cwd() });
            return dir;
        }
    }
    
    // 3. Fallback to default
    const fallback = path.join(process.cwd(), 'policies');
    logger.warn('Policy directory not found, using fallback', { 
        fallback, 
        cwd: process.cwd(),
        checkedPaths: dockerPaths,
        envPolicyDir: process.env.POLICY_DIR
    });
    return fallback;
};

const POLICY_DIR = getPolicyDir();

// Recursively collect all .rego files under POLICY_DIR so nested modular layouts work
const listRegoFiles = (dir: string): string[] => {
    const files: string[] = [];
    
    try {
        if (!fs.existsSync(dir)) {
            logger.warn('Policy directory does not exist', { dir, cwd: process.cwd() });
            return files;
        }
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                files.push(...listRegoFiles(path.join(dir, entry.name)));
            } else if (entry.isFile() && entry.name.endsWith('.rego')) {
                // Return relative path from POLICY_DIR for frontend selection
                const relativePath = path.relative(POLICY_DIR, path.join(dir, entry.name));
                files.push(relativePath);
            }
        }
    } catch (error) {
        logger.error('Error listing rego files', {
            dir,
            error: error instanceof Error ? error.message : 'Unknown error',
            cwd: process.cwd()
        });
    }
    
    return files;
};

/**
 * GET /api/admin/opa/policy
 * Get current OPA policy content
 */
export const getPolicyHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const policyFile = req.query.file as string || 'fuel_inventory_abac_policy.rego';
        const policyPath = path.join(POLICY_DIR, policyFile);

        if (!fs.existsSync(policyPath)) {
            res.status(404).json({
                success: false,
                error: 'Policy file not found',
                message: `Policy file ${policyFile} does not exist`,
                requestId
            });
            return;
        }

        const policyContent = fs.readFileSync(policyPath, 'utf-8');

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_policy',
            outcome: 'success',
            details: { policyFile }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                fileName: policyFile,
                content: policyContent,
                lastModified: fs.statSync(policyPath).mtime.toISOString()
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get policy', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_policy',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get policy',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/opa/status
 * Get OPA server status and policy info
 */
export const getOPAStatusHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        // Check OPA health
        const healthUrl = `${OPA_URL}/health`;
        let opaHealthy = false;
        let opaVersion = 'unknown';

        try {
            const healthResponse = await axios.get(healthUrl, { timeout: 2000 });
            opaHealthy = healthResponse.status === 200;
            
            // Try to get version
            try {
                const versionResponse = await axios.get(`${OPA_URL}/version`, { timeout: 2000 });
                opaVersion = versionResponse.data?.version || 'unknown';
            } catch {
                // Version endpoint may not exist
            }
        } catch {
            opaHealthy = false;
        }

        // List available policies (recursive to support modular directories)
        const policyFiles: string[] = [];
        
        logger.info('Listing policy files', {
            requestId,
            policyDir: POLICY_DIR,
            exists: fs.existsSync(POLICY_DIR),
            cwd: process.cwd(),
            envPolicyDir: process.env.POLICY_DIR
        });
        
        if (fs.existsSync(POLICY_DIR)) {
            policyFiles.push(...listRegoFiles(POLICY_DIR));
            logger.info('Found policy files', {
                requestId,
                count: policyFiles.length,
                sample: policyFiles.slice(0, 5)
            });
        } else {
            logger.error('Policy directory does not exist', {
                requestId,
                policyDir: POLICY_DIR,
                cwd: process.cwd(),
                envPolicyDir: process.env.POLICY_DIR
            });
        }

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                opaUrl: OPA_URL,
                healthy: opaHealthy,
                version: opaVersion,
                policyFiles,
                policyDir: POLICY_DIR
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get OPA status', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get OPA status',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/opa/policy/toggle-rule
 * Toggle a specific policy rule on/off
 */
export const toggleRuleHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { ruleName, enabled } = req.body;
        const policyFile = req.query.file as string || req.body.file || 'entrypoints/authz.rego';

        if (!ruleName || enabled === undefined) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'ruleName and enabled are required',
                requestId
            });
            return;
        }

        const policyPath = path.join(POLICY_DIR, policyFile);
        
        if (!fs.existsSync(policyPath)) {
            res.status(404).json({
                success: false,
                error: 'Policy file not found',
                message: `Policy file ${policyFile} does not exist`,
                requestId
            });
            return;
        }

        let policyContent = fs.readFileSync(policyPath, 'utf-8');
        const escapedRuleName = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (enabled) {
            // Enable: Uncomment the rule check
            policyContent = policyContent.replace(
                new RegExp(`#\\s*not\\s+${escapedRuleName}\\s*#\\s*DISABLED`, 'g'),
                `\tnot ${escapedRuleName}`
            );
            policyContent = policyContent.replace(
                new RegExp(`#\\s*not\\s+${escapedRuleName}`, 'g'),
                `\tnot ${escapedRuleName}`
            );
            
            // Check if rule exists in allow block, add if missing
            const allowBlockMatch = policyContent.match(/allow\s+if\s*\{([^}]+)\}/s) || policyContent.match(/allow\s*:=\s*true\s+if\s*\{([^}]+)\}/s);
            if (allowBlockMatch) {
                const allowBlock = allowBlockMatch[1];
                if (!allowBlock.includes(ruleName)) {
                    policyContent = policyContent.replace(
                        /(allow\s+if\s*\{[^}]*)(\s*\})/s,
                        `$1\n\tnot ${ruleName}$2`
                    );
                }
            }
        } else {
            // Disable: Comment out the rule check
            policyContent = policyContent.replace(
                new RegExp(`(\t)(not\\s+${escapedRuleName})`, 'g'),
                `$1# $2 # DISABLED`
            );
        }

        // Write updated policy
        const backupPath = `${policyPath}.backup.${Date.now()}`;
        fs.copyFileSync(policyPath, backupPath);
        fs.writeFileSync(policyPath, policyContent, 'utf-8');

        logger.info('Policy rule toggled', {
            requestId,
            ruleName,
            enabled,
            policyFile,
            admin: authReq.user?.uniqueID
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'toggle_policy_rule',
            outcome: 'success',
            details: { ruleName, enabled, policyFile }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                ruleName,
                enabled,
                policyFile,
                message: `Rule ${ruleName} ${enabled ? 'enabled' : 'disabled'} successfully`,
                backupFile: path.basename(backupPath)
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to toggle rule', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'toggle_policy_rule',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to toggle rule',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};
