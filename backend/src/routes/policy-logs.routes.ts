/**
 * Real-Time OPAL Log Viewer API
 * Streams actual Docker logs from OPAL server, clients, and OPA instances
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';
import { authenticateJWT } from '../middleware/authz.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

/**
 * GET /api/admin/logs/opal-server
 * Stream OPAL server logs in real-time (SSE)
 */
router.get('/api/admin/logs/opal-server',
  authenticateJWT,
  requireRole(['admin', 'policy-admin']),
  (req: Request, res: Response) => {
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logger.info('Starting OPAL server log stream', {
      user: (req as any).user?.uniqueID
    });

    // Spawn docker logs process
    const dockerLogs = spawn('docker', ['logs', '-f', '--tail', '100', 'dive-hub-opal-server']);

    // Send logs to client
    dockerLogs.stdout.on('data', (data) => {
      const logLines = data.toString().split('\n');
      logLines.forEach((line: string) => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({
            type: 'log',
            source: 'opal-server',
            message: line,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      });
    });

    dockerLogs.stderr.on('data', (data) => {
      const logLines = data.toString().split('\n');
      logLines.forEach((line: string) => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({
            type: 'log',
            source: 'opal-server',
            level: 'error',
            message: line,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      });
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.info('OPAL server log stream closed');
      dockerLogs.kill();
      res.end();
    });

    // Keep-alive ping
    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAliveInterval);
    });
  }
);

/**
 * GET /api/admin/logs/opa/:instance
 * Stream OPA instance logs (hub, fra, gbr)
 */
router.get('/api/admin/logs/opa/:instance',
  authenticateJWT,
  requireRole(['admin', 'policy-admin']),
  (req: Request, res: Response) => {
    const { instance } = req.params;
    
    // Validate instance
    const validInstances = ['hub', 'fra', 'gbr', 'rou', 'dnk', 'alb'];
    if (!validInstances.includes(instance.toLowerCase())) {
      res.status(400).json({ error: 'Invalid instance' });
      return;
    }

    const containerName = instance === 'hub' 
      ? 'dive-hub-opa' 
      : `dive-spoke-${instance.toLowerCase()}-opa`;

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logger.info('Starting OPA log stream', {
      instance,
      containerName,
      user: (req as any).user?.uniqueID
    });

    // Spawn docker logs process
    const dockerLogs = spawn('docker', ['logs', '-f', '--tail', '50', containerName]);

    dockerLogs.stdout.on('data', (data) => {
      const logLines = data.toString().split('\n');
      logLines.forEach((line: string) => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({
            type: 'log',
            source: `opa-${instance}`,
            message: line,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      });
    });

    dockerLogs.stderr.on('data', (data) => {
      const logLines = data.toString().split('\n');
      logLines.forEach((line: string) => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({
            type: 'log',
            source: `opa-${instance}`,
            level: 'error',
            message: line,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      });
    });

    // Handle errors
    dockerLogs.on('error', (error) => {
      logger.error('Docker logs error', { error, containerName });
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: `Failed to stream logs from ${containerName}`,
        timestamp: new Date().toISOString()
      })}\n\n`);
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.info('OPA log stream closed', { instance });
      dockerLogs.kill();
      res.end();
    });

    // Keep-alive ping
    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAliveInterval);
    });
  }
);

/**
 * GET /api/admin/logs/aggregate
 * Aggregate logs from all sources with filtering
 */
router.get('/api/admin/logs/aggregate',
  authenticateJWT,
  requireRole(['admin', 'policy-admin']),
  (req: Request, res: Response) => {
    const { filter } = req.query;
    const filterPattern = filter as string || 'policy|update|broadcast|reload';

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logger.info('Starting aggregate log stream', {
      filter: filterPattern,
      user: (req as any).user?.uniqueID
    });

    // Spawn docker logs for OPAL server
    const opalLogs = spawn('docker', ['logs', '-f', '--tail', '50', 'dive-hub-opal-server']);
    
    opalLogs.stdout.on('data', (data) => {
      const logLines = data.toString().split('\n');
      logLines.forEach((line: string) => {
        if (line.trim() && new RegExp(filterPattern, 'i').test(line)) {
          res.write(`data: ${JSON.stringify({ 
            type: 'log', 
            source: 'opal-server',
            message: line,
            highlighted: true,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      });
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.info('Aggregate log stream closed');
      opalLogs.kill();
      res.end();
    });

    // Keep-alive ping
    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAliveInterval);
    });
  }
);

export default router;
