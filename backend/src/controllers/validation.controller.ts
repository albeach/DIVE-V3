/**
 * DIVE V3 - System Validation Controller
 *
 * Provides validation endpoints for system health and configuration
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface ValidationCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

interface ValidationResult {
  timestamp: string;
  instance: string;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  checks: ValidationCheck[];
}

/**
 * Validate secret synchronization between Terraform and GCP
 */
async function validateSecretSync(): Promise<ValidationCheck> {
  try {
    const instanceCode = process.env.INSTANCE_REALM || 'USA';
    const instanceLower = instanceCode.toLowerCase();

    // For hub, check main client secret
    if (instanceCode === 'USA') {
      const tfSecret = await getTerraformSecret('hub', 'client_secret');
      const gcpSecret = await getGCPSecret('dive-v3-keycloak-client-secret');
      const envSecret = process.env.KEYCLOAK_CLIENT_SECRET || process.env.AUTH_KEYCLOAK_SECRET;

      if (!tfSecret || !gcpSecret || !envSecret) {
        return {
          name: 'secret_sync',
          status: 'warning',
          message: 'Could not retrieve all secrets for comparison',
          details: {
            hasTerraform: !!tfSecret,
            hasGCP: !!gcpSecret,
            hasEnv: !!envSecret
          }
        };
      }

      const tfMatch = tfSecret === gcpSecret;
      const envMatch = gcpSecret === envSecret;
      const allMatch = tfMatch && envMatch;

      return {
        name: 'secret_sync',
        status: allMatch ? 'ok' : 'error',
        message: allMatch ? 'Secrets are synchronized' : 'Secret drift detected',
        details: {
          terraformMatchesGCP: tfMatch,
          gcpMatchesEnv: envMatch,
          terraformPrefix: tfSecret?.substring(0, 8) + '...',
          gcpPrefix: gcpSecret?.substring(0, 8) + '...',
          envPrefix: envSecret?.substring(0, 8) + '...'
        }
      };
    } else {
      // For spokes
      const gcpSecret = await getGCPSecret(`dive-v3-keycloak-client-secret-${instanceLower}`);
      const envSecret = process.env.KEYCLOAK_CLIENT_SECRET || process.env.AUTH_KEYCLOAK_SECRET;

      const match = gcpSecret === envSecret;

      return {
        name: 'secret_sync',
        status: match ? 'ok' : 'error',
        message: match ? 'Secrets are synchronized' : 'Secret drift detected',
        details: {
          gcpMatchesEnv: match,
          gcpPrefix: gcpSecret?.substring(0, 8) + '...',
          envPrefix: envSecret?.substring(0, 8) + '...'
        }
      };
    }
  } catch (error) {
    return {
      name: 'secret_sync',
      status: 'error',
      message: 'Failed to validate secret sync',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Validate KAS registry consistency
 */
async function validateKASRegistry(): Promise<ValidationCheck> {
  try {
    // REMOVED: JSON file loading - NO JSON FILES
    // KAS registry must be loaded from MongoDB (SSOT)
    let staticCount = 0;

    // Check MongoDB (SSOT)
    try {
      const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
      await mongoKasRegistryStore.initialize();
      const kasServers = await mongoKasRegistryStore.findAll();
      staticCount = kasServers.filter(k => k.enabled && k.status === 'active').length;
    } catch (error) {
      // MongoDB not available or not initialized
    }

    return {
      name: 'kas_registry',
      status: staticCount > 0 ? 'ok' : 'warning',
      message: staticCount > 0 ? 'KAS registry available' : 'KAS registry not found',
      details: {
        staticConfigExists: staticCount > 0,
        staticServerCount: staticCount
      }
    };
  } catch (error) {
    return {
      name: 'kas_registry',
      status: 'error',
      message: 'Failed to validate KAS registry',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Validate environment configuration
 */
function validateEnvironment(): ValidationCheck {
  const requiredVars = [
    'MONGODB_URL',
    'KEYCLOAK_URL',
    'INSTANCE_REALM'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  return {
    name: 'environment',
    status: missing.length === 0 ? 'ok' : 'error',
    message: missing.length === 0 ? 'Environment variables configured' : `Missing ${missing.length} required variables`,
    details: {
      required: requiredVars.length,
      configured: requiredVars.length - missing.length,
      missing
    }
  };
}

/**
 * Helper: Get secret from GCP Secret Manager
 */
async function getGCPSecret(secretName: string): Promise<string | null> {
  try {
    const { stdout } = await execPromise(
      `gcloud secrets versions access latest --secret=${secretName} --project=dive25 2>/dev/null`
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Helper: Get secret from Terraform output
 */
async function getTerraformSecret(instance: string, outputKey: string): Promise<string | null> {
  try {
    const tfDir = instance === 'hub'
      ? path.join(process.cwd(), '..', 'terraform', 'hub')
      : path.join(process.cwd(), '..', 'terraform', 'spoke');

    let command = `cd ${tfDir} && terraform output -raw ${outputKey} 2>/dev/null`;

    if (instance !== 'hub') {
      command = `cd ${tfDir} && terraform workspace select ${instance} >/dev/null 2>&1 && terraform output -raw ${outputKey} 2>/dev/null`;
    }

    const { stdout } = await execPromise(command);
    const value = stdout.trim();
    return (value && value !== 'null') ? value : null;
  } catch {
    return null;
  }
}

/**
 * Main validation endpoint
 */
export async function validateSystem(req: Request, res: Response): Promise<void> {
  try {
    logger.info('System validation requested', {
      requestId: (req as unknown as Record<string, string>).id,
      ip: req.ip
    });

    const instanceCode = process.env.INSTANCE_REALM || 'USA';

    // Run all validation checks
    const checks: ValidationCheck[] = [];

    checks.push(await validateSecretSync());
    checks.push(await validateKASRegistry());
    checks.push(validateEnvironment());

    // Determine overall status
    const hasError = checks.some(c => c.status === 'error');
    const hasWarning = checks.some(c => c.status === 'warning');

    const overallStatus: ValidationResult['overallStatus'] =
      hasError ? 'critical' : hasWarning ? 'degraded' : 'healthy';

    const result: ValidationResult = {
      timestamp: new Date().toISOString(),
      instance: instanceCode,
      overallStatus,
      checks
    };

    logger.info('System validation completed', {
      overallStatus,
      checksRun: checks.length,
      errors: checks.filter(c => c.status === 'error').length,
      warnings: checks.filter(c => c.status === 'warning').length
    });

    res.json(result);

  } catch (error) {
    logger.error('System validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Validation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Quick health check endpoint
 */
export function quickHealth(req: Request, res: Response): void {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    instance: process.env.INSTANCE_REALM || 'USA',
    uptime: process.uptime()
  });
}
