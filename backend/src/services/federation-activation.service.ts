/**
 * DIVE V3 - Federation Activation Service
 *
 * Orchestrates federation activation for the V2 Zero Trust enrollment protocol.
 * Each side creates its own IdP locally using only the partner's OIDC client
 * metadata — no admin passwords cross the wire.
 *
 * Hub side: Auto-triggered when enrollment reaches `credentials_exchanged`.
 * Spoke side: Triggered via CLI after credential exchange completes.
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { logger } from '../utils/logger';
import type { IEnrollment } from '../models/enrollment.model';
import type { IFederationConfig, IFederationResult } from './keycloak-federation.service';
import type { ISpokeRegistration, ISpokeStore } from './registry-types';

// ============================================
// TYPES
// ============================================

export interface PartnerCredentials {
  oidcClientId: string;
  oidcClientSecret: string;
  oidcIssuerUrl: string;
  oidcDiscoveryUrl: string;
}

// ============================================
// FEDERATION ACTIVATION SERVICE
// ============================================

class FederationActivationService {
  /**
   * Create a local OIDC Identity Provider from partner's exchanged credentials.
   *
   * Shared by both Hub and Spoke sides. Each side only accesses its own Keycloak.
   * Uses the hybrid URL strategy: public URLs for browser redirects, internal
   * Docker URLs for backend-to-backend communication.
   *
   * @param partnerInstanceCode - Partner's instance code (e.g., 'GBR' for Spoke, 'USA' for Hub)
   * @param credentials - Partner's OIDC client metadata from credential exchange
   * @returns The created IdP result
   */
  async createLocalIdPFromCredentials(
    partnerInstanceCode: string,
    credentials: PartnerCredentials,
  ): Promise<IFederationResult> {
    const { keycloakFederationService } = await import('./keycloak-federation.service');
    const { getInternalKeycloakUrl, getInstanceName } = await import('./bidirectional-federation');

    // Parse issuerUrl to extract base URL and realm
    // e.g., 'https://localhost:8474/realms/dive-v3-broker-gbr'
    //   → idpBaseUrl: 'https://localhost:8474'
    //   → idpRealm: 'dive-v3-broker-gbr'
    const issuerUrl = credentials.oidcIssuerUrl;
    const realmMatch = issuerUrl.match(/^(https?:\/\/[^/]+)\/realms\/(.+)$/);
    if (!realmMatch) {
      throw new Error(
        `Cannot parse issuer URL: ${issuerUrl}. Expected format: https://host/realms/realm-name`,
      );
    }

    const idpBaseUrl = realmMatch[1]; // Public URL for browser redirects
    const idpRealm = realmMatch[2];   // e.g., 'dive-v3-broker-gbr'
    const code = partnerInstanceCode.toUpperCase();

    // Get internal Docker URL for backend-to-backend communication
    const idpInternalUrl = getInternalKeycloakUrl(code, idpBaseUrl);
    const displayName = getInstanceName(code);

    const config: IFederationConfig = {
      alias: `${code.toLowerCase()}-idp`,
      displayName,
      instanceCode: code,
      idpBaseUrl,
      idpInternalUrl,
      idpRealm,
      protocol: 'oidc',
      clientId: credentials.oidcClientId,
      clientSecret: credentials.oidcClientSecret,
      enabled: true,
      storeToken: true,
      syncMode: 'FORCE',
    };

    logger.info('Creating local IdP from V2 enrollment credentials', {
      alias: config.alias,
      partnerInstanceCode: code,
      idpBaseUrl,
      idpInternalUrl,
      idpRealm,
      clientId: credentials.oidcClientId,
    });

    const result = await keycloakFederationService.createOIDCIdentityProvider(config);

    logger.info('Local IdP created from enrollment credentials', {
      alias: result.alias,
      partnerInstanceCode: code,
      internalId: result.internalId,
    });

    return result;
  }

  /**
   * Activate federation on the Hub side after both credentials are exchanged.
   *
   * Creates a local IdP for the enrollee (spoke) and runs the full trust cascade:
   * trusted_issuers, federation_matrix, KAS registration, COI updates, OPAL sync.
   *
   * @param enrollment - The enrollment record (must be in `credentials_exchanged` state)
   */
  async activateHubSide(enrollment: IEnrollment): Promise<void> {
    const { enrollmentService } = await import('./enrollment.service');
    const { updateOPATrustForSpoke } = await import('./opal-trust');
    const { registerSpokeKAS, updateCoiMembershipsForFederation } = await import('./federation-cascade');
    const { createSpokeStore } = await import('./registry-types');

    if (enrollment.status !== 'credentials_exchanged') {
      throw new Error(
        `Cannot activate — enrollment is ${enrollment.status}, expected credentials_exchanged`,
      );
    }

    if (!enrollment.requesterCredentials) {
      throw new Error('Cannot activate — requester credentials not available');
    }

    const requesterCode = enrollment.requesterInstanceCode;

    logger.info('Activating Hub-side federation from V2 enrollment', {
      enrollmentId: enrollment.enrollmentId,
      requesterInstanceCode: requesterCode,
    });

    // Decrypt credentials if encrypted via Vault transit
    let requesterCredentials = enrollment.requesterCredentials;
    if (enrollment._secretsEncrypted) {
      const { enrollmentStore } = await import('../models/enrollment.model');
      const decrypted = await enrollmentStore.getDecryptedCredentials(
        enrollment.enrollmentId,
        'requester',
      );
      if (decrypted) requesterCredentials = decrypted as typeof requesterCredentials;
    }

    // Step 1: Create local IdP using requester's (spoke's) credentials
    const idpResult = await this.createLocalIdPFromCredentials(
      requesterCode,
      requesterCredentials,
    );

    logger.info('Hub-side IdP created', {
      enrollmentId: enrollment.enrollmentId,
      idpAlias: idpResult.alias,
    });

    // Step 2: Run trust cascade using a proxy ISpokeRegistration
    const spokeProxy = this.buildSpokeProxy(enrollment);

    // 2a: Add to trusted issuers + federation matrix
    try {
      await updateOPATrustForSpoke(spokeProxy, 'add');
      logger.info('OPA trust updated for V2 enrollment', {
        enrollmentId: enrollment.enrollmentId,
        instanceCode: requesterCode,
      });
    } catch (error) {
      logger.error('Failed to update OPA trust during V2 activation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 2b: Register spoke's KAS
    try {
      await registerSpokeKAS(spokeProxy);
      logger.info('KAS registered for V2 enrollment', {
        enrollmentId: enrollment.enrollmentId,
        kasId: `${requesterCode.toLowerCase()}-kas`,
      });
    } catch (error) {
      logger.error('Failed to register KAS during V2 activation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 2c: Update COI memberships
    try {
      const store = createSpokeStore();
      await updateCoiMembershipsForFederation(store);
      logger.info('COI memberships updated for V2 enrollment', {
        enrollmentId: enrollment.enrollmentId,
      });
    } catch (error) {
      logger.error('Failed to update COI during V2 activation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 3: Force OPAL data sync
    try {
      const { opalCdcService } = await import('./opal-cdc.service');
      await opalCdcService.forcePublishAll();
      logger.info('OPAL data synced after V2 activation', {
        enrollmentId: enrollment.enrollmentId,
      });
    } catch (error) {
      logger.error('OPAL sync failed after V2 activation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 3.5: Generate OPAL client token for the spoke (same as V1 flow)
    try {
      const { opalTokenService } = await import('./opal-token.service');
      if (opalTokenService.isConfigured()) {
        const opalClientToken = await opalTokenService.generateClientToken(
          enrollment.enrollmentId,
          requesterCode,
        );
        const { enrollmentStore } = await import('../models/enrollment.model');
        await enrollmentStore.updateOpalToken(enrollment.enrollmentId, opalClientToken.token);
        logger.info('OPAL client token generated for V2 enrollment', {
          enrollmentId: enrollment.enrollmentId,
          requesterInstanceCode: requesterCode,
        });
      }
    } catch (error) {
      logger.error('OPAL token generation failed during V2 activation (non-fatal)', {
        enrollmentId: enrollment.enrollmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 4: Transition enrollment to active
    await enrollmentService.activate(enrollment.enrollmentId);

    logger.info('Hub-side V2 federation activation complete', {
      enrollmentId: enrollment.enrollmentId,
      requesterInstanceCode: requesterCode,
      idpAlias: idpResult.alias,
    });
  }

  /**
   * Activate federation on the Spoke side after credential exchange.
   *
   * Creates a local IdP for the Hub and runs a local trust cascade:
   * trusted_issuers, federation_matrix, KAS registration, OPAL sync.
   *
   * Unlike Hub activation, this calls OPAL/MongoDB services directly because
   * `updateOPATrustForSpoke` and `registerSpokeKAS` assume spoke-style Docker
   * naming (dive-spoke-{code}-*), which is wrong for the Hub (dive-hub-*).
   *
   * @param partnerInstanceCode - Hub's instance code (e.g., 'USA')
   * @param partnerCredentials - Hub's OIDC client metadata
   * @param partnerKasUrl - Hub's KAS URL (optional, derived from instance code if not provided)
   */
  async activateSpokeSide(
    partnerInstanceCode: string,
    partnerCredentials: PartnerCredentials,
    partnerKasUrl?: string,
  ): Promise<IFederationResult> {
    const code = partnerInstanceCode.toUpperCase();
    const localInstanceCode = (process.env.INSTANCE_CODE || process.env.COUNTRY_CODE || 'USA').toUpperCase();

    logger.info('Activating Spoke-side federation from V2 enrollment', {
      partnerInstanceCode: code,
      localInstanceCode,
    });

    // Step 1: Create local IdP using partner's (Hub's) credentials
    const idpResult = await this.createLocalIdPFromCredentials(code, partnerCredentials);

    logger.info('Spoke-side IdP created', {
      idpAlias: idpResult.alias,
      partnerInstanceCode: code,
    });

    // Step 2: Add partner's issuer to local trusted_issuers
    try {
      const { opalDataService } = await import('./opal-data.service');

      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const issuerUrl = partnerCredentials.oidcIssuerUrl;

      await opalDataService.updateTrustedIssuer(issuerUrl, {
        tenant: code,
        name: `${code} Keycloak`,
        country: code,
        trust_level: 'HIGH',
        enabled: true,
        protocol: 'oidc',
        federation_class: isDevelopment ? 'LOCAL' : 'NATIONAL',
      });

      // Update federation matrix — add partner to local instance's partners
      const { getCurrentFederationPartners } = await import('./opal-trust');
      const currentPartners = await getCurrentFederationPartners(localInstanceCode);
      if (!currentPartners.includes(code)) {
        currentPartners.push(code);
        await opalDataService.updateFederationMatrix(localInstanceCode, currentPartners);
      }

      logger.info('Local OPA trust updated for partner', {
        partnerInstanceCode: code,
        issuerUrl,
      });
    } catch (error) {
      logger.error('Failed to update local OPA trust (non-fatal)', {
        partnerInstanceCode: code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 3: Register partner's KAS locally
    try {
      const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
      const { getPortOffsetForCountry, mapKASTrustLevel } = await import('./federation-cascade');
      const { getInstanceName } = await import('./bidirectional-federation');

      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const kasId = `${code.toLowerCase()}-kas`;

      // Check idempotent
      const existing = await mongoKasRegistryStore.findById(kasId);
      if (existing) {
        if (existing.status === 'suspended') {
          await mongoKasRegistryStore.approve(kasId);
        }
        logger.info('Partner KAS already registered locally', { kasId, status: existing.status });
      } else {
        const portOffset = getPortOffsetForCountry(code);

        // Hub-aware URL construction:
        // Hub uses dive-hub-kas, not dive-spoke-usa-kas
        const isHub = code === 'USA';
        const internalKasUrl = isHub
          ? 'https://dive-hub-kas:8080'
          : `https://dive-spoke-${code.toLowerCase()}-kas:8080`;
        const publicKasUrl = partnerKasUrl
          || (isDevelopment ? `https://localhost:${10000 + portOffset}` : `https://${code.toLowerCase()}-kas.dive25.com`);

        // Keycloak issuer for JWT validation
        const spokeKeycloakHttpsPort = isDevelopment ? (8443 + portOffset) : 443;
        const keycloakIssuer = isDevelopment
          ? `https://localhost:${spokeKeycloakHttpsPort}/realms/dive-v3-broker-${code.toLowerCase()}`
          : `https://${code.toLowerCase()}-idp.dive25.com/realms/dive-v3-broker-${code.toLowerCase()}`;

        await mongoKasRegistryStore.register({
          kasId,
          organization: getInstanceName(code),
          countryCode: code,
          kasUrl: publicKasUrl,
          internalKasUrl,
          authMethod: 'jwt',
          authConfig: { jwtIssuer: keycloakIssuer },
          trustLevel: mapKASTrustLevel('partner'),
          supportedCountries: [code],
          supportedCOIs: [],
          metadata: {
            version: '1.0.0',
            capabilities: ['encrypt', 'decrypt', 'rewrap', 'policy-evaluation'],
            contact: `admin@${code.toLowerCase()}.dive25.com`,
            registeredAt: new Date(),
            lastHeartbeat: new Date(),
          },
          enabled: true,
        });

        await mongoKasRegistryStore.approve(kasId);

        // Set up bidirectional federation agreement
        const hubAgreement = await mongoKasRegistryStore.getFederationAgreement(code);
        const hubTrustedKAS = hubAgreement?.trustedKAS || [];
        const localKasId = `${localInstanceCode.toLowerCase()}-kas`;
        if (!hubTrustedKAS.includes(localKasId)) {
          hubTrustedKAS.push(localKasId);
          await mongoKasRegistryStore.setFederationAgreement(code, hubTrustedKAS, 'SECRET', []);
        }

        await mongoKasRegistryStore.setFederationAgreement(
          localInstanceCode,
          [kasId],
          'SECRET',
          [],
        );

        logger.info('Partner KAS registered locally', {
          kasId,
          publicKasUrl,
          internalKasUrl,
        });
      }

      // Publish KAS registry to OPAL
      const { opalDataService } = await import('./opal-data.service');
      await opalDataService.publishKasRegistry();
    } catch (error) {
      logger.error('Failed to register partner KAS locally (non-fatal)', {
        partnerInstanceCode: code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Step 4: Force local OPAL sync
    try {
      const { opalCdcService } = await import('./opal-cdc.service');
      await opalCdcService.forcePublishAll();
      logger.info('Local OPAL data synced after spoke-side activation', {
        partnerInstanceCode: code,
      });
    } catch (error) {
      logger.error('Local OPAL sync failed (non-fatal)', {
        partnerInstanceCode: code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return idpResult;
  }

  /**
   * Build a minimal ISpokeRegistration proxy from enrollment data.
   *
   * The trust cascade functions (updateOPATrustForSpoke, registerSpokeKAS,
   * updateCoiMembershipsForFederation) expect ISpokeRegistration. We construct
   * a proxy with the fields they actually use.
   */
  private buildSpokeProxy(enrollment: IEnrollment): ISpokeRegistration {
    const code = enrollment.requesterInstanceCode.toUpperCase();
    const issuerUrl = enrollment.requesterCredentials?.oidcIssuerUrl || '';

    return {
      spokeId: enrollment.enrollmentId,
      instanceCode: code,
      name: enrollment.requesterInstanceName,
      description: `V2 enrollment: ${enrollment.enrollmentId}`,
      baseUrl: enrollment.requesterApiUrl,
      apiUrl: enrollment.requesterApiUrl,
      idpUrl: issuerUrl,
      idpPublicUrl: issuerUrl,
      status: 'approved',
      approvedAt: new Date(),
      allowedPolicyScopes: enrollment.requesterCapabilities || [],
      dataIsolationLevel: 'filtered',
      registeredAt: enrollment.createdAt,
      heartbeatIntervalMs: 30000,
      trustLevel: enrollment.requesterTrustLevel || 'partner',
      maxClassificationAllowed: 'SECRET',
      rateLimit: { requestsPerMinute: 60, burstSize: 100 },
      auditRetentionDays: 90,
    };
  }
}

// Singleton
export const federationActivationService = new FederationActivationService();
