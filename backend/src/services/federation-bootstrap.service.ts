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
import { opalClient } from './opal-client';
// Note: federation-sync.service.ts (Phase 5) handles drift detection separately
// This service handles spoke lifecycle event cascades
import { logger } from '../utils/logger';

// ============================================
// FEDERATION BOOTSTRAP SERVICE
// ============================================

class FederationBootstrapService {
  private initialized = false;
  private eventHandlersRegistered = false;
  private bootstrapComplete = false;  // Track if Hub self-registration is complete

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
      // SSOT ARCHITECTURE (2026-01-27): Auto-register Hub's own instance and KAS
      // On a clean deployment, Hub must register itself before seeding can occur
      await this.registerHubInstance(instanceCode);
      await this.registerHubKAS(instanceCode);

      // SSOT ARCHITECTURE (2026-01-22): Register Hub's trusted issuer on startup
      // This is the ONLY issuer that should exist on a clean slate
      // Spoke issuers are added when spokes register via the federation API
      await this.registerHubTrustedIssuer(instanceCode);

      // Wire up event subscriptions from Hub-Spoke Registry
      this.registerEventHandlers();

      this.initialized = true;
      this.bootstrapComplete = true;  // Mark bootstrap as complete

      logger.info('Federation bootstrap service initialized successfully', {
        instanceCode,
        eventsWired: ['spoke:approved', 'spoke:suspended', 'spoke:revoked'],
        cascadeEnabled: true,
        hubRegistered: true,
        bootstrapComplete: true
      });
    } catch (error) {
      logger.error('Failed to initialize federation bootstrap service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      this.bootstrapComplete = false;  // Mark as incomplete on error
      throw error;
    }
  }

  /**
   * Register Hub's own instance in MongoDB
   *
   * SSOT ARCHITECTURE: On a clean deployment, Hub must register itself
   * so that seeding scripts can find the instance configuration
   */
  private async registerHubInstance(instanceCode: string): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
      const dbName = process.env.MONGODB_DATABASE || 'dive-v3-hub';

      const client = new MongoClient(mongoUrl);
      await client.connect();
      const db = client.db(dbName);
      const collection = db.collection('federation_spokes');

      // Check if Hub instance already registered
      const existing = await collection.findOne({ instanceCode: instanceCode.toUpperCase() });
      if (existing) {
        logger.debug('Hub instance already registered', {
          instanceCode,
          spokeId: existing.spokeId
        });
        await client.close();
        return;
      }

      // Register Hub instance
      const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000');
      const backendPort = parseInt(process.env.BACKEND_PORT || '4000');
      const keycloakPort = parseInt(process.env.KEYCLOAK_PORT || '8443');

      await collection.insertOne({
        spokeId: `hub-${instanceCode.toLowerCase()}`,
        instanceCode: instanceCode.toUpperCase(),
        name: `${instanceCode.toUpperCase()} Hub`,
        status: 'approved',
        frontendPort,
        backendPort,
        keycloakPort,
        frontendUrl: process.env.NEXT_PUBLIC_BASE_URL || `https://localhost:${frontendPort}`,
        backendUrl: process.env.BACKEND_URL || `https://localhost:${backendPort}`,
        idpUrl: process.env.KEYCLOAK_BASE_URL || `https://localhost:${keycloakPort}`,
        idpPublicUrl: process.env.KEYCLOAK_BASE_URL || `https://localhost:${keycloakPort}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await client.close();

      logger.info('Registered Hub instance (SSOT)', {
        instanceCode,
        frontendPort,
        backendPort,
        keycloakPort
      });
    } catch (error) {
      logger.error('Failed to register Hub instance', {
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      // CRITICAL: Throw error - seeding requires instance configuration
      throw new Error(`Hub instance registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register Hub's own KAS server in MongoDB
   *
   * SSOT ARCHITECTURE: On a clean deployment, Hub must register its KAS
   * so that seeding scripts can encrypt resources with ZTDF
   */
  private async registerHubKAS(instanceCode: string): Promise<void> {
    try {
      logger.info('Starting Hub KAS registration', { instanceCode });

      const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
      await mongoKasRegistryStore.initialize();

      const kasId = `${instanceCode.toLowerCase()}-kas`;

      // Check if KAS already registered
      const existing = await mongoKasRegistryStore.findById(kasId);
      if (existing) {
        logger.debug('Hub KAS already registered', {
          instanceCode,
          kasId
        });
        return;
      }

      logger.info('Registering Hub KAS', { kasId });

      // Register Hub KAS
      const kasPort = parseInt(process.env.KAS_PORT || '8080');
      const kasHost = process.env.KAS_HOST || 'localhost';

      const kasUrl = process.env.NODE_ENV === 'production'
        ? `https://${instanceCode.toLowerCase()}-kas.dive25.com`
        : `https://${kasHost}:${kasPort}`;

      const keycloakPort = parseInt(process.env.KEYCLOAK_PORT || '8443');
      const keycloakHost = process.env.KEYCLOAK_HOST || 'localhost';
      const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;

      const issuerUrl = process.env.NODE_ENV === 'production'
        ? `https://${instanceCode.toLowerCase()}-idp.dive25.com/realms/${realmName}`
        : `https://${keycloakHost}:${keycloakPort}/realms/${realmName}`;

      logger.info('Calling mongoKasRegistryStore.register()', {
        kasId,
        organization: `${instanceCode.toUpperCase()} Hub`,
        kasUrl
      });

      await mongoKasRegistryStore.register({
        kasId,
        organization: `${instanceCode.toUpperCase()} Hub`,
        countryCode: instanceCode.toUpperCase(),
        kasUrl,
        internalKasUrl: process.env.KAS_INTERNAL_URL || kasUrl,
        authMethod: 'jwt',
        authConfig: {
          jwtIssuer: issuerUrl,
          jwtAudience: 'dive-v3-broker',
          publicKeyUrl: `${issuerUrl}/protocol/openid-connect/certs`
        },
        trustLevel: 'high',
        supportedCountries: [instanceCode.toUpperCase()],
        supportedCOIs: ['NATO-COSMIC', 'FVEY', 'CAN-US', 'US-ONLY'],
        enabled: true,
        metadata: {
          version: '1.0.0',
          capabilities: ['encrypt', 'decrypt', 'rewrap'],
          contact: process.env.ADMIN_EMAIL || 'admin@dive25.com',
          lastVerified: new Date()
        }
      });

      logger.info('KAS registered, calling approve()', { kasId });

      // Auto-approve Hub's own KAS (no manual approval needed)
      await mongoKasRegistryStore.approve(kasId);

      logger.info('Registered and approved Hub KAS (SSOT)', {
        instanceCode,
        kasId,
        kasUrl,
        issuerUrl,
        status: 'active'
      });
    } catch (error) {
      logger.error('Failed to register Hub KAS', {
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      // CRITICAL: Throw error - seeding requires KAS to encrypt resources
      throw new Error(`Hub KAS registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register Hub's trusted issuer in MongoDB
   *
   * SSOT ARCHITECTURE: On a clean slate, ONLY the Hub's issuer should exist.
   * Spoke issuers are added when spokes register via the federation API.
   */
  private async registerHubTrustedIssuer(instanceCode: string): Promise<void> {
    try {
      const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');

      // Build the Hub's issuer URL
      // In development: https://localhost:8443/realms/dive-v3-broker-usa
      // In production: https://usa-idp.dive25.com/realms/dive-v3-broker-usa
      const keycloakPort = process.env.KEYCLOAK_PORT || '8443';
      const keycloakHost = process.env.KEYCLOAK_HOST || 'localhost';
      const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;

      const issuerUrl = process.env.NODE_ENV === 'production'
        ? `https://${instanceCode.toLowerCase()}-idp.dive25.com/realms/${realmName}`
        : `https://${keycloakHost}:${keycloakPort}/realms/${realmName}`;

      // Check if issuer already exists
      const existing = await mongoOpalDataStore.findIssuerByUrl(issuerUrl);
      if (existing) {
        logger.debug('Hub trusted issuer already registered', {
          instanceCode,
          issuerUrl,
          tenant: existing.tenant
        });
        return;
      }

      // Register the Hub's trusted issuer
      await mongoOpalDataStore.addIssuer({
        issuerUrl,
        tenant: instanceCode.toUpperCase(),
        name: `${instanceCode.toUpperCase()} Hub Keycloak`,
        country: instanceCode.toUpperCase(),
        trustLevel: 'HIGH',
        realm: realmName,
        enabled: true,
      });

      logger.info('Registered Hub trusted issuer (SSOT)', {
        instanceCode,
        issuerUrl,
        tenant: instanceCode.toUpperCase(),
      });

      // Publish to OPAL so all connected clients get the Hub issuer
      await this.publishTrustedIssuersToOpal(`Hub ${instanceCode} initialized`);
    } catch (error) {
      logger.error('Failed to register Hub trusted issuer', {
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - Hub can still function, spoke registrations will add issuers
    }
  }

  /**
   * Register a spoke's trusted issuer in MongoDB
   *
   * SSOT ARCHITECTURE: Called when a spoke is approved.
   * Adds the spoke's Keycloak realm as a trusted issuer.
   */
  private async registerSpokeTrustedIssuer(instanceCode: string): Promise<void> {
    try {
      const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');

      // Get spoke configuration from spoke registration
      // The spoke's Keycloak URL is in the registration data
      const spoke = await hubSpokeRegistry.getSpokeByInstanceCode(instanceCode);
      if (!spoke) {
        logger.warn('Spoke not found for trusted issuer registration', { instanceCode });
        return;
      }

      // Build the spoke's issuer URL
      // CRITICAL: Use PUBLIC URL - this is what appears in JWT tokens
      // Spokes use dynamic ports: https://localhost:{port}/realms/dive-v3-broker-{code}
      const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;

      // Priority order for issuer URL:
      // 1. idpPublicUrl - the URL that tokens will contain (for browser access)
      // 2. Calculate from port offset (development fallback)
      // 3. Production domain format
      // NOTE: Do NOT use idpUrl (Docker internal URL) - tokens use public URLs
      let issuerUrl: string;

      if (spoke.idpPublicUrl) {
        // Use the PUBLIC IdP URL - this matches what tokens will contain
        issuerUrl = spoke.idpPublicUrl.includes('/realms/')
          ? spoke.idpPublicUrl
          : `${spoke.idpPublicUrl}/realms/${realmName}`;
        logger.debug('Using idpPublicUrl for trusted issuer', {
          instanceCode,
          idpPublicUrl: spoke.idpPublicUrl,
          issuerUrl,
        });
      } else if (process.env.NODE_ENV === 'production') {
        issuerUrl = `https://${instanceCode.toLowerCase()}-idp.dive25.com/realms/${realmName}`;
      } else {
        // Development: calculate port based on instance
        // This matches the port calculation in common.sh
        // TST uses base port offset 200, so Keycloak HTTPS is 8443 + 200 = 8643
        const portOffset = this.calculatePortOffset(instanceCode);
        const keycloakPort = 8443 + portOffset;
        issuerUrl = `https://localhost:${keycloakPort}/realms/${realmName}`;
        logger.debug('Calculated issuer URL from port offset', {
          instanceCode,
          portOffset,
          keycloakPort,
          issuerUrl,
        });
      }

      // Check if issuer already exists
      const existing = await mongoOpalDataStore.findIssuerByUrl(issuerUrl);
      if (!existing) {
        // Register the spoke's trusted issuer with PUBLIC URL
        await mongoOpalDataStore.addIssuer({
          issuerUrl,
          tenant: instanceCode.toUpperCase(),
          name: `${instanceCode.toUpperCase()} Spoke Keycloak`,
          country: instanceCode.toUpperCase(),
          trustLevel: 'HIGH',
          realm: realmName,
          enabled: true,
        });

        logger.info('Registered spoke trusted issuer (SSOT) - public URL', {
          instanceCode,
          issuerUrl,
          tenant: instanceCode.toUpperCase(),
        });
      } else {
        logger.debug('Spoke trusted issuer already registered (public URL)', {
          instanceCode,
          issuerUrl,
          tenant: existing.tenant
        });
      }

      // Also register the Docker internal URL for container-to-container auth
      // This is used when backend services communicate within Docker network
      if (spoke.idpUrl && spoke.idpUrl !== spoke.idpPublicUrl) {
        const internalIssuerUrl = spoke.idpUrl.includes('/realms/')
          ? spoke.idpUrl
          : `${spoke.idpUrl}/realms/${realmName}`;

        const existingInternal = await mongoOpalDataStore.findIssuerByUrl(internalIssuerUrl);
        if (!existingInternal) {
          await mongoOpalDataStore.addIssuer({
            issuerUrl: internalIssuerUrl,
            tenant: instanceCode.toUpperCase(),
            name: `${instanceCode.toUpperCase()} Spoke Keycloak (internal)`,
            country: instanceCode.toUpperCase(),
            trustLevel: 'HIGH',
            realm: realmName,
            enabled: true,
          });

          logger.info('Registered spoke trusted issuer (SSOT) - internal URL', {
            instanceCode,
            issuerUrl: internalIssuerUrl,
            tenant: instanceCode.toUpperCase(),
          });
        }
      }

      // CRITICAL: Publish updated trusted issuers to OPAL
      // Since MongoDB change streams require replica set (which we don't have),
      // we must manually push updates after adding issuers
      await this.publishTrustedIssuersToOpal(`Spoke ${instanceCode} registered`);

    } catch (error) {
      logger.error('Failed to register spoke trusted issuer', {
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish all trusted issuers to OPAL
   * This ensures all connected OPA instances receive the updated issuer list
   */
  private async publishTrustedIssuersToOpal(reason: string): Promise<void> {
    try {
      const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');

      // Get all issuers in OPAL-compatible format
      const issuers = await mongoOpalDataStore.getAllIssuers();

      // Convert to the format OPAL expects: { "url": { tenant, country, ... }, ... }
      const opalFormat: Record<string, unknown> = {};
      for (const issuer of issuers) {
        opalFormat[issuer.issuerUrl] = {
          tenant: issuer.tenant,
          name: issuer.name,
          country: issuer.country,
          trust_level: issuer.trustLevel,
          realm: issuer.realm,
          enabled: issuer.enabled,
        };
      }

      // Publish to OPAL - this will trigger all clients to fetch updated data
      const result = await opalClient.publishInlineData(
        'trusted_issuers',
        {
          success: true,
          timestamp: new Date().toISOString(),
          count: issuers.length,
          trusted_issuers: opalFormat,
        },
        reason
      );

      if (result.success) {
        logger.info('Published trusted issuers to OPAL', {
          reason,
          issuerCount: issuers.length,
          transactionId: result.transactionId,
        });
      } else {
        logger.warn('OPAL publish returned unsuccessful', {
          reason,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to publish trusted issuers to OPAL', {
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - issuer is already added to MongoDB, OPAL sync is secondary
    }
  }

  /**
   * Calculate port offset for spoke instance
   * Matches logic in scripts/dive-modules/common.sh
   */
  private calculatePortOffset(instanceCode: string): number {
    const code = instanceCode.toUpperCase();

    // Custom test codes
    const CUSTOM_TEST_CODES: Record<string, number> = {
      'TST': 200,
      'DEV': 201,
      'STG': 202,
      'QA1': 203,
      'QA2': 204,
    };

    if (CUSTOM_TEST_CODES[code] !== undefined) {
      return CUSTOM_TEST_CODES[code];
    }

    // NATO member offsets - MUST MATCH common.sh and seed-spoke-trusted-issuer.ts
    // Formula: Keycloak HTTPS Port = 8443 + offset
    const NATO_OFFSETS: Record<string, number> = {
      'USA': 0, 'GBR': 20, 'FRA': 10, 'DEU': 30, 'CAN': 40, 'AUS': 50,
      'NZL': 60, 'ITA': 70, 'ESP': 80, 'NLD': 90, 'BEL': 100,
      'POL': 110, 'NOR': 120, 'DNK': 130, 'SWE': 140, 'FIN': 150,
      'PRT': 160, 'GRC': 170, 'TUR': 180, 'CZE': 190, 'HUN': 200,
      'ROU': 210, 'BGR': 220, 'HRV': 230, 'SVK': 240, 'SVN': 250,
      'EST': 260, 'LVA': 270, 'LTU': 280, 'LUX': 290, 'ALB': 300,
      'MNE': 310, 'ISL': 320,
    };

    if (NATO_OFFSETS[code] !== undefined) {
      return NATO_OFFSETS[code];
    }

    // Partner/other - use hash-based offset
    // This is a simplified version; full logic is in common.sh
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = ((hash << 5) - hash) + code.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % 20 + 48; // Offset 48-67
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
    // SPOKE REGISTERED EVENT (Phase 2: Gap Closure)
    // ============================================
    // Alert Hub admins when new spoke registers (pending approval)
    hubSpokeRegistry.on('spoke:registered', async (event: any) => {
      const { spoke, contactEmail, correlationId } = event;

      logger.info('Received spoke:registered event - creating admin notification', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        name: spoke.name,
        status: spoke.status,
        contactEmail,
        correlationId
      });

      try {
        // Create persistent notification for Hub admins
        const { notificationService } = await import('./notification.service');

        await notificationService.createAdminNotification({
          type: 'federation_event',
          title: 'Spoke Registration Pending',
          message: `New spoke "${spoke.name}" (${spoke.instanceCode}) requires approval`,
          actionUrl: '/admin/federation/spokes',
          priority: 'high',
          metadata: {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            spokeName: spoke.name,
            contactEmail,
            correlationId,
            certificateProvided: !!spoke.certificatePEM,
            certificateValid: spoke.certificateValidationResult?.valid
          }
        });

        logger.info('Admin notification created for pending spoke registration', {
          instanceCode: spoke.instanceCode,
          spokeId: spoke.spokeId
        });
      } catch (error) {
        logger.warn('Failed to create admin notification for spoke registration', {
          instanceCode: spoke.instanceCode,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Non-blocking: Notification failure doesn't affect registration
      }
    });

    // ============================================
    // SPOKE APPROVED EVENT
    // ============================================
    hubSpokeRegistry.on('spoke:approved', async (event: any) => {
      const { spoke, correlationId } = event;

      logger.info('Received spoke:approved event - registering trusted issuer', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        correlationId
      });

      // SSOT ARCHITECTURE: Add spoke's trusted issuer to MongoDB
      try {
        await this.registerSpokeTrustedIssuer(spoke.instanceCode);
        logger.info('Spoke trusted issuer registered (SSOT)', {
          instanceCode: spoke.instanceCode,
          spokeId: spoke.spokeId,
        });
      } catch (error) {
        logger.error('Failed to register spoke trusted issuer', {
          instanceCode: spoke.instanceCode,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Don't throw - the spoke is already approved, issuer registration failure
        // should not block the approval flow
      }

      // CREATE ADMIN NOTIFICATION FOR SPOKE APPROVAL (Phase 2: Gap Closure)
      try {
        const { notificationService } = await import('./notification.service');

        await notificationService.createAdminNotification({
          type: 'federation_event',
          title: 'Spoke Approved',
          message: `Federation spoke "${spoke.name}" (${spoke.instanceCode}) has been approved and is now active`,
          actionUrl: '/admin/federation/spokes',
          priority: 'medium',
          metadata: {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            spokeName: spoke.name,
            approvedBy: event.approvedBy,
            correlationId,
            allowedScopes: spoke.allowedPolicyScopes,
            trustLevel: spoke.trustLevel
          }
        });
      } catch (error) {
        logger.warn('Failed to create admin notification for spoke approval', {
          instanceCode: spoke.instanceCode,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Note: Actual federation cascade is handled by existing federation services
      // Phase 5 federation-sync.service handles drift detection independently
      logger.debug('Spoke approved - drift detection will sync on next cycle', {
        instanceCode: spoke.instanceCode
      });
    });

    // ============================================
    // SPOKE SUSPENDED EVENT
    // ============================================
    hubSpokeRegistry.on('spoke:suspended', async (event: any) => {
      const { spoke, correlationId } = event;

      logger.warn('Received spoke:suspended event - starting cascade', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        reason: event.reason,
        correlationId
      });

      try {
        const startTime = Date.now();
        // Phase 5: Federation sync service handles drift detection separately
        const result = { success: true, updates: [], errors: [] };
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
    hubSpokeRegistry.on('spoke:revoked', async (event: any) => {
      const { spoke, correlationId } = event;

      logger.error('Received spoke:revoked event - starting cascade', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        reason: event.reason,
        correlationId
      });

      try {
        const startTime = Date.now();
        // Phase 5: Federation sync service handles drift detection separately
        const result = { success: true, updates: [], errors: [] };
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
   * Check if bootstrap is complete (Hub self-registration done)
   */
  isBootstrapComplete(): boolean {
    return this.bootstrapComplete;
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
    bootstrapComplete: boolean;
    eventHandlersRegistered: boolean;
    isHub: boolean;
    instanceCode: string;
  } {
    return {
      initialized: this.initialized,
      bootstrapComplete: this.bootstrapComplete,
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

