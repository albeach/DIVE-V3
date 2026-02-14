/**
 * Health Controller
 * Phase 4, Task 3.1: Policy Version and System Health Endpoints
 *
 * Provides health check endpoints for monitoring, including:
 * - System health status
 * - OPA policy version (for drift detection)
 * - KAS federation status
 * - Database connectivity
 *
 * NATO Compliance: ACP-240 §6.1 (System Monitoring Requirements)
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import * as https from 'https';
import { logger } from '../utils/logger';
import { policyVersionMonitor } from '../services/policy-version-monitor.service';
import { mongoKasRegistryStore } from '../models/kas-registry.model';

// ============================================
// Configuration
// ============================================

const OPA_URL = process.env.OPA_URL || 'http://opa:8181';
const INSTANCE_REALM = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

// ============================================
// Basic Health Check
// ============================================

/**
 * GET /api/health
 * Basic health check endpoint
 */
export const healthCheckHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({
      status: 'healthy',
      instance: INSTANCE_REALM,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// Policy Version Endpoint
// ============================================

/**
 * GET /api/health/policy-version
 * Returns OPA policy version for drift detection
 */
export const getPolicyVersionHandler = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const opaResponse = await axios.get(
      `${OPA_URL}/v1/data/dive/policy_version`,
      { timeout: 5000 }
    );

    res.json({
      instance: INSTANCE_REALM,
      policyVersion: opaResponse.data.result,
      opaUrl: OPA_URL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get OPA policy version', {
      error: error instanceof Error ? error.message : 'Unknown error',
      opaUrl: OPA_URL
    });

    res.status(503).json({
      error: 'Service Unavailable',
      message: 'OPA policy version unavailable',
      instance: INSTANCE_REALM,
      timestamp: new Date().toISOString()
    });
  }
};

// ============================================
// Policy Drift Check
// ============================================

/**
 * GET /api/health/policy-consistency
 * Check policy consistency across federation (admin only)
 */
export const getPolicyConsistencyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if user has admin privileges
    const user = (req as any).user;
    if (!user?.roles?.includes('admin') && !user?.roles?.includes('super-admin')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
      return;
    }

    // Run consistency check
    const report = await policyVersionMonitor.checkPolicyConsistency();

    res.json({
      consistent: report.consistent,
      expectedVersion: report.expectedVersion,
      checkTimestamp: report.checkTimestamp,
      instances: report.instances.map(i => ({
        code: i.instanceCode,
        version: i.policyVersion?.version || 'unavailable',
        healthy: i.healthy,
        latencyMs: i.latencyMs,
        error: i.error
      })),
      driftDetails: report.driftDetails
    });
  } catch (error) {
    logger.error('Policy consistency check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
};

// ============================================
// KAS Federation Status
// ============================================

/**
 * GET /api/health/kas-federation
 * Returns KAS federation status (MongoDB SSOT)
 */
export const getKASFederationStatusHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get KAS instances from MongoDB (SSOT)
    const kasServers = await mongoKasRegistryStore.findAll();
    const activeKas = kasServers.filter(k => k.status === 'active' && k.enabled);

    res.json({
      instance: INSTANCE_REALM,
      crossKASEnabled: true, // Always enabled when using MongoDB registry
      kasServers: kasServers.map(kas => ({
        kasId: kas.kasId,
        organization: kas.organization,
        countryCode: kas.countryCode,
        trustLevel: kas.trustLevel,
        status: kas.status,
        enabled: kas.enabled,
        lastHeartbeat: kas.metadata?.lastHeartbeat || null,
        health: {
          healthy: kas.status === 'active' && kas.enabled,
          lastCheck: kas.metadata?.lastHeartbeat || null
        }
      })),
      summary: {
        total: kasServers.length,
        active: activeKas.length,
        pending: kasServers.filter(k => k.status === 'pending').length,
        suspended: kasServers.filter(k => k.status === 'suspended').length,
        offline: kasServers.filter(k => k.status === 'offline').length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get KAS federation status', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
};

// ============================================
// Comprehensive Health Check
// ============================================

/**
 * GET /api/health/detailed
 * Comprehensive health check including all services
 */
export const getDetailedHealthHandler = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  const checks: Record<string, { healthy: boolean; latencyMs?: number; error?: string; details?: Record<string, unknown> }> = {};

  // Check OPA
  try {
    const httpsAgent = new https.Agent({
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false, // Allow self-signed certs in development
    });

    const opaStart = Date.now();
    const opaResponse = await axios.get(`${OPA_URL}/health`, {
      timeout: 3000,
      httpsAgent,
    });
    checks.opa = {
      healthy: opaResponse.status === 200,
      latencyMs: Date.now() - opaStart
    };
  } catch (error) {
    checks.opa = {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Check KAS registry loaded (MongoDB SSOT)
  try {
    const kasServers = await mongoKasRegistryStore.findAll();
    const activeKas = kasServers.filter(k => k.status === 'active' && k.enabled);
    checks.kasRegistry = {
      healthy: kasServers.length > 0,
      details: {
        kasCount: kasServers.length,
        activeCount: activeKas.length,
        crossKASEnabled: true // Always enabled with MongoDB registry
      }
    };
  } catch (error) {
    checks.kasRegistry = {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Check policy version
  try {
    const policyStart = Date.now();
    const policyResponse = await axios.get(
      `${OPA_URL}/v1/data/dive/policy_version`,
      { timeout: 3000 }
    );
    checks.policyVersion = {
      healthy: !!policyResponse.data.result,
      latencyMs: Date.now() - policyStart,
      details: {
        version: policyResponse.data.result?.version,
        bundleId: policyResponse.data.result?.bundleId
      }
    };
  } catch (error) {
    checks.policyVersion = {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Get last policy drift report
  const lastDriftReport = policyVersionMonitor.getLastReport();
  if (lastDriftReport) {
    checks.policyConsistency = {
      healthy: lastDriftReport.consistent,
      details: {
        consistent: lastDriftReport.consistent,
        lastCheck: lastDriftReport.checkTimestamp,
        expectedVersion: lastDriftReport.expectedVersion
      }
    };
  }

  // Overall health
  const allHealthy = Object.values(checks).every(c => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    instance: INSTANCE_REALM,
    checks,
    totalLatencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString()
  });
};

// ============================================
// Readiness Probe (for Kubernetes)
// ============================================

/**
 * GET /api/health/ready
 * Kubernetes readiness probe
 */
export const readinessHandler = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const httpsAgent = new https.Agent({
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false, // Allow self-signed certs in development
    });

    // Check OPA is reachable
    await axios.get(`${OPA_URL}/health`, {
      timeout: 2000,
      httpsAgent,
    });

    res.json({
      ready: true,
      instance: INSTANCE_REALM,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      reason: 'OPA not reachable',
      instance: INSTANCE_REALM,
      timestamp: new Date().toISOString()
    });
  }
};

// ============================================
// Liveness Probe (for Kubernetes)
// ============================================

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
export const livenessHandler = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  res.json({
    alive: true,
    instance: INSTANCE_REALM,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
};
