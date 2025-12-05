/**
 * FRA Key Access Service (KAS)
 * 
 * Purpose: Manage encryption keys for FRA resources with policy re-evaluation
 * GAP-005: Multi-KAS divergence detection through audit logging
 * GAP-004: Correlation ID tracking for key operations
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import morgan from 'morgan';
import cors from 'cors';

const app = express();
const PORT = process.env.KAS_PORT || 8080;
const INSTANCE_REALM = 'FRA';

// Middleware
app.use(express.json());
app.use(cors({
  origin: [
    'https://fra-app.dive25.com',
    'http://localhost:3001',
    'http://localhost:4001'
  ],
  credentials: true
}));

// Correlation ID middleware
app.use((req: Request, res: Response, next) => {
  const correlationId = req.headers['x-correlation-id'] as string || `kas-fra-${uuidv4()}`;
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-KAS-Authority', INSTANCE_REALM);
  next();
});

// Structured logging with correlation IDs
app.use(morgan((tokens, req, res) => {
  const correlationId = req.headers['x-correlation-id'];
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    responseTime: `${tokens['response-time'](req, res)}ms`,
    correlationId,
    kasRealm: INSTANCE_REALM
  });
}));

// Key storage (in production, use secure key management service)
interface KeyRecord {
  keyId: string;
  resourceId: string;
  realm: string;
  key: string;
  algorithm: string;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  policyVersion: string;
}

const keyStore = new Map<string, KeyRecord>();

// Audit log (in production, persist to database)
interface AuditEntry {
  timestamp: Date;
  correlationId: string;
  operation: 'key_request' | 'key_grant' | 'key_deny' | 'policy_mismatch';
  resourceId: string;
  subject: string;
  opaDecision: boolean;
  kasDecision: boolean;
  divergence: boolean;
  reason?: string;
  policyVersion: string;
}

const auditLog: AuditEntry[] = [];

/**
 * Generate a new encryption key for a resource
 * Namespace: FRA-{keyId}
 */
function generateKey(resourceId: string): KeyRecord {
  const keyId = `FRA-${uuidv4()}`;
  const key = crypto.randomBytes(32).toString('base64'); // AES-256 key

  const record: KeyRecord = {
    keyId,
    resourceId,
    realm: INSTANCE_REALM,
    key,
    algorithm: 'AES-256-GCM',
    createdAt: new Date(),
    lastAccessed: new Date(),
    accessCount: 0,
    policyVersion: '1.0'
  };

  keyStore.set(resourceId, record);
  return record;
}

/**
 * Verify JWT token from request
 */
async function verifyToken(authHeader: string | undefined): Promise<any> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No valid authorization header');
  }

  const token = authHeader.substring(7);

  try {
    // In production, verify with Keycloak JWKS
    const secret = process.env.JWT_SECRET || 'fra-kas-secret';
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Re-evaluate authorization with OPA
 * GAP-005: Independent policy evaluation
 */
async function reEvaluateWithOPA(
  subject: any,
  resourceId: string,
  action: string,
  correlationId: string
): Promise<{ allow: boolean; reason: string }> {
  const opaUrl = process.env.OPA_URL || 'http://localhost:8182';

  try {
    // Fetch resource metadata
    const resourceResponse = await axios.get(
      `${process.env.BACKEND_URL || 'http://localhost:4001'}/api/resources/${resourceId}`,
      {
        headers: {
          'X-Correlation-ID': correlationId,
          'X-Origin-Service': 'KAS-FRA'
        }
      }
    );

    const resource = resourceResponse.data;

    // Build OPA input
    const opaInput = {
      input: {
        subject: {
          uniqueID: subject.uniqueID || subject.sub,
          clearance: subject.clearance,
          countryOfAffiliation: subject.countryOfAffiliation,
          acpCOI: subject.acpCOI || [],
          authenticated: true
        },
        action,
        resource: {
          resourceId: resource.resourceId,
          classification: resource.classification,
          releasabilityTo: resource.releasabilityTo,
          COI: resource.COI || [],
          originRealm: resource.originRealm || INSTANCE_REALM
        },
        context: {
          currentTime: new Date().toISOString(),
          sourceService: 'KAS-FRA',
          correlationId,
          kasReevaluation: true
        }
      }
    };

    // Call OPA
    const opaResponse = await axios.post(
      `${opaUrl}/v1/data/dive/authorization/decision`,
      opaInput
    );

    return {
      allow: opaResponse.data.result?.allow || false,
      reason: opaResponse.data.result?.reason || 'Policy evaluation failed'
    };
  } catch (error: any) {
    console.error(`[${correlationId}] OPA re-evaluation error:`, error.message);
    return {
      allow: false,
      reason: `OPA re-evaluation failed: ${error.message}`
    };
  }
}

/**
 * POST /keys/request
 * Request encryption key for a resource
 */
app.post('/keys/request', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { resourceId, action = 'decrypt' } = req.body;

  console.log(`[${correlationId}] Key request for resource ${resourceId}`);

  try {
    // Verify authentication
    const subject = await verifyToken(req.headers.authorization);

    // Re-evaluate with OPA (GAP-005: independent evaluation)
    const opaResult = await reEvaluateWithOPA(subject, resourceId, action, correlationId);

    // KAS makes independent decision
    let kasAllow = opaResult.allow;
    let divergence = false;

    // Additional KAS-specific checks
    if (kasAllow) {
      // Check if resource is from this realm
      const keyRecord = keyStore.get(resourceId);
      if (keyRecord && keyRecord.realm !== INSTANCE_REALM &&
        !subject.countryOfAffiliation?.includes(keyRecord.realm)) {
        kasAllow = false;
        divergence = true;
      }

      // Check key access frequency (anti-abuse)
      if (keyRecord && keyRecord.accessCount > 100) {
        kasAllow = false;
        divergence = true;
      }
    }

    // Log audit entry (GAP-005: divergence detection)
    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      correlationId,
      operation: kasAllow ? 'key_grant' : 'key_deny',
      resourceId,
      subject: subject.uniqueID || subject.sub,
      opaDecision: opaResult.allow,
      kasDecision: kasAllow,
      divergence,
      reason: opaResult.reason,
      policyVersion: '1.0'
    };

    auditLog.push(auditEntry);

    if (divergence) {
      console.warn(`[${correlationId}] DIVERGENCE DETECTED: OPA=${opaResult.allow}, KAS=${kasAllow}`);

      // Report divergence for investigation
      await reportDivergence(auditEntry);
    }

    if (!kasAllow) {
      return res.status(403).json({
        correlationId,
        error: 'Access denied',
        reason: opaResult.reason,
        kasAuthority: INSTANCE_REALM,
        divergence
      });
    }

    // Get or generate key
    let keyRecord = keyStore.get(resourceId);
    if (!keyRecord) {
      keyRecord = generateKey(resourceId);
      console.log(`[${correlationId}] Generated new key for ${resourceId}`);
    }

    // Update access tracking
    keyRecord.lastAccessed = new Date();
    keyRecord.accessCount++;

    // Return key with metadata
    res.json({
      correlationId,
      keyId: keyRecord.keyId,
      key: keyRecord.key,
      algorithm: keyRecord.algorithm,
      kasAuthority: INSTANCE_REALM,
      grantedAt: new Date(),
      obligations: {
        audit: true,
        watermark: true,
        expiresIn: 3600 // 1 hour
      }
    });

  } catch (error: any) {
    console.error(`[${correlationId}] Key request error:`, error);

    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      correlationId,
      operation: 'key_deny',
      resourceId,
      subject: 'unknown',
      opaDecision: false,
      kasDecision: false,
      divergence: false,
      reason: error.message,
      policyVersion: '1.0'
    };

    auditLog.push(auditEntry);

    res.status(500).json({
      correlationId,
      error: 'Key request failed',
      message: error.message,
      kasAuthority: INSTANCE_REALM
    });
  }
});

/**
 * POST /keys/rotate
 * Rotate encryption key for a resource
 */
app.post('/keys/rotate', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { resourceId } = req.body;

  try {
    // Verify admin authentication
    const subject = await verifyToken(req.headers.authorization);

    if (!subject.roles?.includes('admin')) {
      return res.status(403).json({
        correlationId,
        error: 'Admin access required'
      });
    }

    const oldKey = keyStore.get(resourceId);
    const newKey = generateKey(resourceId);

    console.log(`[${correlationId}] Key rotated for ${resourceId}`);

    res.json({
      correlationId,
      resourceId,
      oldKeyId: oldKey?.keyId,
      newKeyId: newKey.keyId,
      rotatedAt: new Date(),
      kasAuthority: INSTANCE_REALM
    });

  } catch (error: any) {
    console.error(`[${correlationId}] Key rotation error:`, error);
    res.status(500).json({
      correlationId,
      error: 'Key rotation failed',
      message: error.message
    });
  }
});

/**
 * GET /keys/audit
 * Get audit log for key operations
 */
app.get('/keys/audit', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { resourceId, limit = 100 } = req.query;

  try {
    let entries = auditLog;

    if (resourceId) {
      entries = entries.filter(e => e.resourceId === resourceId);
    }

    // Get divergence statistics
    const divergenceCount = entries.filter(e => e.divergence).length;
    const totalCount = entries.length;
    const divergenceRate = totalCount > 0 ? (divergenceCount / totalCount * 100).toFixed(2) : 0;

    res.json({
      correlationId,
      kasAuthority: INSTANCE_REALM,
      statistics: {
        total: totalCount,
        divergences: divergenceCount,
        divergenceRate: `${divergenceRate}%`,
        grants: entries.filter(e => e.operation === 'key_grant').length,
        denials: entries.filter(e => e.operation === 'key_deny').length
      },
      entries: entries.slice(-parseInt(limit as string))
    });

  } catch (error: any) {
    console.error(`[${correlationId}] Audit retrieval error:`, error);
    res.status(500).json({
      correlationId,
      error: 'Audit retrieval failed',
      message: error.message
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  res.json({
    correlationId,
    status: 'healthy',
    service: 'KAS-FRA',
    realm: INSTANCE_REALM,
    timestamp: new Date(),
    keyCount: keyStore.size,
    auditEntries: auditLog.length
  });
});

/**
 * GET /metrics
 * KAS metrics for monitoring
 */
app.get('/metrics', (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  // Calculate metrics
  const grantCount = auditLog.filter(e => e.operation === 'key_grant').length;
  const denyCount = auditLog.filter(e => e.operation === 'key_deny').length;
  const divergenceCount = auditLog.filter(e => e.divergence).length;

  const avgAccessPerKey = keyStore.size > 0
    ? Array.from(keyStore.values()).reduce((sum, k) => sum + k.accessCount, 0) / keyStore.size
    : 0;

  res.json({
    correlationId,
    kasAuthority: INSTANCE_REALM,
    metrics: {
      keys: {
        total: keyStore.size,
        avgAccessCount: avgAccessPerKey.toFixed(2)
      },
      operations: {
        grants: grantCount,
        denials: denyCount,
        divergences: divergenceCount,
        divergenceRate: auditLog.length > 0
          ? `${(divergenceCount / auditLog.length * 100).toFixed(2)}%`
          : '0%'
      },
      performance: {
        auditLogSize: auditLog.length,
        uptimeSeconds: process.uptime()
      }
    }
  });
});

/**
 * Report divergence for investigation
 * GAP-005: Multi-KAS divergence detection
 */
async function reportDivergence(entry: AuditEntry): Promise<void> {
  try {
    // In production, send to security monitoring system
    console.warn('SECURITY ALERT - KAS/OPA Divergence:', {
      timestamp: entry.timestamp,
      correlationId: entry.correlationId,
      resourceId: entry.resourceId,
      subject: entry.subject,
      opaDecision: entry.opaDecision,
      kasDecision: entry.kasDecision,
      realm: INSTANCE_REALM
    });

    // Could also send to SIEM, create incident ticket, etc.
    if (process.env.ALERT_WEBHOOK) {
      await axios.post(process.env.ALERT_WEBHOOK, {
        alert: 'KAS_DIVERGENCE',
        severity: 'HIGH',
        details: entry
      });
    }
  } catch (error) {
    console.error('Failed to report divergence:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`FRA KAS Server running on port ${PORT}`);
  console.log(`Realm: ${INSTANCE_REALM}`);
  console.log(`Key Namespace: FRA-*`);
  console.log(`OPA URL: ${process.env.OPA_URL || 'http://localhost:8182'}`);
  console.log(`Divergence Detection: Enabled`);
});










