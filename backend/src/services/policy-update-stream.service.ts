/**
 * Policy Update Stream Service
 *
 * Provides Server-Sent Events (SSE) for real-time policy update notifications.
 * Integrates with OPAL CDC to notify frontends when policies or data change.
 *
 * Best Practice: Event-driven real-time updates (not polling)
 *
 * Phase 5, Task 5.5 - Real-Time UI Updates
 * Date: 2026-01-29
 */

import { EventEmitter } from 'events';
import { Response } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Types
// ============================================

export interface IPolicyUpdateEvent {
  type: 'policy_bundle' | 'policy_data' | 'federation_constraints' | 'trusted_issuers' | 'tenant_configs';
  timestamp: string;
  source: string;
  details?: Record<string, any>;
}

// ============================================
// Policy Update Stream Service
// ============================================

class PolicyUpdateStreamService extends EventEmitter {
  private clients: Set<Response> = new Set();
  private updateCount = 0;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for various policy update sources
   */
  private setupEventHandlers(): void {
    // Listen for OPAL CDC events (from opal-cdc.service.ts)
    this.on('opal_data_update', (topic: string) => {
      this.broadcastUpdate({
        type: topic as any,
        timestamp: new Date().toISOString(),
        source: 'opal_cdc',
        details: { topic },
      });
    });

    // Listen for policy bundle updates
    this.on('policy_bundle_update', (details: Record<string, unknown>) => {
      this.broadcastUpdate({
        type: 'policy_bundle',
        timestamp: new Date().toISOString(),
        source: 'policy_bundle_service',
        details,
      });
    });
  }

  /**
   * Register a new SSE client connection
   */
  registerClient(res: Response): void {
    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Add to active clients
    this.clients.add(res);

    logger.info('SSE client connected for policy updates', {
      clientCount: this.clients.size,
    });

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(res);
      logger.info('SSE client disconnected', {
        clientCount: this.clients.size,
      });
    });

    // Keep connection alive with heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    res.on('close', () => clearInterval(heartbeat));
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(event: IPolicyUpdateEvent): void {
    this.updateCount++;
    const eventData = JSON.stringify(event);

    logger.debug('Broadcasting policy update to SSE clients', {
      eventType: event.type,
      clientCount: this.clients.size,
      updateNumber: this.updateCount,
    });

    // Send to all connected clients
    for (const client of this.clients) {
      if (!client.writableEnded) {
        try {
          client.write(`data: ${eventData}\n\n`);
        } catch (error) {
          logger.error('Failed to write to SSE client', { error });
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Notify of policy bundle update
   */
  notifyPolicyBundleUpdate(details?: Record<string, any>): void {
    this.emit('policy_bundle_update', details);
  }

  /**
   * Notify of OPAL data update
   */
  notifyDataUpdate(topic: string): void {
    this.emit('opal_data_update', topic);
  }

  /**
   * Get service status
   */
  getStatus(): { clients: number; updates: number } {
    return {
      clients: this.clients.size,
      updates: this.updateCount,
    };
  }

  /**
   * Shutdown service (disconnect all clients)
   */
  shutdown(): void {
    for (const client of this.clients) {
      if (!client.writableEnded) {
        client.end();
      }
    }
    this.clients.clear();
    logger.info('Policy update stream service shut down');
  }
}

// Export singleton instance
export const policyUpdateStream = new PolicyUpdateStreamService();

export default PolicyUpdateStreamService;
