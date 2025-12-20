/**
 * DIVE V3 - Federation Bootstrap Service
 *
 * Initializes the event-driven federation cascade system.
 * Wires Hub-Spoke Registry events to Federation Sync Service handlers.
 *
 * This is the CRITICAL missing piece that connects:
 * - Hub-Spoke Registry (event emitter) → Federation Sync Service (event handler)
 *
 * When a spoke is approved/suspended/revoked, this ensures:
 * 1. OPAL/OPA trusted issuers + federation matrix updated
 * 2. Keycloak IdP created/disabled
 * 3. MongoDB resources updated (releasabilityTo)
 * 4. Redis authorization cache invalidated
 * 5. Spoke webhooks sent (future)
 *
 * @version 1.0.0
 * @date 2025-12-20
 */

import { hubSpokeRegistry } from './hub-spoke-registry.service';
import {
  federationSyncService,
  ISpokeApprovedEvent,
  ISpokeSuspendedEvent,
  ISpokeRevokedEvent
} from './federation-sync.service';
import { logger } from '../utils/logger';

// ============================================
// FEDERATION BOOTSTRAP SERVICE
// ============================================

class FederationBootstrapService {
  private initialized = false;
  private eventHandlersRegistered = false;

  /**
   * Initialize the federation cascade system
   *
   * This MUST be called on Hub startup to enable:
   * - Automatic OPAL/OPA updates on spoke approval
   * - Automatic MongoDB resource updates
   * - Automatic cache invalidation
   * - Keycloak IdP creation
   *
   * Should only be called on Hub instance (not on spokes)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('Federation bootstrap already initialized');
      return;
    }

    const isHub = process.env.SPOKE_MODE !== 'true';
    const instanceCode = process.env.INSTANCE_CODE || 'USA';

    if (!isHub) {
      logger.info('Skipping federation bootstrap - running in spoke mode', {
        instanceCode,
        spokeMode: process.env.SPOKE_MODE
      });
      this.initialized = true;
      return;
    }

    logger.info('Initializing federation bootstrap service', {
      instanceCode,
      isHub: true
    });

    try {
      // Initialize the federation sync service (connects to MongoDB)
      await federationSyncService.initialize();

      // Wire up event subscriptions
      this.registerEventHandlers();

      this.initialized = true;

      logger.info('Federation bootstrap service initialized successfully', {
        instanceCode,
        eventsWired: ['spoke:approved', 'spoke:suspended', 'spoke:revoked'],
        cascadeEnabled: true
      });
    } catch (error) {
      logger.error('Failed to initialize federation bootstrap service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Register event handlers for Hub-Spoke Registry events
   *
   * This is the critical wiring that was previously missing!
   */
  private registerEventHandlers(): void {
    if (this.eventHandlersRegistered) {
      logger.warn('Event handlers already registered');
      return;
    }

    // ============================================
    // SPOKE APPROVED EVENT
    // ============================================
    hubSpokeRegistry.on('spoke:approved', async (event: ISpokeApprovedEvent) => {
      const { spoke, correlationId } = event;

      logger.info('Received spoke:approved event - starting cascade', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        correlationId
      });

      try {
        const startTime = Date.now();
        const result = await federationSyncService.onSpokeApproved(event);
        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info('Federation cascade completed successfully for spoke approval', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            correlationId,
            updates: result.updates,
            durationMs: duration
          });
        } else {
          logger.warn('Federation cascade completed with errors for spoke approval', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            correlationId,
            updates: result.updates,
            errors: result.errors,
            durationMs: duration
          });
        }

        // Emit cascade completion event for monitoring
        hubSpokeRegistry.emit('cascade:completed', {
          type: 'approval',
          spoke: spoke.spokeId,
          result,
          duration
        });
      } catch (error) {
        logger.error('Federation cascade FAILED for spoke approval', {
          spokeId: spoke.spokeId,
          instanceCode: spoke.instanceCode,
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });

        // Emit cascade failure event for alerting
        hubSpokeRegistry.emit('cascade:failed', {
          type: 'approval',
          spoke: spoke.spokeId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // SPOKE SUSPENDED EVENT
    // ============================================
    hubSpokeRegistry.on('spoke:suspended', async (event: ISpokeSuspendedEvent) => {
      const { spoke, correlationId } = event;

      logger.warn('Received spoke:suspended event - starting cascade', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        reason: event.reason,
        correlationId
      });

      try {
        const startTime = Date.now();
        const result = await federationSyncService.onSpokeSuspended(event);
        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info('Federation cascade completed successfully for spoke suspension', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            correlationId,
            updates: result.updates,
            durationMs: duration
          });
        } else {
          logger.warn('Federation cascade completed with errors for spoke suspension', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            correlationId,
            updates: result.updates,
            errors: result.errors,
            durationMs: duration
          });
        }
      } catch (error) {
        logger.error('Federation cascade FAILED for spoke suspension', {
          spokeId: spoke.spokeId,
          instanceCode: spoke.instanceCode,
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ============================================
    // SPOKE REVOKED EVENT
    // ============================================
    hubSpokeRegistry.on('spoke:revoked', async (event: ISpokeRevokedEvent) => {
      const { spoke, correlationId } = event;

      logger.error('Received spoke:revoked event - starting cascade', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        reason: event.reason,
        correlationId
      });

      try {
        const startTime = Date.now();
        const result = await federationSyncService.onSpokeRevoked(event);
        const duration = Date.now() - startTime;

        logger.info('Federation cascade completed for spoke revocation', {
          spokeId: spoke.spokeId,
          instanceCode: spoke.instanceCode,
          correlationId,
          updates: result.updates,
          errors: result.errors,
          durationMs: duration
        });
      } catch (error) {
        logger.error('Federation cascade FAILED for spoke revocation', {
          spokeId: spoke.spokeId,
          instanceCode: spoke.instanceCode,
          correlationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.eventHandlersRegistered = true;

    logger.info('Federation event handlers registered', {
      events: ['spoke:approved', 'spoke:suspended', 'spoke:revoked']
    });
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service status for health checks
   */
  getStatus(): {
    initialized: boolean;
    eventHandlersRegistered: boolean;
    isHub: boolean;
    instanceCode: string;
  } {
    return {
      initialized: this.initialized,
      eventHandlersRegistered: this.eventHandlersRegistered,
      isHub: process.env.SPOKE_MODE !== 'true',
      instanceCode: process.env.INSTANCE_CODE || 'USA'
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const federationBootstrap = new FederationBootstrapService();

export default FederationBootstrapService;

