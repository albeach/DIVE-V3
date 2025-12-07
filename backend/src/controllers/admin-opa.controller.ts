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
const POLICY_DIR = process.env.POLICY_DIR || path.join(process.cwd(), 'policies');

// Recursively collect all .rego files under POLICY_DIR so nested modular layouts work
const listRegoFiles = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            files.push(...listRegoFiles(path.join(dir, entry.name)));
        } else if (entry.isFile() && entry.name.endsWith('.rego')) {
            // Return relative path from POLICY_DIR for frontend selection
            files.push(path.relative(POLICY_DIR, path.join(dir, entry.name)));
        }
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
 * POST /api/admin/opa/policy/update
 * Update OPA policy dynamically
 * 
 * Body: {
 *   policyId: string,  // e.g., "dive.authorization"
 *   policyContent: string,  // Full Rego policy content
 *   updateType: "replace" | "toggle"  // How to update
 *   toggleRule?: string  // Rule name to toggle (if updateType is "toggle")
 * }
 */
export const updatePolicyHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { policyId, policyContent, updateType, toggleRule } = req.body;

        if (!policyId || !policyContent) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'policyId and policyContent are required',
                requestId
            });
            return;
        }

        // Validate policy content (basic check)
        if (!policyContent.includes('package ') && !policyContent.includes('package ')) {
            res.status(400).json({
                success: false,
                error: 'Invalid policy content',
                message: 'Policy must contain a package declaration',
                requestId
            });
            return;
        }

        // Update policy in OPA via REST API
        // OPA supports PUT /v1/policies/{id} to update policies dynamically
        // const policyPath = policyId.replace(/\./g, '/'); // Unused - policy path conversion
        const updateUrl = `${OPA_URL}/v1/policies/${policyId}`;

        try {
            await axios.put(updateUrl, policyContent, {
                headers: { 'Content-Type': 'text/plain' },
                timeout: 5000
            });

            logger.info('Policy updated in OPA', {
                requestId,
                policyId,
                updateType,
                admin: authReq.user?.uniqueID
            });

            logAdminAction({
                requestId,
                admin: authReq.user?.uniqueID || 'unknown',
                action: 'update_policy',
                outcome: 'success',
                details: { policyId, updateType, toggleRule }
            });

            const response: IAdminAPIResponse = {
                success: true,
                data: {
                    policyId,
                    updated: true,
                    message: `Policy ${policyId} updated successfully in OPA`
                },
                requestId
            };

            res.status(200).json(response);
        } catch (opaError: any) {
            // If OPA doesn't support PUT /v1/policies, try alternative approach
            // OPA bundle mode requires file system updates, but we can use data API
            logger.warn('Direct OPA policy update failed, trying data API', {
                requestId,
                error: opaError.message
            });

            // Alternative: Use OPA's data API to inject policy rules
            // This is a workaround for bundle mode
            // const dataUrl = `${OPA_URL}/v1/data/${policyPath}`;
            
            // For demo purposes, we'll update the file and trigger a reload
            // In production, you'd want to use OPA's bundle API or restart the container
            const policyFile = 'fuel_inventory_abac_policy.rego';
            const filePath = path.join(POLICY_DIR, policyFile);
            
            if (fs.existsSync(filePath)) {
                // Backup original
                const backupPath = `${filePath}.backup.${Date.now()}`;
                fs.copyFileSync(filePath, backupPath);
                
                // Write new content
                fs.writeFileSync(filePath, policyContent, 'utf-8');
                
                logger.info('Policy file updated (requires OPA reload)', {
                    requestId,
                    policyId,
                    filePath,
                    backupPath
                });

                logAdminAction({
                    requestId,
                    admin: authReq.user?.uniqueID || 'unknown',
                    action: 'update_policy',
                    outcome: 'success',
                    details: { policyId, updateType, method: 'file_update' }
                });

                const response: IAdminAPIResponse = {
                    success: true,
                    data: {
                        policyId,
                        updated: true,
                        message: `Policy file updated. Note: OPA may need to reload bundle to pick up changes.`,
                        method: 'file_update',
                        backupFile: path.basename(backupPath)
                    },
                    requestId
                };

                res.status(200).json(response);
            } else {
                throw new Error(`Policy file ${filePath} not found`);
            }
        }
    } catch (error) {
        logger.error('Failed to update policy', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_policy',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to update policy',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/opa/policy/toggle-rule
 * Toggle a specific policy rule on/off
 * 
 * Body: {
 *   ruleName: string,  // e.g., "is_industry_access_blocked"
 *   enabled: boolean
 * }
 */
export const toggleRuleHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { ruleName, enabled } = req.body;
        const policyFile = req.query.file as string || 'fuel_inventory_abac_policy.rego';

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

        // Toggle the rule by modifying it in the allow condition
        // The allow rule uses "not ruleName" to check violations
        // To disable: comment out or remove the check
        // To enable: ensure the check is present
        
        if (enabled) {
            // Enable: Ensure the rule check exists in the allow block
            // First, check if it's commented out
            policyContent = policyContent.replace(
                new RegExp(`#\\s*not\\s+${escapedRuleName}`, 'g'),
                `\tnot ${escapedRuleName}`
            );
            
            // Check if the rule exists in the allow block
            const allowBlockMatch = policyContent.match(/allow\s*:=\s*true\s+if\s*\{([^}]+)\}/s);
            if (allowBlockMatch) {
                const allowBlock = allowBlockMatch[1];
                // If rule is not present, add it
                if (!allowBlock.includes(ruleName)) {
                    // Add the rule check before the closing brace
                    policyContent = policyContent.replace(
                        /(allow\s*:=\s*true\s+if\s*\{[^}]*)(\s*\} else := false)/s,
                        `$1\n\tnot ${ruleName}$2`
                    );
                } else {
                    // Ensure it's not commented and has "not " prefix
                    policyContent = policyContent.replace(
                        new RegExp(`(allow\\s*:=\\s*true\\s+if\\s*\\{[^}]*?)(#\\s*)?(not\\s+)?${escapedRuleName}([^}]*?\\})`, 's'),
                        `$1\tnot ${ruleName}$4`
                    );
                }
            }
        } else {
            // Disable: Comment out the rule check in the allow block
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
        if (fs.existsSync(POLICY_DIR)) {
            policyFiles.push(...listRegoFiles(POLICY_DIR));
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

