/**
 * WebSocket Server for Real-Time Policy Updates
 * Broadcasts policy distribution workflow events to connected clients
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { policyEventEmitter } from '../routes/policy-admin.routes';
import jwt from 'jsonwebtoken';

export function setupPolicyWebSocket(server: HTTPServer) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/policy-updates',
    verifyClient: (info, callback) => {
      // Extract token from query string or headers
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || info.req.headers['sec-websocket-protocol'];

      if (!token) {
        callback(false, 401, 'Unauthorized');
        return;
      }

      try {
        // Verify JWT token
        const JWKS_URI = process.env.KEYCLOAK_JWKS_URI || '';
        // In production, verify with JWKS
        // For now, basic validation
        const decoded = jwt.decode(token) as any;
        
        if (!decoded || !decoded.uniqueID) {
          callback(false, 401, 'Invalid token');
          return;
        }

        // Check if user has admin role
        const roles = decoded.realm_access?.roles || [];
        if (!roles.includes('admin') && !roles.includes('policy-admin')) {
          callback(false, 403, 'Forbidden: Insufficient permissions');
          return;
        }

        // Store user info in request for later use
        (info.req as any).user = decoded;
        callback(true);
      } catch (error) {
        logger.error('WebSocket auth failed', { error });
        callback(false, 401, 'Authentication failed');
      }
    }
  });

  // Track connected clients
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket, req) => {
    const user = (req as any).user;
    
    logger.info('Policy WebSocket client connected', {
      user: user?.uniqueID,
      clientCount: clients.size + 1
    });

    clients.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to policy update stream',
      timestamp: new Date().toISOString()
    }));

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;
            
          case 'subscribe':
            // Client wants to subscribe to specific policy updates
            logger.info('Client subscribed to policy updates', {
              user: user?.uniqueID,
              filters: message.filters
            });
            break;
            
          default:
            logger.warn('Unknown WebSocket message type', { type: message.type });
        }
      } catch (error) {
        logger.error('Failed to parse WebSocket message', { error });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      clients.delete(ws);
      logger.info('Policy WebSocket client disconnected', {
        user: user?.uniqueID,
        clientCount: clients.size
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { error, user: user?.uniqueID });
      clients.delete(ws);
    });
  });

  // Broadcast policy updates to all connected clients
  policyEventEmitter.on('policy-update', (event) => {
    const message = JSON.stringify({
      type: 'policy_update',
      data: event,
      timestamp: new Date().toISOString()
    });

    broadcast(clients, message);
    
    logger.info('Broadcasting policy update', {
      eventType: event.type,
      recipients: clients.size
    });
  });

  // Broadcast workflow stage updates
  policyEventEmitter.on('workflow-stage', (event) => {
    const message = JSON.stringify({
      type: 'workflow_stage',
      data: event,
      timestamp: new Date().toISOString()
    });

    broadcast(clients, message);
    
    logger.debug('Broadcasting workflow stage', {
      stage: event.stage,
      status: event.status,
      recipients: clients.size
    });
  });

  // Heartbeat to keep connections alive
  const heartbeatInterval = setInterval(() => {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        }));
      }
    });
  }, 30000); // Every 30 seconds

  // Cleanup on server shutdown
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clients.forEach(client => client.close());
    logger.info('Policy WebSocket server closed');
  });

  logger.info('Policy WebSocket server initialized', {
    path: '/ws/policy-updates'
  });

  return wss;
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(clients: Set<WebSocket>, message: string) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Broadcast to specific clients based on filter
 */
export function broadcastToFiltered(
  clients: Set<WebSocket>, 
  message: string, 
  filter: (ws: WebSocket) => boolean
) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && filter(client)) {
      client.send(message);
    }
  });
}
