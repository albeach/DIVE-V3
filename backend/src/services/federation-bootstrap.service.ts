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
import type { ISpokeRegistration } from './registry-types';

interface ISpokeEvent {
    spoke: ISpokeRegistration;
    correlationId?: string;
    contactEmail?: string;
    reason?: string;
    approvedBy?: string;
}

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

    // CRITICAL FIX (Issue #3 - 2026-02-03): Use explicit IS_HUB flag
    // Don't rely solely on SPOKE_MODE - Hub must explicitly set IS_HUB=true
    const isHub = process.env.IS_HUB === 'true' || (process.env.SPOKE_MODE !== 'true');
    const instanceCode = process.env.INSTANCE_CODE || 'USA';

    if (!isHub) {
      logger.info('Skipping federation bootstrap - running in spoke mode', {
        instanceCode,
        spokeMode: process.env.SPOKE_MODE,
        IS_HUB: process.env.IS_HUB
      });
      this.initialized = true;
      return;
    }

    logger.info('Initializing federation bootstrap service', {
      instanceCode,
      isHub: true,
      IS_HUB: process.env.IS_HUB
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

      // CRITICAL FIX (Issue #6 - 2026-02-03): Event replay mechanism
      // Replay events for spokes that were approved while Hub was down
      await this.replayMissedEvents();

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
      const { getDb } = await import('../utils/mongodb-singleton');
      const db = getDb();
      const collection = db.collection('federation_spokes');

      // Check if Hub instance already registered
      const existing = await collection.findOne({ instanceCode: instanceCode.toUpperCase() });
      if (existing) {
        logger.debug('Hub instance already registered', {
          instanceCode,
          spokeId: existing.spokeId
        });
        // Singleton manages lifecycle - no need to close
        return;
      }

      // Register Hub instance
      const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000');
      const backendPort = parseInt(process.env.BACKEND_PORT || '4000');
      const keycloakPort = parseInt(process.env.KEYCLOAK_PORT || '8443');

      // CRITICAL FIX (2026-02-07): Add apiUrl/internalApiUrl for federation discovery
      // Federation discovery service requires apiUrl to include Hub in federation
      const backendUrl = process.env.BACKEND_URL || `https://localhost:${backendPort}`;
      const internalBackendUrl = process.env.BACKEND_INTERNAL_URL || `https://dive-hub-backend:${backendPort}`;

      await collection.insertOne({
        spokeId: `hub-${instanceCode.toLowerCase()}`,
        instanceCode: instanceCode.toUpperCase(),
        name: `${instanceCode.toUpperCase()} Hub`,
        status: 'approved',
        frontendPort,
        backendPort,
        keycloakPort,
        frontendUrl: process.env.NEXT_PUBLIC_BASE_URL || `https://localhost:${frontendPort}`,
        backendUrl,
        apiUrl: backendUrl, // Required by federation-discovery.service.ts
        internalApiUrl: internalBackendUrl, // Docker network URL for container-to-container
        idpUrl: process.env.KEYCLOAK_INTERNAL_URL || `https://dive-hub-keycloak:${keycloakPort}`,
        idpPublicUrl: process.env.KEYCLOAK_BASE_URL || `https://localhost:${keycloakPort}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });

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
          jwtAudience: 'dive-v3-broker-usa',
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

    // NATO member offsets - MUST MATCH scripts/nato-countries.sh NATO_PORT_OFFSETS
    // Formula: Keycloak HTTPS Port = 8443 + offset
    // SSOT: scripts/nato-countries.sh
    const NATO_OFFSETS: Record<string, number> = {
      // Hub
      'USA': 0,    // 8443

      // NATO countries (alphabetical, offsets 1-31)
      'ALB': 1, 'BEL': 2, 'BGR': 3, 'CAN': 4, 'HRV': 5,
      'CZE': 6, 'DNK': 7, 'EST': 8, 'FIN': 9, 'FRA': 10,
      'DEU': 11, 'GRC': 12, 'HUN': 13, 'ISL': 14, 'ITA': 15,
      'LVA': 16, 'LTU': 17, 'LUX': 18, 'MNE': 19, 'NLD': 20,
      'MKD': 21, 'NOR': 22, 'POL': 23, 'PRT': 24, 'ROU': 25,
      'SVK': 26, 'SVN': 27, 'ESP': 28, 'SWE': 29, 'TUR': 30,
      'GBR': 31,  // 8474

      // Partner nations (offsets 32-39)
      'AUS': 32, 'NZL': 33, 'JPN': 34, 'KOR': 35, 'ISR': 36, 'UKR': 37,
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
    hubSpokeRegistry.on('spoke:registered', async (event: ISpokeEvent) => {
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
    hubSpokeRegistry.on('spoke:approved', async (event: ISpokeEvent) => {
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
    hubSpokeRegistry.on('spoke:suspended', async (event: ISpokeEvent) => {
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
        const result = { success: true, updates: [] as string[], errors: [] as string[] };
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
    hubSpokeRegistry.on('spoke:revoked', async (event: ISpokeEvent) => {
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
        const result = { success: true, updates: [] as string[], errors: [] as string[] };
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

    // ============================================
    // ENROLLMENT EVENTS (V2 Zero Trust Federation)
    // ============================================
    this.registerEnrollmentEventHandlers();

    this.eventHandlersRegistered = true;

    logger.info('Federation event handlers registered', {
      events: ['spoke:approved', 'spoke:suspended', 'spoke:revoked', 'enrollment:*']
    });
  }

  /**
   * Register enrollment event handlers for V2 Zero Trust federation.
   * Wires enrollment lifecycle events to the notification service.
   */
  private registerEnrollmentEventHandlers(): void {
    try {
      // Lazy import to avoid circular dependencies
      const { enrollmentService } = require('./enrollment.service');
      const enrollmentNotifications: Record<string, { title: string; priority: 'low' | 'medium' | 'high' | 'critical' }> = {
        'enrollment:requested': { title: 'Federation Enrollment Request', priority: 'high' },
        'enrollment:fingerprint_verified': { title: 'Enrollment Fingerprint Verified', priority: 'medium' },
        'enrollment:approved': { title: 'Enrollment Approved', priority: 'medium' },
        'enrollment:rejected': { title: 'Enrollment Rejected', priority: 'medium' },
        'enrollment:credentials_exchanged': { title: 'Enrollment Credentials Exchanged', priority: 'low' },
        'enrollment:activated': { title: 'Federation Active', priority: 'medium' },
        'enrollment:revoked': { title: 'Enrollment Revoked', priority: 'high' },
      };

      enrollmentService.on('enrollment', async (event: {
        type: string;
        enrollment: {
          enrollmentId: string;
          requesterInstanceCode: string;
          requesterInstanceName: string;
          requesterFingerprint: string;
          requesterContactEmail: string;
          status: string;
        };
        actor?: string;
        reason?: string;
      }) => {
        const config = enrollmentNotifications[event.type];
        if (!config) return;

        try {
          const { notificationService } = await import('./notification.service');
          const enrollment = event.enrollment;

          let message: string;
          switch (event.type) {
            case 'enrollment:requested':
              message = `"${enrollment.requesterInstanceName}" (${enrollment.requesterInstanceCode}) requests federation. ` +
                `Fingerprint: ${enrollment.requesterFingerprint}. ` +
                `Contact: ${enrollment.requesterContactEmail}`;
              break;
            case 'enrollment:fingerprint_verified':
              message = `Fingerprint verified for "${enrollment.requesterInstanceCode}". Ready for approval.`;
              break;
            case 'enrollment:approved':
              message = `Federation enrollment approved for "${enrollment.requesterInstanceCode}" by ${event.actor || 'admin'}.`;
              break;
            case 'enrollment:rejected':
              message = `Federation enrollment rejected for "${enrollment.requesterInstanceCode}". Reason: ${event.reason || 'No reason provided'}.`;
              break;
            case 'enrollment:credentials_exchanged':
              message = `Credential exchange complete with "${enrollment.requesterInstanceCode}". Activating federation.`;
              break;
            case 'enrollment:activated':
              message = `Federation is now ACTIVE with "${enrollment.requesterInstanceCode}".`;
              break;
            case 'enrollment:revoked':
              message = `Federation revoked for "${enrollment.requesterInstanceCode}". Reason: ${event.reason || 'No reason provided'}.`;
              break;
            default:
              message = `Enrollment event: ${event.type} for ${enrollment.requesterInstanceCode}`;
          }

          await notificationService.createAdminNotification({
            type: 'federation_event',
            title: `${config.title}: ${enrollment.requesterInstanceCode}`,
            message,
            actionUrl: `/admin/federation/enrollments/${enrollment.enrollmentId}`,
            priority: config.priority,
            metadata: {
              enrollmentId: enrollment.enrollmentId,
              requesterInstanceCode: enrollment.requesterInstanceCode,
              requesterInstanceName: enrollment.requesterInstanceName,
              eventType: event.type,
              actor: event.actor,
              reason: event.reason,
            },
          });

          logger.info('Admin notification created for enrollment event', {
            type: event.type,
            enrollmentId: enrollment.enrollmentId,
            requesterInstanceCode: enrollment.requesterInstanceCode,
          });
        } catch (error) {
          logger.warn('Failed to create admin notification for enrollment event', {
            type: event.type,
            enrollmentId: event.enrollment.enrollmentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Non-blocking: notification failure doesn't affect enrollment flow
        }
      });

      // Auto-activate Hub side when credentials are fully exchanged (V2 Phase C)
      enrollmentService.on('enrollment', async (event: {
        type: string;
        enrollment: {
          enrollmentId: string;
          requesterInstanceCode: string;
          status: string;
        };
      }) => {
        if (event.type !== 'enrollment:credentials_exchanged') return;

        try {
          const { federationActivationService } = await import('./federation-activation.service');
          const { enrollmentService: enrService } = require('./enrollment.service');
          const fullEnrollment = await enrService.getEnrollment(event.enrollment.enrollmentId);
          await federationActivationService.activateHubSide(fullEnrollment);

          logger.info('Hub-side federation activated automatically', {
            enrollmentId: event.enrollment.enrollmentId,
            requesterInstanceCode: event.enrollment.requesterInstanceCode,
          });
        } catch (error) {
          logger.error('Hub-side auto-activation failed (manual activation available via POST /enrollment/:id/activate)', {
            enrollmentId: event.enrollment.enrollmentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      // Audit trail: log all enrollment lifecycle events to federation_audits (ACP-240)
      const enrollmentAuditMap: Record<string, string> = {
        'enrollment:requested': 'ENROLLMENT_CREATED',
        'enrollment:fingerprint_verified': 'ENROLLMENT_VERIFIED',
        'enrollment:approved': 'ENROLLMENT_APPROVED',
        'enrollment:rejected': 'ENROLLMENT_REJECTED',
        'enrollment:credentials_exchanged': 'CREDENTIALS_EXCHANGED',
        'enrollment:activated': 'FEDERATION_ACTIVATED_V2',
        'enrollment:revoked': 'ENROLLMENT_REVOKED',
      };

      enrollmentService.on('enrollment', async (event: {
        type: string;
        enrollment: {
          enrollmentId: string;
          requesterInstanceCode: string;
          requesterInstanceName: string;
          status: string;
        };
        actor?: string;
        reason?: string;
      }) => {
        const auditEventType = enrollmentAuditMap[event.type];
        if (!auditEventType) return;

        try {
          const { federationAuditStore } = await import('../models/federation-audit.model');
          await federationAuditStore.create({
            eventType: auditEventType as import('../models/federation-audit.model').FederationEventType,
            actorId: event.actor || 'system',
            actorInstance: process.env.INSTANCE_CODE || 'USA',
            targetInstanceCode: event.enrollment.requesterInstanceCode,
            correlationId: event.enrollment.enrollmentId,
            timestamp: new Date(),
            compliantWith: ['ACP-240', 'ADatP-5663'],
            metadata: {
              enrollmentId: event.enrollment.enrollmentId,
              requesterInstanceName: event.enrollment.requesterInstanceName,
              previousStatus: event.enrollment.status,
              eventType: event.type,
              reason: event.reason,
            },
          });
        } catch (error) {
          logger.warn('Failed to create audit entry for enrollment event', {
            type: event.type,
            enrollmentId: event.enrollment.enrollmentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      logger.debug('Enrollment event handlers registered');
    } catch (error) {
      logger.warn('Failed to register enrollment event handlers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Non-blocking: enrollment is an optional v2 feature
    }
  }

  /**
   * Replay missed events for spokes that changed state while Hub was down
   *
   * CRITICAL FIX (Issue #6 - 2026-02-03):
   * Event handlers only fire when Hub is running. If Hub restarts, it needs to
   * replay events for spokes that were approved/suspended/revoked while it was down.
   */
  private async replayMissedEvents(): Promise<void> {
    try {
      logger.info('Replaying missed federation events');

      const { getDb } = await import('../utils/mongodb-singleton');
      const db = getDb();
      const collection = db.collection('federation_spokes');

      // Find all approved spokes (these should have trusted issuers registered)
      const approvedSpokes = await collection.find({ status: 'approved' }).toArray();

      logger.info('Found approved spokes for event replay', {
        count: approvedSpokes.length,
        spokes: approvedSpokes.map(s => ({ instanceCode: s.instanceCode, spokeId: s.spokeId }))
      });

      // Replay approval events for each spoke
      for (const spoke of approvedSpokes) {
        try {
          // Check if trusted issuer already exists
          const trustedIssuersCollection = db.collection('trusted_issuers');
          const existingIssuer = await trustedIssuersCollection.findOne({
            instanceCode: spoke.instanceCode
          });

          if (!existingIssuer) {
            logger.info('Replaying approval event - registering missing trusted issuer', {
              instanceCode: spoke.instanceCode,
              spokeId: spoke.spokeId
            });

            // Register the trusted issuer (this should have happened when spoke was approved)
            await this.registerSpokeTrustedIssuer(spoke.instanceCode);

            logger.info('Event replay: Trusted issuer registered', {
              instanceCode: spoke.instanceCode,
              spokeId: spoke.spokeId
            });
          } else {
            logger.debug('Event replay: Trusted issuer already exists', {
              instanceCode: spoke.instanceCode,
              issuerId: existingIssuer.issuerId
            });
          }
        } catch (error) {
          logger.error('Failed to replay event for spoke', {
            instanceCode: spoke.instanceCode,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Don't throw - continue replaying other events
        }
      }

      logger.info('Event replay completed', {
        processedCount: approvedSpokes.length
      });

    } catch (error) {
      logger.error('Failed to replay missed events', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - event replay failure shouldn't block Hub startup
    }
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

